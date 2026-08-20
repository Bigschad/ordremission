import { config as chargerEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Les tests E2E s'exécutent contre la base et la configuration de .env.test.
chargerEnv({ path: '.env.test', override: true });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chemin explicite si le navigateur est préinstallé hors du cache Playwright.
        ...(process.env.CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: {
    /*
     * La base et le client Prisma sont préparés par `pnpm test:db`, appelé en
     * amont de `playwright test` (voir package.json) : le client embarque son
     * moteur et il est importé dès le chargement des fichiers de test. Le
     * régénérer depuis Playwright créerait une course entre le processus de
     * test et le serveur.
     */
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL + '/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      // Le serveur doit viser la base de test et écrire les e-mails sur disque.
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      DIRECT_URL: process.env.DIRECT_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? '',
      AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      EMAIL_TRANSPORT: 'file',
      NODE_ENV: 'development',
    },
  },
});
