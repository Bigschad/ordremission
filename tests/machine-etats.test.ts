import { MissionStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  appliquerTransition,
  estAnnulable,
  estEnAttenteDecision,
  estModifiable,
  estStatutFinal,
  MISSION_STATUSES,
  peutTransiter,
  statusLabel,
  statusVariant,
  TransitionInterditeError,
  type MissionTransition,
} from '@/lib/mission/status';

/**
 * Machine à états : toutes les transitions valides et invalides.
 * La table ci-dessous est exhaustive — 5 statuts × 7 transitions = 35 cas.
 */

const TRANSITIONS: MissionTransition[] = [
  'UPDATE',
  'DELETE',
  'SUBMIT',
  'RESUBMIT',
  'APPROVE',
  'REJECT',
  'CANCEL',
];

/** Statut attendu après transition, `null` si la transition est interdite. */
const ATTENDU: Record<MissionStatus, Record<MissionTransition, MissionStatus | null>> = {
  DRAFT: {
    UPDATE: MissionStatus.DRAFT,
    DELETE: MissionStatus.DRAFT,
    SUBMIT: MissionStatus.SUBMITTED,
    RESUBMIT: null,
    APPROVE: null,
    REJECT: null,
    CANCEL: MissionStatus.CANCELLED,
  },
  SUBMITTED: {
    UPDATE: null,
    DELETE: null,
    SUBMIT: null,
    RESUBMIT: MissionStatus.SUBMITTED,
    APPROVE: MissionStatus.APPROVED,
    REJECT: MissionStatus.REJECTED,
    CANCEL: MissionStatus.CANCELLED,
  },
  APPROVED: {
    UPDATE: null,
    DELETE: null,
    SUBMIT: null,
    RESUBMIT: null,
    APPROVE: null,
    REJECT: null,
    CANCEL: null,
  },
  REJECTED: {
    UPDATE: null,
    DELETE: null,
    SUBMIT: null,
    RESUBMIT: null,
    APPROVE: null,
    REJECT: null,
    CANCEL: null,
  },
  CANCELLED: {
    UPDATE: null,
    DELETE: null,
    SUBMIT: null,
    RESUBMIT: null,
    APPROVE: null,
    REJECT: null,
    CANCEL: null,
  },
};

describe('table de transitions exhaustive', () => {
  for (const statut of MISSION_STATUSES) {
    for (const transition of TRANSITIONS) {
      const cible = ATTENDU[statut][transition];

      it(`${statut} + ${transition} → ${cible ?? 'interdit'}`, () => {
        if (cible === null) {
          expect(peutTransiter(statut, transition)).toBe(false);
          expect(() => appliquerTransition(statut, transition)).toThrow(TransitionInterditeError);
        } else {
          expect(peutTransiter(statut, transition)).toBe(true);
          expect(appliquerTransition(statut, transition)).toBe(cible);
        }
      });
    }
  }
});

describe('messages d’erreur', () => {
  it('explique en français pourquoi la transition est refusée', () => {
    try {
      appliquerTransition(MissionStatus.APPROVED, 'UPDATE');
      expect.unreachable('la transition aurait dû être refusée');
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionInterditeError);
      if (error instanceof TransitionInterditeError) {
        expect(error.message).toContain('Modifier');
        expect(error.message).toContain('Validé');
        expect(error.statut).toBe(MissionStatus.APPROVED);
        expect(error.transition).toBe('UPDATE');
      }
    }
  });
});

describe('prédicats métier', () => {
  it('règle 5 — seul le brouillon est modifiable et supprimable', () => {
    expect(estModifiable(MissionStatus.DRAFT)).toBe(true);
    for (const statut of MISSION_STATUSES.filter((s) => s !== MissionStatus.DRAFT)) {
      expect(estModifiable(statut), statut).toBe(false);
    }
  });

  it('règle 6 — brouillon et ordre soumis sont annulables', () => {
    expect(estAnnulable(MissionStatus.DRAFT)).toBe(true);
    expect(estAnnulable(MissionStatus.SUBMITTED)).toBe(true);
    expect(estAnnulable(MissionStatus.APPROVED)).toBe(false);
    expect(estAnnulable(MissionStatus.REJECTED)).toBe(false);
    expect(estAnnulable(MissionStatus.CANCELLED)).toBe(false);
  });

  it('identifie les statuts terminaux', () => {
    expect(estStatutFinal(MissionStatus.DRAFT)).toBe(false);
    expect(estStatutFinal(MissionStatus.SUBMITTED)).toBe(false);
    expect(estStatutFinal(MissionStatus.APPROVED)).toBe(true);
    expect(estStatutFinal(MissionStatus.REJECTED)).toBe(true);
    expect(estStatutFinal(MissionStatus.CANCELLED)).toBe(true);
  });

  it('identifie l’attente de décision', () => {
    expect(estEnAttenteDecision(MissionStatus.SUBMITTED)).toBe(true);
    for (const statut of MISSION_STATUSES.filter((s) => s !== MissionStatus.SUBMITTED)) {
      expect(estEnAttenteDecision(statut), statut).toBe(false);
    }
  });
});

describe('libellés d’interface', () => {
  it('donne un libellé français à chaque statut', () => {
    expect(statusLabel(MissionStatus.DRAFT)).toBe('Brouillon');
    expect(statusLabel(MissionStatus.SUBMITTED)).toBe('En attente de validation');
    expect(statusLabel(MissionStatus.APPROVED)).toBe('Validé');
    expect(statusLabel(MissionStatus.REJECTED)).toBe('Refusé');
    expect(statusLabel(MissionStatus.CANCELLED)).toBe('Annulé');
  });

  it('associe une variante de badge à chaque statut', () => {
    for (const statut of MISSION_STATUSES) {
      expect(statusVariant(statut), statut).toBeTruthy();
    }
  });
});
