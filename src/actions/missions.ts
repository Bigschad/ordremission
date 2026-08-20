'use server';

import { MissionStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { RELANCES_MAX } from '@/lib/mission/constantes';
import { attribuerNumero, numeroProvisoire } from '@/lib/mission/numero';
import { appliquerTransition, TransitionInterditeError } from '@/lib/mission/status';
import { creerTokensApprobation, invaliderTokens } from '@/lib/mission/tokens';
import { notifierSoumissionAuxRH } from '@/lib/email/notifications';
import { missionBrouillonSchema, missionSchema } from '@/lib/validations/mission';
import { getClientIp } from '@/lib/request';
import { AccesRefuseError, exigerUtilisateurAction } from '@/lib/session';
import { echec, erreursDepuisZod, succes, type ActionResultat } from './resultat';

/** Transforme les données du formulaire en objet simple, pour Zod. */
function extraire(donnees: FormData) {
  return {
    analytique: (donnees.get('analytique') as string | null) ?? undefined,
    objet: (donnees.get('objet') as string | null) ?? undefined,
    lieu: (donnees.get('lieu') as string | null) ?? undefined,
    dateDepart: (donnees.get('dateDepart') as string | null) ?? undefined,
    dateRetour: (donnees.get('dateRetour') as string | null) ?? undefined,
    transportType: (donnees.get('transportType') as string | null) ?? undefined,
    transportDetail: (donnees.get('transportDetail') as string | null) ?? undefined,
    litresGasoil: (donnees.get('litresGasoil') as string | null) ?? undefined,
  };
}

function gererErreur(error: unknown): ActionResultat<never> {
  if (error instanceof TransitionInterditeError || error instanceof AccesRefuseError) {
    return echec(error.message);
  }
  console.error('Erreur de Server Action « ordre de mission »', error);
  return echec("Une erreur inattendue est survenue. L'opération n'a pas été enregistrée.");
}

/** Recharge les écrans concernés par une modification. */
function rafraichir(missionId?: string): void {
  revalidatePath('/');
  revalidatePath('/rh');
  if (missionId) revalidatePath(`/missions/${missionId}`);
}

// ---------------------------------------------------------------------------
// Brouillons
// ---------------------------------------------------------------------------

/** Enregistre un nouveau brouillon (validation souple : saisie incomplète admise). */
export async function creerBrouillon(donnees: FormData): Promise<ActionResultat<{ id: string }>> {
  try {
    const utilisateur = await exigerUtilisateurAction();
    const analyse = missionBrouillonSchema.safeParse(extraire(donnees));

    if (!analyse.success) {
      return echec('Certains champs sont invalides.', erreursDepuisZod(analyse.error.issues));
    }

    const valeurs = analyse.data;

    const mission = await prisma.missionOrder.create({
      data: {
        numero: numeroProvisoire(),
        demandeurId: utilisateur.id,
        // Identité figée à la création, puis rafraîchie à la soumission.
        nom: utilisateur.nom,
        prenoms: utilisateur.prenoms,
        matricule: utilisateur.matricule,
        fonction: utilisateur.fonction,
        analytique: valeurs.analytique,
        objet: valeurs.objet ?? '',
        lieu: valeurs.lieu ?? '',
        dateDepart: valeurs.dateDepart ?? new Date(),
        dateRetour: valeurs.dateRetour ?? new Date(Date.now() + 3600_000),
        transportType: valeurs.transportType ?? 'VEHICULE_ETABLISSEMENT',
        transportDetail: valeurs.transportDetail,
        litresGasoil: valeurs.litresGasoil,
        status: MissionStatus.DRAFT,
      },
      select: { id: true },
    });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'CREATED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
    });

    rafraichir(mission.id);
    return succes({ id: mission.id }, 'Brouillon enregistré.');
  } catch (error) {
    return gererErreur(error);
  }
}

