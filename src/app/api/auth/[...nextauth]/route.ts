import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;

// Prisma et Resend imposent le runtime Node.
export const runtime = 'nodejs';
