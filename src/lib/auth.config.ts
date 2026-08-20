import type { NextAuthConfig } from 'next-auth';

/**
 * Configuration partagée, **compatible edge** : aucun import de Prisma,
 * de Resend ou de Node ici. Elle sert au middleware, qui ne fait qu'une
 * vérification grossière « session présente ou non ».
 *
 * Le contrôle d'accès réel (rôle, compte actif) est refait côté serveur dans
 * chaque Server Action et chaque page — jamais uniquement dans le middleware.
 */
export const authConfig = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verification',
    error: '/login/erreur',
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
