import { execSync } from 'node:child_process';
import { config as chargerEnv } from 'dotenv';

/**
 * Applique les migrations sur la base de test avant la campagne E2E.
 * Les données sont ensuite préparées par `e2e/aide.ts`, scénario par scénario.
 */
export default function globalSetup(): void {
  chargerEnv({ path: '.env.test', override: true });
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
