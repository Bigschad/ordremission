import { z } from 'zod';

/**
 * Validation des variables d'environnement.
 *
 * Les variables ne sont lues qu'au premier accès (`env.X`) : cela évite de
 * faire échouer le build Next.js, qui exécute du code de module sans que les
 * secrets d'exécution soient nécessairement présents.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET est requis'),
  AUTH_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Ordres de mission Porteo <om@porteo-group.com>'),
  HR_EMAIL: z.string().default('rh@porteo-group.com'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** `file` court-circuite Resend et écrit les e-mails sur disque (tests E2E). */
  EMAIL_TRANSPORT: z.enum(['resend', 'file']).default('resend'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Adresses RH, `HR_EMAIL` pouvant contenir plusieurs adresses séparées par des virgules. */
export function getHrRecipients(): string[] {
  return getEnv()
    .HR_EMAIL.split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

export function getAppUrl(): string {
  return getEnv().APP_URL.replace(/\/$/, '');
}
