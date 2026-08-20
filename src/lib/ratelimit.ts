import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Limitation de débit à fenêtre fixe, stockée en base.
 *
 * L'offre gratuite exclut Redis : on s'appuie donc sur Postgres. Le coût est
 * d'un `INSERT … ON CONFLICT` par requête protégée, ce qui reste négligeable
 * face aux quotas Neon.
 */

export interface RateLimitOptions {
  /** Clé fonctionnelle, ex. `auth:signin:ip:41.x.x.x`. */
  cle: string;
  /** Nombre de requêtes autorisées par fenêtre. */
  limite: number;
  /** Largeur de la fenêtre, en secondes. */
  fenetreSecondes: number;
}

export interface RateLimitResult {
  autorise: boolean;
  /** Requêtes encore disponibles dans la fenêtre courante. */
  restant: number;
  /** Instant auquel la fenêtre se réinitialise. */
  reinitialisationA: Date;
}

/** Début de la fenêtre courante, aligné sur des bornes fixes. */
export function debutFenetre(maintenant: Date, fenetreSecondes: number): Date {
  const largeurMs = fenetreSecondes * 1000;
  return new Date(Math.floor(maintenant.getTime() / largeurMs) * largeurMs);
}

/**
 * Consomme un jeton. En cas d'indisponibilité de la base, la requête est
 * **autorisée** : le rate limiter ne doit pas rendre l'application inutilisable.
 */
export async function consommerRateLimit(
  options: RateLimitOptions,
  maintenant: Date = new Date(),
): Promise<RateLimitResult> {
  const fenetreDebut = debutFenetre(maintenant, options.fenetreSecondes);
  const reinitialisationA = new Date(fenetreDebut.getTime() + options.fenetreSecondes * 1000);

  try {
    /*
     * L'identifiant et l'horodatage sont fournis par l'application plutôt que
     * par `gen_random_uuid()` et `NOW()` : la requête reste ainsi valable sur
     * PostgreSQL comme sur SQLite (mode démonstration et tests).
     */
    const lignes = await prisma.$queryRaw<{ compteur: number }[]>`
      INSERT INTO "RateLimit" ("id", "cle", "fenetreDebut", "compteur", "updatedAt")
      VALUES (${randomUUID()}, ${options.cle}, ${fenetreDebut}, 1, ${maintenant})
      ON CONFLICT ("cle", "fenetreDebut")
      DO UPDATE SET "compteur" = "RateLimit"."compteur" + 1, "updatedAt" = ${maintenant}
      RETURNING "compteur"
    `;

    const compteur = Number(lignes[0]?.compteur ?? 1);

    return {
      autorise: compteur <= options.limite,
      restant: Math.max(0, options.limite - compteur),
      reinitialisationA,
    };
  } catch (error) {
    console.error('Rate limiter indisponible, requête autorisée par défaut', error);
    return { autorise: true, restant: options.limite, reinitialisationA };
  }
}

/**
 * Purge les fenêtres expirées. Appelée ponctuellement (1 chance sur 20) depuis
 * les points d'entrée protégés : pas besoin d'un cron, interdit par le cahier
 * des charges au-delà d'une exécution quotidienne.
 */
export async function purgerRateLimits(anteriorA: Date): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { fenetreDebut: { lt: anteriorA } } });
  } catch (error) {
    console.error('Échec de purge du rate limiter', error);
  }
}

/** Politiques appliquées dans l'application. */
export const POLITIQUES = {
  /** Envoi de magic link : 5 par quart d'heure et par adresse. */
  connexionParEmail: { limite: 5, fenetreSecondes: 15 * 60 },
  /** Envoi de magic link : 20 par quart d'heure et par IP. */
  connexionParIp: { limite: 20, fenetreSecondes: 15 * 60 },
  /** Consultation d'un lien d'approbation : 30 par quart d'heure et par IP. */
  approbationParIp: { limite: 30, fenetreSecondes: 15 * 60 },
  /** Vérification publique d'authenticité : 60 par quart d'heure et par IP. */
  verificationParIp: { limite: 60, fenetreSecondes: 15 * 60 },
} as const;
