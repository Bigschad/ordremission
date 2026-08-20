/**
 * Génère des PDF d'exemple à partir du jeu de données de démonstration.
 *
 *   pnpm pdf:exemples [dossier]
 *
 * Utile pour comparer visuellement le rendu au formulaire papier et pour
 * illustrer la documentation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MissionStatus, PrismaClient } from '@prisma/client';
import { nomFichierPdf, rendrePdf } from '@/lib/pdf/render';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const dossier = path.resolve(process.argv[2] ?? 'pdf-exemples');
  mkdirSync(dossier, { recursive: true });

  // La fiche de référence, puis un exemplaire de chaque statut.
  const reference = await prisma.missionOrder.findFirst({
    where: { objet: 'Visite chantier', lieu: 'Assinie' },
  });

  const parStatut = await Promise.all(
    Object.values(MissionStatus).map((status) =>
      prisma.missionOrder.findFirst({ where: { status }, orderBy: { createdAt: 'asc' } }),
    ),
  );

  const missions = [reference, ...parStatut].filter((mission) => mission !== null);
  const vues = new Set<string>();

  for (const mission of missions) {
    if (vues.has(mission.id)) continue;
    vues.add(mission.id);

    const buffer = await rendrePdf(mission);
    const nom = `${mission.status}_${nomFichierPdf(mission.numero, mission.nom)}`;
    writeFileSync(path.join(dossier, nom), buffer);
    console.log(`✓ ${nom} — ${(buffer.byteLength / 1024).toFixed(1)} Ko`);
  }

  console.log(`\n${vues.size} PDF générés dans ${dossier}`);
}

main()
  .catch((error: unknown) => {
    console.error('✗ Échec de génération :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
