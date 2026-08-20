import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { config as chargerEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * Les tests s'exécutent par défaut sur **SQLite** (`.env.test`) : aucune
 * infrastructure n'est nécessaire. `pnpm test:pg` rejoue la même suite sur
 * PostgreSQL, le moteur de production, en superposant `.env.test.pg` — c'est
 * la seule configuration qui valide les garanties de concurrence.
 */
export default defineConfig(({ mode }) => {
  chargerEnv({ path: '.env.test', override: true });

  if (mode === 'pg') {
    chargerEnv({ path: '.env.test.pg', override: true });
    process.env.TEST_DB = 'pg';
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      globalSetup: ['tests/global-setup.ts'],
      // Les suites partagent le même schéma : on évite les exécutions
      // concurrentes de fichiers pour garder des résultats stables.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 120_000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/lib/**/*.ts', 'src/lib/**/*.tsx'],
        exclude: [
          'src/lib/prisma.ts',
          'src/lib/auth.ts',
          'src/lib/auth.config.ts',
          'src/lib/email/templates/**',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 75,
        },
      },
    },
  };
});
