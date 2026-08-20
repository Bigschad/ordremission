'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import {
  appliquerDecision,
  VALIDEUR_BOITE_RH,
  type SensDecision,
  type Valideur,
} from '@/lib/mission/decision';
import { MESSAGES_JETON_INVALIDE, resoudreToken } from '@/lib/mission/tokens';
import { refusSchema } from '@/lib/validations/mission';
import { getEnv, getHrRecipients } from '@/lib/env';
import { consommerRateLimit, POLITIQUES } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/request';
import { getUtilisateurCourant, estRH } from '@/lib/session';
import { echec, succes, type ActionResultat } from './resultat';

export interface DecisionReussie {
  numero: string;
  sens: SensDecision;
}

/**
 * Identité du valideur.
 *
 * Les RH décident depuis leur boîte mail, sans se connecter : dans ce cas
 * l'application enregistre le service comme valideur. Si la personne est
 * malgré tout authentifiée, son identité nominative est retenue.
 */
async function determinerValideur(): Promise<Valideur> {
  const utilisateur = await getUtilisateurCourant();

  if (utilisateur && estRH(utilisateur)) {
    return {
      id: utilisateur.id,
      nom: `${utilisateur.prenoms} ${utilisateur.nom}`,
      email: utilisateur.email,
    };
  }

  return {
    ...VALIDEUR_BOITE_RH,
    email: getHrRecipients()[0] ?? getEnv().HR_EMAIL,
  };
}

/**
 * Applique une décision à partir d'un jeton reçu par e-mail.
 *
 * Appelée **uniquement** depuis un POST : un simple GET sur `/approve/{token}`
 * ne doit produire aucun effet, les scanners d'e-mails préchargeant les liens.
 */
async function deciderViaToken(
  token: string,
  sens: SensDecision,
  motifRefus?: string,
): Promise<ActionResultat<DecisionReussie>> {
  const ip = await getClientIp();

  const quota = await consommerRateLimit({
    cle: `approbation:ip:${ip}`,
    ...POLITIQUES.approbationParIp,
  });

  if (!quota.autorise) {
    return echec('Trop de tentatives. Merci de réessayer dans quelques minutes.');
  }

  const resolution = await resoudreToken(prisma, token);

  if (!resolution.valide) {
    // Un lien rejoué est tracé : c'est un signal de sécurité.
    await logAudit({
      entite: 'ApprovalToken',
      entiteId: 'inconnu',
      action: 'TOKEN_REPLAYED',
      acteur: 'ANONYME',
      ip,
      details: { motif: resolution.motif, sens },
    });

    return echec(MESSAGES_JETON_INVALIDE[resolution.motif]);
  }

  // Le jeton doit correspondre à l'action demandée : le lien « Valider » ne
  // peut pas servir à refuser, et réciproquement.
  if (resolution.action !== sens) {
    return echec("Ce lien ne correspond pas à l'action demandée.");
  }

  const valideur = await determinerValideur();

  const resultat = await appliquerDecision({
    missionOrderId: resolution.missionOrderId,
    sens,
    valideur,
    motifRefus,
    ip,
  });

  if (!resultat.ok) return echec(resultat.message);

  revalidatePath('/rh');
  revalidatePath('/');

  return succes({ numero: resultat.mission.numero, sens });
}

/** Validation depuis le lien reçu par e-mail. */
export async function validerViaToken(token: string): Promise<ActionResultat<DecisionReussie>> {
  return deciderViaToken(token, 'APPROVE');
}

/** Refus depuis le lien reçu par e-mail — motif obligatoire (règle 8). */
export async function refuserViaToken(
  token: string,
  donnees: FormData,
): Promise<ActionResultat<DecisionReussie>> {
  const analyse = refusSchema.safeParse({ motif: donnees.get('motif') });

  if (!analyse.success) {
    return echec(analyse.error.issues[0]?.message ?? 'Le motif du refus est obligatoire.', {
      motif: analyse.error.issues[0]?.message ?? 'Le motif du refus est obligatoire.',
    });
  }

  return deciderViaToken(token, 'REJECT', analyse.data.motif);
}

// ---------------------------------------------------------------------------
// Décisions prises depuis la file d'attente RH (utilisateur authentifié)
// ---------------------------------------------------------------------------

async function deciderDepuisFile(
  missionId: string,
  sens: SensDecision,
  motifRefus?: string,
): Promise<ActionResultat<DecisionReussie>> {
  const utilisateur = await getUtilisateurCourant();

  if (!utilisateur || !estRH(utilisateur)) {
    return echec("Vous n'êtes pas autorisé à décider d'un ordre de mission.");
  }

  const resultat = await appliquerDecision({
    missionOrderId: missionId,
    sens,
    valideur: {
      id: utilisateur.id,
      nom: `${utilisateur.prenoms} ${utilisateur.nom}`,
      email: utilisateur.email,
    },
    motifRefus,
    ip: await getClientIp(),
  });

  if (!resultat.ok) return echec(resultat.message);

  revalidatePath('/rh');
  revalidatePath('/');
  revalidatePath(`/missions/${missionId}`);

  return succes({ numero: resultat.mission.numero, sens });
}

export async function validerDepuisFile(
  missionId: string,
): Promise<ActionResultat<DecisionReussie>> {
  return deciderDepuisFile(missionId, 'APPROVE');
}

export async function refuserDepuisFile(
  missionId: string,
  motif: string,
): Promise<ActionResultat<DecisionReussie>> {
  const analyse = refusSchema.safeParse({ motif });

  if (!analyse.success) {
    return echec(analyse.error.issues[0]?.message ?? 'Le motif du refus est obligatoire.');
  }

  return deciderDepuisFile(missionId, 'REJECT', analyse.data.motif);
}
