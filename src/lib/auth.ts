import { PrismaAdapter } from '@auth/prisma-adapter';
import { render } from '@react-email/components';
import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import Resend from 'next-auth/providers/resend';
import { authConfig } from '@/lib/auth.config';
import { logAudit } from '@/lib/audit';
import { envoyerEmail } from '@/lib/email/transport';
import { MagicLinkEmail } from '@/lib/email/templates/magic-link';
import { getEnv } from '@/lib/env';
import { prisma } from '@/lib/prisma';

/** Durée de validité du lien de connexion. */
const MAGIC_LINK_MAX_AGE_SECONDS = 15 * 60;

/**
 * L'adapter Prisma est bridé : **aucun compte n'est créé automatiquement**.
 * Les collaborateurs sont enregistrés par un administrateur ; recevoir un
 * magic link ne doit jamais suffire à ouvrir un compte.
 */
function adapterSansAutoInscription(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: () => {
      throw new Error(
        "Cette adresse n'est rattachée à aucun collaborateur. Contactez les Ressources Humaines.",
      );
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  adapter: adapterSansAutoInscription(),
  providers: [
    Resend({
      id: 'email',
      name: 'Lien de connexion',
      apiKey: process.env.RESEND_API_KEY ?? 'non-configure',
      from: process.env.EMAIL_FROM ?? 'om@porteo-group.com',
      maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
      /**
       * Envoi maison : gabarit React Email et transport commun à toute
       * l'application (donc utilisable en test via `EMAIL_TRANSPORT=file`).
       */
      async sendVerificationRequest({ identifier, url }) {
        const email = identifier.toLowerCase().trim();

        // Un e-mail n'est envoyé qu'à un collaborateur connu et actif.
        // On ne révèle jamais à l'appelant si l'adresse existe.
        const utilisateur = await prisma.user.findUnique({
          where: { email },
          select: { id: true, actif: true },
        });

        if (!utilisateur || !utilisateur.actif) {
          await logAudit({
            entite: 'Auth',
            entiteId: email,
            action: 'RATE_LIMITED',
            acteur: email,
            details: { raison: utilisateur ? 'compte inactif' : 'adresse inconnue' },
          });
          return;
        }

        const html = await render(
          MagicLinkEmail({ url, dureeMinutes: MAGIC_LINK_MAX_AGE_SECONDS / 60 }),
        );
        const text = [
          'Votre lien de connexion aux ordres de mission PORTEO GROUP :',
          url,
          `Ce lien est valable ${MAGIC_LINK_MAX_AGE_SECONDS / 60} minutes et ne peut servir qu'une seule fois.`,
        ].join('\n\n');

        const resultat = await envoyerEmail({
          to: [email],
          subject: 'Votre lien de connexion — Ordres de mission Porteo',
          html,
          text,
        });

        await logAudit({
          entite: 'Auth',
          entiteId: utilisateur.id,
          action: resultat.ok ? 'EMAIL_SENT' : 'EMAIL_FAILED',
          acteur: email,
          details: { type: 'MAGIC_LINK', erreur: resultat.error ?? null },
        });
      },
    }),
  ],
  callbacks: {
    /** Refuse la connexion des adresses inconnues ou désactivées. */
    async signIn({ user }) {
      if (!user.email) return false;

      const compte = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { actif: true },
      });

      return Boolean(compte?.actif);
    },

    /**
     * Le profil n'est lu en base qu'à la connexion : les requêtes suivantes se
     * contentent du jeton, ce qui garde le middleware compatible edge.
     * Rôle et statut « actif » sont de toute façon revérifiés en base à chaque
     * accès protégé (voir `lib/session.ts`).
     */
    async jwt({ token, user }) {
      if (user?.email) {
        const profil = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: {
            id: true,
            role: true,
            nom: true,
            prenoms: true,
            matricule: true,
            fonction: true,
            actif: true,
          },
        });

        if (profil) {
          token.id = profil.id;
          token.role = profil.role;
          token.nom = profil.nom;
          token.prenoms = profil.prenoms;
          token.matricule = profil.matricule;
          token.fonction = profil.fonction;
          token.actif = profil.actif;
        }
      }

      return token;
    },

    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.nom = token.nom;
      session.user.prenoms = token.prenoms;
      session.user.matricule = token.matricule;
      session.user.fonction = token.fonction;
      session.user.actif = token.actif;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await logAudit({
          entite: 'Auth',
          entiteId: user.id,
          action: 'CREATED',
          acteur: user.email ?? 'inconnu',
          details: { evenement: 'connexion' },
        });
      }
    },
  },
  secret: getEnv().AUTH_SECRET,
}));
