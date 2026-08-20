import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MissionStatus, type Prisma, type PrismaClient } from '@prisma/client';

/**
 * Jetons d'approbation transmis aux Ressources Humaines par e-mail.
 *
 * Règle 7 : usage unique, validité 7 jours, et **caducité croisée** — dès
 * qu'une décision est prise, les deux jetons (Valider et Refuser) sont
 * consommés ensemble.
 *
 * Seule l'empreinte SHA-256 est stockée : une fuite de la base ne permet pas
 * de rejouer un lien.
 */

export const TOKEN_VALIDITE_JOURS = 7;
const TOKEN_OCTETS = 32;

export type TokenAction = 'APPROVE' | 'REJECT';

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface TokensEmis {
  approuver: string;
  refuser: string;
  expireLe: Date;
}

/** Empreinte stockée en base. Le jeton en clair ne quitte jamais l'e-mail. */
export function hacherToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparaison à temps constant de deux empreintes. */
export function comparerEmpreintes(a: string, b: string): boolean {
  const tamponA = Buffer.from(a, 'utf8');
  const tamponB = Buffer.from(b, 'utf8');
  if (tamponA.length !== tamponB.length) return false;
  return timingSafeEqual(tamponA, tamponB);
}

function genererToken(): string {
  return randomBytes(TOKEN_OCTETS).toString('base64url');
}

export function calculerExpiration(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + TOKEN_VALIDITE_JOURS * 24 * 60 * 60 * 1000);
}

/**
 * Émet la paire de jetons d'un ordre de mission.
 * Les jetons déjà en circulation sont invalidés au passage : une relance
 * « Renvoyer aux RH » rend caducs les liens du message précédent.
 */
export async function creerTokensApprobation(
  tx: PrismaExecutor,
  missionOrderId: string,
  maintenant: Date = new Date(),
): Promise<TokensEmis> {
  await invaliderTokens(tx, missionOrderId, maintenant);

  const approuver = genererToken();
  const refuser = genererToken();
  const expireLe = calculerExpiration(maintenant);

  await tx.approvalToken.createMany({
    data: [
      {
        tokenHash: hacherToken(approuver),
        missionOrderId,
        action: 'APPROVE',
        expiresAt: expireLe,
      },
      {
        tokenHash: hacherToken(refuser),
        missionOrderId,
        action: 'REJECT',
        expiresAt: expireLe,
      },
    ],
  });

  return { approuver, refuser, expireLe };
}

/**
 * Marque comme consommés tous les jetons encore actifs d'un ordre de mission.
 * Appelé après une décision (règle 7) et lors d'une annulation (règle 6).
 */
export async function invaliderTokens(
  tx: PrismaExecutor,
  missionOrderId: string,
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await tx.approvalToken.updateMany({
    where: { missionOrderId, usedAt: null },
    data: { usedAt: maintenant },
  });
  return count;
}

/** Motifs de rejet d'un jeton, chacun avec son message utilisateur. */
export type MotifJetonInvalide =
  'INTROUVABLE' | 'DEJA_UTILISE' | 'EXPIRE' | 'DECISION_DEJA_PRISE' | 'ORDRE_ANNULE';

export const MESSAGES_JETON_INVALIDE: Record<MotifJetonInvalide, string> = {
  INTROUVABLE: "Ce lien n'est pas valide. Vérifiez que vous avez copié l'adresse en entier.",
  DEJA_UTILISE:
    'Ce lien a déjà été utilisé. Un lien de validation ne peut servir qu’une seule fois.',
  EXPIRE: `Ce lien a expiré : sa durée de validité est de ${TOKEN_VALIDITE_JOURS} jours. Demandez au collaborateur de renvoyer sa demande.`,
  DECISION_DEJA_PRISE:
    'Une décision a déjà été prise sur cet ordre de mission : ce lien n’a plus d’effet.',
  ORDRE_ANNULE: 'Cet ordre de mission a été annulé par son demandeur : ce lien n’a plus d’effet.',
};

export type ResolutionJeton =
  | { valide: true; jetonId: string; action: TokenAction; missionOrderId: string }
  | { valide: false; motif: MotifJetonInvalide };

/**
 * Vérifie un jeton **sans le consommer** : la page `/approve/{token}` doit
 * pouvoir s'afficher sur un simple GET sans produire d'effet de bord (les
 * scanners d'e-mails préchargent les liens).
 */
export async function resoudreToken(
  tx: PrismaExecutor,
  token: string,
  maintenant: Date = new Date(),
): Promise<ResolutionJeton> {
  if (!token || token.length < 16) {
    return { valide: false, motif: 'INTROUVABLE' };
  }

  const enregistrement = await tx.approvalToken.findUnique({
    where: { tokenHash: hacherToken(token) },
    include: { missionOrder: { select: { id: true, status: true } } },
  });

  if (!enregistrement) return { valide: false, motif: 'INTROUVABLE' };

  if (enregistrement.usedAt !== null) {
    // La décision prise explique mieux la situation qu'un simple « déjà utilisé ».
    const statut = enregistrement.missionOrder.status;
    if (statut === MissionStatus.APPROVED || statut === MissionStatus.REJECTED) {
      return { valide: false, motif: 'DECISION_DEJA_PRISE' };
    }
    if (statut === MissionStatus.CANCELLED) {
      return { valide: false, motif: 'ORDRE_ANNULE' };
    }
    return { valide: false, motif: 'DEJA_UTILISE' };
  }

  if (enregistrement.expiresAt.getTime() <= maintenant.getTime()) {
    return { valide: false, motif: 'EXPIRE' };
  }

  if (enregistrement.missionOrder.status === MissionStatus.CANCELLED) {
    return { valide: false, motif: 'ORDRE_ANNULE' };
  }

  if (enregistrement.missionOrder.status !== MissionStatus.SUBMITTED) {
    return { valide: false, motif: 'DECISION_DEJA_PRISE' };
  }

  return {
    valide: true,
    jetonId: enregistrement.id,
    action: enregistrement.action === 'REJECT' ? 'REJECT' : 'APPROVE',
    missionOrderId: enregistrement.missionOrderId,
  };
}
