import { MissionStatus } from '@prisma/client';

/**
 * Machine à états des ordres de mission.
 *
 * Conçue pour rester extensible : la v2 doit pouvoir insérer des étapes
 * « Supérieur hiérarchique » et « Directeur » entre SUBMITTED et APPROVED sans
 * réécrire les appelants — il suffira d'ajouter des transitions à cette table.
 */

export type MissionTransition =
  'SUBMIT' | 'RESUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'UPDATE' | 'DELETE';

interface TransitionRule {
  /** Statuts depuis lesquels la transition est permise. */
  depuis: readonly MissionStatus[];
  /** Statut atteint. `null` = pas de changement de statut (modification, relance). */
  vers: MissionStatus | null;
}

const TRANSITIONS: Record<MissionTransition, TransitionRule> = {
  UPDATE: { depuis: [MissionStatus.DRAFT], vers: null },
  DELETE: { depuis: [MissionStatus.DRAFT], vers: null },
  SUBMIT: { depuis: [MissionStatus.DRAFT], vers: MissionStatus.SUBMITTED },
  RESUBMIT: { depuis: [MissionStatus.SUBMITTED], vers: null },
  APPROVE: { depuis: [MissionStatus.SUBMITTED], vers: MissionStatus.APPROVED },
  REJECT: { depuis: [MissionStatus.SUBMITTED], vers: MissionStatus.REJECTED },
  CANCEL: {
    depuis: [MissionStatus.DRAFT, MissionStatus.SUBMITTED],
    vers: MissionStatus.CANCELLED,
  },
};

export function peutTransiter(statut: MissionStatus, transition: MissionTransition): boolean {
  return TRANSITIONS[transition].depuis.includes(statut);
}

/**
 * Renvoie le statut résultant d'une transition.
 * Lève une erreur explicite (en français) si la transition est interdite.
 */
export function appliquerTransition(
  statut: MissionStatus,
  transition: MissionTransition,
): MissionStatus {
  if (!peutTransiter(statut, transition)) {
    throw new TransitionInterditeError(statut, transition);
  }
  return TRANSITIONS[transition].vers ?? statut;
}

export class TransitionInterditeError extends Error {
  readonly statut: MissionStatus;
  readonly transition: MissionTransition;

  constructor(statut: MissionStatus, transition: MissionTransition) {
    super(
      `Action « ${TRANSITION_LABELS[transition]} » impossible : l'ordre de mission est au statut « ${statusLabel(statut)} ».`,
    );
    this.name = 'TransitionInterditeError';
    this.statut = statut;
    this.transition = transition;
  }
}

/** Statuts terminaux : aucune transition sortante. */
export function estStatutFinal(statut: MissionStatus): boolean {
  return (
    statut === MissionStatus.APPROVED ||
    statut === MissionStatus.REJECTED ||
    statut === MissionStatus.CANCELLED
  );
}

/** Seul le brouillon est modifiable ou supprimable par son demandeur (règle 5). */
export function estModifiable(statut: MissionStatus): boolean {
  return peutTransiter(statut, 'UPDATE');
}

export function estAnnulable(statut: MissionStatus): boolean {
  return peutTransiter(statut, 'CANCEL');
}

/** Un OM en attente de décision RH — les tokens d'approbation y sont actifs. */
export function estEnAttenteDecision(statut: MissionStatus): boolean {
  return statut === MissionStatus.SUBMITTED;
}

const TRANSITION_LABELS: Record<MissionTransition, string> = {
  UPDATE: 'Modifier',
  DELETE: 'Supprimer',
  SUBMIT: 'Soumettre aux RH',
  RESUBMIT: 'Renvoyer aux RH',
  APPROVE: 'Valider',
  REJECT: 'Refuser',
  CANCEL: 'Annuler',
};

const STATUS_LABELS: Record<MissionStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'En attente de validation',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
  CANCELLED: 'Annulé',
};

export function statusLabel(statut: MissionStatus): string {
  return STATUS_LABELS[statut];
}

export type StatusVariant = 'secondary' | 'warning' | 'success' | 'destructive' | 'outline';

const STATUS_VARIANTS: Record<MissionStatus, StatusVariant> = {
  DRAFT: 'secondary',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
};

export function statusVariant(statut: MissionStatus): StatusVariant {
  return STATUS_VARIANTS[statut];
}

export const MISSION_STATUSES = Object.values(MissionStatus);