/** Modifie un brouillon. Règle 5 : seul le statut DRAFT est modifiable. */
export async function modifierBrouillon(
  id: string,
  donnees: FormData,
): Promise<ActionResultat<{ id: string }>> {
  try {
    const utilisateur = await exigerUtilisateurAction();

    const mission = await prisma.missionOrder.findFirst({
      where: { id, demandeurId: utilisateur.id },
      select: { id: true, status: true },
    });

    if (!mission) return echec("Cet ordre de mission est introuvable.");

    appliquerTransition(mission.status, 'UPDATE');

    const analyse = missionBrouillonSchema.safeParse(extraire(donnees));
    if (!analyse.success) {
      return echec('Certains champs sont invalides.', erreursDepuisZod(analyse.error.issues));
    }

    const valeurs = analyse.data;

    await prisma.missionOrder.update({
      where: { id: mission.id },
      data: {
        analytique: valeurs.analytique,
        objet: valeurs.objet ?? '',
        lieu: valeurs.lieu ?? '',
        ...(valeurs.dateDepart ? { dateDepart: valeurs.dateDepart } : {}),
        ...(valeurs.dateRetour ? { dateRetour: valeurs.dateRetour } : {}),
        ...(valeurs.transportType ? { transportType: valeurs.transportType } : {}),
        transportDetail: valeurs.transportDetail,
        litresGasoil: valeurs.litresGasoil,
      },
    });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'UPDATED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
    });

    rafraichir(mission.id);
    return succes({ id: mission.id }, 'Brouillon mis à jour.');
  } catch (error) {
    return gererErreur(error);
  }
}

/** Supprime un brouillon. Règle 5. */
export async function supprimerBrouillon(id: string): Promise<ActionResultat<undefined>> {
  try {
    const utilisateur = await exigerUtilisateurAction();

    const mission = await prisma.missionOrder.findFirst({
      where: { id, demandeurId: utilisateur.id },
      select: { id: true, status: true },
    });

    if (!mission) return echec('Cet ordre de mission est introuvable.');

    appliquerTransition(mission.status, 'DELETE');

    await prisma.missionOrder.delete({ where: { id: mission.id } });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'DELETED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
    });

    rafraichir();
    return succes(undefined, 'Brouillon supprimé.');
  } catch (error) {
    return gererErreur(error);
  }
}

// ---------------------------------------------------------------------------
// Soumission
// ---------------------------------------------------------------------------

export interface SoumissionReussie {
  id: string;
  numero: string;
}

/**
 * Soumet un ordre de mission aux Ressources Humaines.
 *
 * Le numéro définitif, le passage au statut SUBMITTED et l'émission des jetons
 * d'approbation se font dans **une seule transaction** : soit l'ensemble est
 * enregistré, soit rien ne l'est. Aucun numéro n'est donc consommé pour un
 * ordre qui resterait en brouillon.
 */
export async function soumettreMission(
  id: string,
  donnees: FormData,
): Promise<ActionResultat<SoumissionReussie>> {
  try {
    const utilisateur = await exigerUtilisateurAction();

    const existante = await prisma.missionOrder.findFirst({
      where: { id, demandeurId: utilisateur.id },
      select: { id: true, status: true },
    });

    if (!existante) return echec('Cet ordre de mission est introuvable.');

    const statutCible = appliquerTransition(existante.status, 'SUBMIT');

    // Validation stricte : toutes les règles métier s'appliquent à la soumission.
    const analyse = missionSchema.safeParse(extraire(donnees));
    if (!analyse.success) {
      return echec(
        'Le formulaire comporte des erreurs : corrigez-les avant de soumettre.',
        erreursDepuisZod(analyse.error.issues),
      );
    }

    const valeurs = analyse.data;
    const maintenant = new Date();

    const resultat = await prisma.$transaction(async (tx) => {
      const numero = await attribuerNumero(tx, maintenant.getUTCFullYear());

      const mission = await tx.missionOrder.update({
        where: { id: existante.id },
        data: {
          numero,
          // L'identité est figée au moment de la soumission.
          nom: utilisateur.nom,
          prenoms: utilisateur.prenoms,
          matricule: utilisateur.matricule,
          fonction: utilisateur.fonction,
          analytique: valeurs.analytique,
          objet: valeurs.objet,
          lieu: valeurs.lieu,
          dateDepart: valeurs.dateDepart,
          dateRetour: valeurs.dateRetour,
          transportType: valeurs.transportType,
          transportDetail: valeurs.transportDetail,
          litresGasoil: valeurs.litresGasoil,
          status: statutCible,
          submittedAt: maintenant,
        },
      });

      const jetons = await creerTokensApprobation(tx, mission.id, maintenant);

      return { mission, jetons };
    });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: resultat.mission.id,
      action: 'SUBMITTED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
      details: { numero: resultat.mission.numero },
    });

    // L'e-mail part après la transaction : un échec d'envoi ne doit pas
    // annuler la soumission (l'ordre reste SUBMITTED et peut être renvoyé).
    const envoi = await notifierSoumissionAuxRH(resultat.mission, resultat.jetons);

    rafraichir(resultat.mission.id);

    if (!envoi.ok) {
      return succes(
        { id: resultat.mission.id, numero: resultat.mission.numero },
        `Ordre de mission ${resultat.mission.numero} enregistré, mais l'e-mail aux Ressources Humaines n'a pas pu être envoyé. Utilisez « Renvoyer aux RH » depuis le détail de la demande.`,
      );
    }

    return succes(
      { id: resultat.mission.id, numero: resultat.mission.numero },
      `Ordre de mission ${resultat.mission.numero} soumis aux Ressources Humaines.`,
    );
  } catch (error) {
    return gererErreur(error);
  }
}

