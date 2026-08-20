/**
 * Active le mode WAL sur la base SQLite.
 *
 * Par défaut, SQLite verrouille tout le fichier pendant une écriture : le
 * serveur Next.js et le processus de test, qui ouvrent chacun leur connexion,
 * se bloquent mutuellement. Le journal WAL autorise les lectures concurrentes
 * pendant une écriture, ce qui rend l'usage à deux processus viable.
 *
 * Le réglage est persistant : il est inscrit dans le fichier de base.
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';

  if (!url.startsWith('file:')) {
    console.log('Base non SQLite : aucun réglage WAL à appliquer.');
    return;
  }

  const prisma = new PrismaClient();

  try {
    const mode = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>(
      'PRAGMA journal_mode=WAL;',
    );
    // `PRAGMA` renvoie une ligne : il faut donc `$queryRawUnsafe`, même
    // lorsqu'on ne s'intéresse pas au résultat.
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=10000;');

    console.log(`✓ SQLite : journal_mode = ${mode[0]?.journal_mode ?? 'inconnu'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Impossible de configurer SQLite :', error);
  process.exitCode = 1;
});
