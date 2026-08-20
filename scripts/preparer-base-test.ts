/**
 * Prépare la base des campagnes de test.
 *
 *   pnpm test:db            → SQLite (défaut, aucune infrastructure)
 *   TEST_DB=pg pnpm test:db → PostgreSQL, le moteur de production
 *
 * Le client Prisma embarque son moteur : il doit donc être régénéré **avant**
 * que quoi que ce soit ne l'importe. C'est la raison pour laquelle cette
 * préparation est un script à part, appelé aussi bien par Vitest que par la
 * commande de démarrage du serveur de Playwright.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { config as chargerEnv } from 'dotenv';

export function preparerBaseTest(): void {
  chargerEnv({ path: '.env.test', override: true });
  if (process.env.TEST_DB === 'pg') {
    chargerEnv({ path: '.env.test.pg', override: true });
  }

  const url = process.env.DATABASE_URL ?? '';

  if (url.startsWith('file:')) {
    // Prisma résout un chemin relatif par rapport au dossier du schéma.
    const fichier = url.replace(/^file:/, '');
    const chemin = fichier.startsWith('/') ? fichier : `prisma/${fichier.replace(/^\.\//, '')}`;

    for (const suffixe of ['', '-journal', '-wal', '-shm']) {
      rmSync(`${chemin}${suffixe}`, { force: true });
    }

    execSync('pnpm db:sqlite', { stdio: 'inherit', env: process.env });
    return;
  }

  execSync('pnpm exec prisma generate', { stdio: 'inherit', env: process.env });
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}

// Exécution directe : `pnpm test:db`.
if (process.argv[1]?.endsWith('preparer-base-test.ts')) {
  preparerBaseTest();
}
