import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * En production serverless (Neon), on passe par le driver HTTP/WebSocket
 * `@neondatabase/serverless` via `@prisma/adapter-neon` : indispensable car les
 * fonctions Vercel ne peuvent pas maintenir un pool TCP entre deux invocations.
 *
 * En local (Postgres classique) et dans les tests, on garde le moteur natif.
 */
function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? '';
  const isNeon = /neon\.(tech|build)/.test(url);

  if (isNeon) {
    // Imports dynamiques : ces paquets ne sont pas nécessaires hors Neon.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } = require('@prisma/adapter-neon') as typeof import('@prisma/adapter-neon');
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
