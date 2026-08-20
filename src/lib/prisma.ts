import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

declare global {
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
  const log = process.env.NODE_ENV === 'development' ? (['warn', 'error'] as const) : (['error'] as const);

  if (/neon\.(tech|build)/.test(url)) {
    return new PrismaClient({
      adapter: new PrismaNeon({ connectionString: url }),
      log: [...log],
    });
  }

  return new PrismaClient({ log: [...log] });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
