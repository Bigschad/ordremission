import { preparerBaseTest } from '../scripts/preparer-base-test';

/**
 * Prépare la base avant la campagne unitaire.
 * SQLite par défaut ; `pnpm test:pg` bascule sur PostgreSQL.
 */
export default function setup(): void {
  if (process.env.SKIP_DB_SETUP === 'true') return;
  preparerBaseTest();
}
