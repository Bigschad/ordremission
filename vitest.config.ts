import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { config as chargerEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Les tests s'exécutent contre la base dédiée décrite dans .env.test.
chargerEnv({ path: '.env.test', override: true });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globalSetup: ['tests/global-setup.ts'],
    // Les tests touchant la base partagent le même schéma : on évite les
    // exécutions concurrentes de fichiers pour garder des résultats stables.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
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
});
