import { MissionStatus, type Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { appliquerTransition } from '@/lib/mission/status';
import { invaliderTokens } from '@/lib/mission/tokens';
import { missionSelect, type MissionResume } from '@/lib/mission/queries';

/**
 * Application d'une décision RH sur un ordre de mission.
 *
 * Ce module est partagé par les deux points d'entrée :
 *  - le lien reçu par e-mail (`/approve/{token}`, `/reject/{token}`) ;
 *  - la file d'attente `/rh`, pour un utilisateur authentifié.
 *
 * La décision est **atomique** : la mise à jour n'est appliquée que si l'ordre
 * est encore au statut SUBMITTED. Deux valideurs qui cliquent en même temps ne
 * peuvent donc pas produire deux décisions contradictoires.
 */

export type SensDecision = 'APPROVE' | 'REJECT';

export interface Valideur {
  /** Identifiant du valideur, `null` quand la décision vient d'un lien e-mail. */
  id: string | null;
  nom: string;
  email: string;
}

/** Valideur générique lorsqu'une décision est prise depuis la boîte RH. */
export const VALIDEUR_BOITE_RH: Omit<Valideur, 'email'> = {
  id: null,
  nom: 'Ressources Humaines — PORTEO GROUP',
};

export type ResultatDecision =
  | { ok: true; mission: MissionResume }
  | { ok: false; motif: 'INTROUVABLE' | 'DEJA_DECIDE'; message: string };

export interface OptionsDecision {
  missionOrderId: string;
  sens: SensDecision;
  valideur: Valideur;
  /** Obligatoire pour un refus (règle 8, longueur validée en amont). */
  motifRefus?: string;
  ip?: string | null;
  maintenant?: Date;
}

export async function appliquerDecision(options: OptionsDecision): Promise<ResultatDecision> {
  const maintenant = options.maintenant ?? new Date();
  const statutCible = appliquerTransition(MissionStatus.SUBMITTED, options.sens);

  const donnees: Prisma.MissionOrderUpdateManyMutationInput = {
    status: statutCible,
    decidedAt: maintenant,
    decidedById: options.valideur.id,
    decidedByName: options.valideur.nom,
    decidedByEmail: options.valideur.email,
    motifRefus: options.sens === 'REJECT' ? (options.motifRefus ?? null) : null,
  };

  const resultat = await prisma.$transaction(async (tx) => {
    // Le filtre sur le statut rend la mise à jour idempotente : une seconde
    // décision concurrente touche zéro ligne.
    const { count } = await tx.missionOrder.updateMany({
      where: { id: options.missionOrderId, status: MissionStatus.SUBMITTED },
      data: donnees,
    });

    if (count === 0) return null;

    // Règle 7 — les deux jetons sont consommés ensemble.
    await invaliderTokens(tx, options.missionOrderId, maintenant);

    return tx.missionOrder.findUnique({
      where: { id: options.missionOrderId },
      select: missionSelect,
    });
  });

  if (!resultat) {
    const existante = await prisma.missionOrder.findUnique({
      where: { id: options.missionOrderId },
      select: { status: true },
    });

    if (!existante) {
      return {
        ok: false,
        motif: 'INTROUVABLE',
        message: "Cet ordre de mission est introuvable.",
      };
    }

    return {
      ok: false,
      motif: 'DEJA_DECIDE',
      message:
        existante.status === MissionStatus.CANCELLED
          ? "Cet ordre de mission a été annulé par son demandeur : aucune décision n'est possible."
          : 'Une décision a déjà été prise sur cet ordre de mission.',
    };
  }

  await logAudit({
    entite: 'MissionOrder',
    entiteId: options.missionOrderId,
    action: options.sens === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    acteur: options.valideur.email,
    ip: options.ip ?? null,
    details: {
      numero: resultat.numero,
      valideur: options.valideur.nom,
      ...(options.motifRefus ? { motif: options.motifRefus } : {}),
    },
  });

  return { ok: true, mission: resultat };
}
