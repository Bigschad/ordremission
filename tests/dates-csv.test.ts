import { MissionStatus, TransportType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatLong,
  formatTime,
  TIMEZONE,
  toDatetimeLocalValue,
  utcToZoned,
  zonedToUtc,
} from '@/lib/dates';
import { construireCsv, nomFichierCsv } from '@/lib/mission/csv';
import { analyserParamsRH, construireQuery } from '@/lib/mission/filtres-url';
import type { MissionResume } from '@/lib/mission/queries';

/** Fuseau Africa/Abidjan (UTC+0) et mise en forme francophone. */
describe('fuseau et mise en forme des dates', () => {
  const instant = new Date('2026-08-19T13:05:00.000Z');

  it('utilise le fuseau d’Abidjan', () => {
    expect(TIMEZONE).toBe('Africa/Abidjan');
  });

  it('convertit une saisie locale en UTC et retour', () => {
    const utc = zonedToUtc('2026-08-19T13:00:00');
    expect(utc.toISOString()).toBe('2026-08-19T13:00:00.000Z');
    expect(utcToZoned(utc).getHours()).toBe(13);
  });

  it('met en forme les dates en français', () => {
    expect(formatDate(instant)).toBe('19/08/2026');
    expect(formatDateTime(instant)).toBe('19/08/2026 à 13h05');
    expect(formatTime(instant)).toBe('13h05');
    expect(formatDayMonth(instant)).toBe('19/08');
    expect(formatLong(instant)).toBe('mercredi 19 août 2026 à 13h05');
  });

  it('produit une valeur exploitable par datetime-local', () => {
    expect(toDatetimeLocalValue(instant)).toBe('2026-08-19T13:05');
  });

  it('n’applique aucun décalage d’heure d’été', () => {
    // Abidjan reste en UTC+0 toute l'année.
    expect(formatTime(new Date('2026-01-15T09:00:00.000Z'))).toBe('09h00');
    expect(formatTime(new Date('2026-07-15T09:00:00.000Z'))).toBe('09h00');
  });
});

function missionCsv(surcharges: Partial<MissionResume> = {}): MissionResume {
  return {
    id: 'id-1',
    numero: 'OM-2026-0001',
    demandeurId: 'user-1',
    nom: 'YEYE',
    prenoms: 'SCHADRACH GUY-ROLAND',
    matricule: '4071',
    fonction: 'Responsable Développement & Intégration IT',
    analytique: 'IT-2026-001',
    objet: 'Visite chantier',
    lieu: 'Assinie',
    dateDepart: new Date('2026-08-19T13:00:00.000Z'),
    dateRetour: new Date('2026-08-19T17:00:00.000Z'),
    transportType: TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: '1234 AB 01',
    litresGasoil: null,
    status: MissionStatus.APPROVED,
    motifRefus: null,
    submittedAt: new Date('2026-08-17T08:00:00.000Z'),
    decidedAt: new Date('2026-08-18T09:30:00.000Z'),
    decidedByName: 'FATOUMATA DIALLO',
    decidedByEmail: 'rh@porteo-group.com',
    relances: 0,
    createdAt: new Date('2026-08-17T07:00:00.000Z'),
    updatedAt: new Date('2026-08-18T09:30:00.000Z'),
    ...surcharges,
  } as MissionResume;
}

describe('export CSV', () => {
  it('commence par un BOM et un en-tête séparé par des points-virgules', () => {
    const csv = construireCsv([missionCsv()]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('Numéro;Statut;Nom;Prénoms');
  });

  it('exporte les valeurs en français', () => {
    const csv = construireCsv([missionCsv()]);

    expect(csv).toContain('OM-2026-0001');
    expect(csv).toContain('Validé');
    expect(csv).toContain("Véhicule de l'établissement");
    expect(csv).toContain('19/08/2026 à 13h00');
  });

  it('échappe les valeurs contenant un séparateur, un guillemet ou un saut de ligne', () => {
    const csv = construireCsv([
      missionCsv({
        objet: 'Visite; chantier',
        motifRefus: 'Motif avec "guillemets"',
        lieu: 'Ligne 1\nLigne 2',
      }),
    ]);

    expect(csv).toContain('"Visite; chantier"');
    expect(csv).toContain('"Motif avec ""guillemets"""');
    expect(csv).toContain('"Ligne 1\nLigne 2"');
  });

  it('gère une liste vide', () => {
    const csv = construireCsv([]);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('nomme le fichier avec la date du jour', () => {
    expect(nomFichierCsv(new Date('2026-08-20T10:00:00.000Z'))).toBe(
      'ordres-de-mission-2026-08-20.csv',
    );
  });
});

describe('filtres passés par l’URL', () => {
  it('ignore les valeurs invalides', () => {
    const filtres = analyserParamsRH({ statut: 'INCONNU', tri: 'nimporte', page: 'abc' });

    expect(filtres.status).toBeUndefined();
    expect(filtres.tri).toBe('recent');
    expect(filtres.page).toBe(1);
  });

  it('retient les valeurs valides', () => {
    const filtres = analyserParamsRH({
      statut: 'SUBMITTED',
      tri: 'depart',
      page: '3',
      q: 'Assinie',
      lieu: 'Assinie',
      du: '2026-08-01',
      au: '2026-08-31',
    });

    expect(filtres.status).toBe(MissionStatus.SUBMITTED);
    expect(filtres.tri).toBe('depart');
    expect(filtres.page).toBe(3);
    expect(filtres.recherche).toBe('Assinie');
    expect(filtres.du?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    // La borne haute couvre toute la journée.
    expect(filtres.au?.toISOString()).toBe('2026-08-31T23:59:59.000Z');
  });

  it('refuse une page négative', () => {
    expect(analyserParamsRH({ page: '-4' }).page).toBe(1);
  });

  it('reconstruit une query string sans les valeurs vides', () => {
    expect(construireQuery({ statut: 'SUBMITTED', q: '' }, { page: '2' })).toBe(
      '?statut=SUBMITTED&page=2',
    );
    expect(construireQuery({}, {})).toBe('');
    expect(construireQuery({ statut: 'SUBMITTED' }, { statut: undefined })).toBe('');
  });
});
