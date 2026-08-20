import { TransportType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  accepteGasoil,
  ANTICIPATION_MAX_MOIS,
  creerMissionSchema,
  exigeDetail,
  missionSchema,
  MOTIF_REFUS_MIN,
  refusSchema,
  RETROACTIVITE_MAX_JOURS,
} from '@/lib/validations/mission';

/**
 * Chaque règle métier de la section « Règles métier » du cahier des charges
 * dispose ici de son test, cas passant et cas bloquant.
 */

/** Horloge figée : les tests des bornes de dates doivent être déterministes. */
const MAINTENANT = new Date('2026-08-20T12:00:00.000Z');
const schema = creerMissionSchema(() => MAINTENANT);

/** Saisie valide de référence — la fiche d'origine. */
function saisieValide(surcharges: Record<string, unknown> = {}) {
  return {
    analytique: 'IT-2026-001',
    objet: 'Visite chantier',
    lieu: 'Assinie',
    dateDepart: '2026-08-25T13:00',
    dateRetour: '2026-08-25T17:00',
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '1234 AB 01',
    litresGasoil: '40',
    ...surcharges,
  };
}

/** Renvoie les messages d'erreur portant sur un champ donné. */
function erreursDe(resultat: ReturnType<typeof schema.safeParse>, champ: string): string[] {
  if (resultat.success) return [];
  return resultat.error.issues
    .filter((issue) => issue.path.join('.') === champ)
    .map((issue) => issue.message);
}

describe('saisie de référence', () => {
  it('accepte la fiche papier d’origine', () => {
    const resultat = schema.safeParse(saisieValide());
    expect(resultat.success).toBe(true);
  });

  it('convertit les dates saisies en heure d’Abidjan vers UTC', () => {
    const resultat = schema.safeParse(saisieValide());
    expect(resultat.success).toBe(true);

    if (resultat.success) {
      // Africa/Abidjan est en UTC+0 : 13h00 local = 13h00 UTC.
      expect(resultat.data.dateDepart.toISOString()).toBe('2026-08-25T13:00:00.000Z');
      expect(resultat.data.dateRetour.toISOString()).toBe('2026-08-25T17:00:00.000Z');
    }
  });

  it('normalise les champs facultatifs vides en null', () => {
    const resultat = schema.safeParse(
      saisieValide({ analytique: '   ', transportDetail: '', litresGasoil: '' }),
    );
    expect(resultat.success).toBe(true);

    if (resultat.success) {
      expect(resultat.data.analytique).toBeNull();
      expect(resultat.data.transportDetail).toBeNull();
      expect(resultat.data.litresGasoil).toBeNull();
    }
  });
});

describe('règle 1 — la date de retour suit la date de départ', () => {
  it('refuse un retour antérieur au départ', () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2026-08-25T17:00', dateRetour: '2026-08-25T13:00' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'dateRetour')).toContain(
      'La date de retour doit être postérieure à la date de départ',
    );
  });

  it('refuse un retour strictement égal au départ', () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2026-08-25T13:00', dateRetour: '2026-08-25T13:00' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'dateRetour')).toHaveLength(1);
  });

  it('accepte un écart d’une seule minute', () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2026-08-25T13:00', dateRetour: '2026-08-25T13:01' }),
    );

    expect(resultat.success).toBe(true);
  });
});

describe('règle 2 — bornes de rétroactivité et d’anticipation', () => {
  it(`accepte un départ ${RETROACTIVITE_MAX_JOURS} jours dans le passé`, () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2026-07-25T13:00', dateRetour: '2026-07-25T17:00' }),
    );

    expect(resultat.success).toBe(true);
  });

  it(`refuse un départ au-delà de ${RETROACTIVITE_MAX_JOURS} jours dans le passé`, () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2026-06-01T13:00', dateRetour: '2026-06-01T17:00' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'dateDepart')[0]).toMatch(
      /ne peut pas précéder de plus de 30 jours/,
    );
  });

  it(`accepte un départ à moins de ${ANTICIPATION_MAX_MOIS} mois dans le futur`, () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2027-06-01T08:00', dateRetour: '2027-06-01T18:00' }),
    );

    expect(resultat.success).toBe(true);
  });

  it(`refuse un départ au-delà de ${ANTICIPATION_MAX_MOIS} mois dans le futur`, () => {
    const resultat = schema.safeParse(
      saisieValide({ dateDepart: '2028-01-01T08:00', dateRetour: '2028-01-01T18:00' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'dateDepart')[0]).toMatch(/12 mois dans le futur/);
  });
});

