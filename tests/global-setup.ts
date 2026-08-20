import { execSync } from 'node:child_process';
import { config as chargerEnv } from 'dotenv';

/**
 * Prépare la base de test avant toute exécution.
 *
 * On applique les migrations (opération non destructive) ; l'isolation entre
 * tests est assurée par `reinitialiserBase()`, qui vide les tables métier au
 * début de chaque suite.
 */
export default function setup(): void {
  chargerEnv({ path: '.env.test', override: true });

  if (process.env.SKIP_DB_SETUP === 'true') return;

  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
