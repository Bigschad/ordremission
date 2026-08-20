import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { nomFichierPdf, rendrePdfAvecCache } from '@/lib/pdf/render';
import { getUtilisateurCourant } from '@/lib/session';
import { aVueGlobale } from '@/lib/mission/queries';

/** @react-pdf/renderer et Prisma imposent le runtime Node. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Téléchargement du PDF d'un ordre de mission.
 *
 * Le document est généré à la demande et n'est jamais stocké : l'offre
 * gratuite ne comporte pas de service de stockage. Un cache mémoire de 60 s
 * évite de régénérer le même document en rafale.
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const utilisateur = await getUtilisateurCourant();

  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Authentification requise.' }, { status: 401 });
  }

  const { id } = await contexte.params;

  // Règle 9 : un collaborateur n'accède qu'à ses propres ordres de mission.
  const mission = await prisma.missionOrder.findFirst({
    where: { id, ...(aVueGlobale(utilisateur) ? {} : { demandeurId: utilisateur.id }) },
  });

  if (!mission) {
    return NextResponse.json({ erreur: 'Ordre de mission introuvable.' }, { status: 404 });
  }

  const buffer = await rendrePdfAvecCache(mission);

  await logAudit({
    entite: 'MissionOrder',
    entiteId: mission.id,
    action: 'PDF_GENERATED',
    acteur: utilisateur.email,
    details: { numero: mission.numero },
  });

  const nomFichier = nomFichierPdf(mission.numero, mission.nom);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nomFichier}"`,
      'Content-Length': String(buffer.byteLength),
      // Document nominatif : jamais mis en cache par un intermédiaire.
      'Cache-Control': 'private, no-store',
    },
  });
}