// ---------------------------------------------------------------------------
// Annulation
// ---------------------------------------------------------------------------

/**
 * Annule un ordre de mission (règle 6).
 * Les jetons d'approbation encore en circulation sont invalidés : un lien
 * reçu par les RH avant l'annulation devient sans effet.
 */
export async function annulerMission(id: string): Promise<ActionResultat<undefined>> {
  try {
    const utilisateur = await exigerUtilisateurAction();

    const mission = await prisma.missionOrder.findFirst({
      where: { id, demandeurId: utilisateur.id },
      select: { id: true, status: true, numero: true },
    });

    if (!mission) return echec('Cet ordre de mission est introuvable.');

    const statutCible = appliquerTransition(mission.status, 'CANCEL');
    const maintenant = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.missionOrder.update({
        where: { id: mission.id },
        data: { status: statutCible },
      });
      await invaliderTokens(tx, mission.id, maintenant);
    });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'CANCELLED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
      details: { numero: mission.numero },
    });

    rafraichir(mission.id);
    return succes(undefined, 'Ordre de mission annulé.');
  } catch (error) {
    return gererErreur(error);
  }
}

// ---------------------------------------------------------------------------
// Relance
// ---------------------------------------------------------------------------

/**
 * Renvoie un ordre de mission aux Ressources Humaines.
 *
 * Prévu pour le cas où l'e-mail initial a échoué. De nouveaux jetons sont
 * émis — ceux du message précédent deviennent caducs — et le nombre de
 * relances est plafonné à {@link RELANCES_MAX} pour éviter tout usage abusif.
 */
export async function renvoyerAuxRH(id: string): Promise<ActionResultat<{ relances: number }>> {
  try {
    const utilisateur = await exigerUtilisateurAction();

    const mission = await prisma.missionOrder.findFirst({
      where: { id, demandeurId: utilisateur.id },
      select: { id: true, status: true, relances: true, numero: true },
    });

    if (!mission) return echec('Cet ordre de mission est introuvable.');

    appliquerTransition(mission.status, 'RESUBMIT');

    if (mission.relances >= RELANCES_MAX) {
      return echec(
        `Vous avez atteint la limite de ${RELANCES_MAX} renvois. Contactez directement les Ressources Humaines.`,
      );
    }

    const maintenant = new Date();

    const { complete, jetons } = await prisma.$transaction(async (tx) => {
      const misAJour = await tx.missionOrder.update({
        where: { id: mission.id },
        data: { relances: { increment: 1 } },
      });
      const nouveauxJetons = await creerTokensApprobation(tx, mission.id, maintenant);
      return { complete: misAJour, jetons: nouveauxJetons };
    });

    const envoi = await notifierSoumissionAuxRH(complete, jetons, { relance: true });

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'RESUBMITTED',
      acteur: utilisateur.email,
      ip: await getClientIp(),
      details: { numero: mission.numero, relance: complete.relances, envoye: envoi.ok },
    });

    rafraichir(mission.id);

    if (!envoi.ok) {
      return echec(
        "L'e-mail n'a pas pu être envoyé aux Ressources Humaines. Réessayez dans quelques minutes.",
      );
    }

    return succes(
      { relances: complete.relances },
      `Ordre de mission renvoyé aux Ressources Humaines (${complete.relances}/${RELANCES_MAX}).`,
    );
  } catch (error) {
    return gererErreur(error);
  }
}