describe('règle 3 — gasoil réservé aux déplacements en véhicule', () => {
  it.each([
    TransportType.VEHICULE_ETABLISSEMENT,
    TransportType.VEHICULE_PERSONNEL,
    TransportType.VEHICULE_LOCATION,
  ])('accepte une quantité de gasoil pour %s', (transportType) => {
    const resultat = schema.safeParse(
      saisieValide({ transportType, transportDetail: 'Détail obligatoire', litresGasoil: '85.5' }),
    );

    expect(resultat.success).toBe(true);
    expect(accepteGasoil(transportType)).toBe(true);
  });

  it('refuse une quantité de gasoil en transport en commun', () => {
    const resultat = schema.safeParse(
      saisieValide({
        transportType: TransportType.TRANSPORT_EN_COMMUN,
        transportDetail: 'Compagnie UTB',
        litresGasoil: '20',
      }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'litresGasoil')[0]).toMatch(/transport en commun/);
    expect(accepteGasoil(TransportType.TRANSPORT_EN_COMMUN)).toBe(false);
  });

  it('accepte un transport en commun sans gasoil', () => {
    const resultat = schema.safeParse(
      saisieValide({ transportType: TransportType.TRANSPORT_EN_COMMUN, litresGasoil: '' }),
    );

    expect(resultat.success).toBe(true);
  });

  it('refuse une quantité négative, non numérique ou hors bornes', () => {
    for (const valeur of ['-5', 'abc', '10000']) {
      const resultat = schema.safeParse(saisieValide({ litresGasoil: valeur }));
      expect(resultat.success, `valeur rejetée : ${valeur}`).toBe(false);
    }
  });

  it('accepte la virgule décimale, usage francophone', () => {
    const resultat = schema.safeParse(saisieValide({ litresGasoil: '85,5' }));

    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.litresGasoil).toBe(85.5);
  });
});

describe('règle 4 — détail de transport obligatoire', () => {
  it('exige le nom du loueur pour un véhicule de location', () => {
    const resultat = schema.safeParse(
      saisieValide({ transportType: TransportType.VEHICULE_LOCATION, transportDetail: '' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'transportDetail')).toContain('Le nom du loueur est obligatoire');
    expect(exigeDetail(TransportType.VEHICULE_LOCATION)).toBe(true);
  });

  it('exige l’immatriculation pour un véhicule personnel', () => {
    const resultat = schema.safeParse(
      saisieValide({ transportType: TransportType.VEHICULE_PERSONNEL, transportDetail: '  ' }),
    );

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'transportDetail')).toContain(
      "L'immatriculation du véhicule est obligatoire",
    );
  });

  it('n’exige aucun détail pour le véhicule de l’établissement', () => {
    const resultat = schema.safeParse(
      saisieValide({ transportType: TransportType.VEHICULE_ETABLISSEMENT, transportDetail: '' }),
    );

    expect(resultat.success).toBe(true);
    expect(exigeDetail(TransportType.VEHICULE_ETABLISSEMENT)).toBe(false);
  });

  it('n’exige aucun détail pour le transport en commun', () => {
    const resultat = schema.safeParse(
      saisieValide({
        transportType: TransportType.TRANSPORT_EN_COMMUN,
        transportDetail: '',
        litresGasoil: '',
      }),
    );

    expect(resultat.success).toBe(true);
  });
});

describe('champs obligatoires', () => {
  it('refuse un objet ou un lieu vide', () => {
    const resultat = schema.safeParse(saisieValide({ objet: '   ', lieu: '' }));

    expect(resultat.success).toBe(false);
    expect(erreursDe(resultat, 'objet')).toContain('L’objet de la mission est obligatoire');
    expect(erreursDe(resultat, 'lieu')).toContain('Le lieu de la mission est obligatoire');
  });

  it('refuse un moyen de transport inconnu', () => {
    const resultat = schema.safeParse(saisieValide({ transportType: 'HELICOPTERE' }));
    expect(resultat.success).toBe(false);
  });

  it('refuse une date mal formée', () => {
    const resultat = schema.safeParse(saisieValide({ dateDepart: '25/08/2026 13:00' }));
    expect(resultat.success).toBe(false);
  });
});

describe('règle 8 — motif de refus obligatoire', () => {
  it(`refuse un motif de moins de ${MOTIF_REFUS_MIN} caractères`, () => {
    const resultat = refusSchema.safeParse({ motif: 'Trop court'.slice(0, 5) });

    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toMatch(/au moins 10 caractères/);
    }
  });

  it('refuse un motif vide ou uniquement composé d’espaces', () => {
    expect(refusSchema.safeParse({ motif: '' }).success).toBe(false);
    expect(refusSchema.safeParse({ motif: '               ' }).success).toBe(false);
  });

  it('accepte un motif suffisamment détaillé', () => {
    const resultat = refusSchema.safeParse({
      motif: 'Budget déplacement déjà consommé pour le mois en cours.',
    });

    expect(resultat.success).toBe(true);
  });

  it('refuse un motif au-delà de la longueur maximale', () => {
    expect(refusSchema.safeParse({ motif: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('schéma exporté par défaut', () => {
  it('utilise l’horloge courante', () => {
    const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
    const apresDemain = new Date(Date.now() + 30 * 3600 * 1000).toISOString().slice(0, 16);

    const resultat = missionSchema.safeParse(
      saisieValide({ dateDepart: demain, dateRetour: apresDemain }),
    );

    expect(resultat.success).toBe(true);
  });
});
