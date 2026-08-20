import { MissionStatus, Role } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  aVueGlobale,
  compterParStatut,
  listerMesMissions,
  listerPourExport,
  listerPourRH,
  portee,
  trouverMission,
  trouverMissionParNumero,
} from '@/lib/mission/queries';
import type { UtilisateurCourant } from '@/lib/session';
import { creerMissionTest, creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

/**
 * Règle 9 : un collaborateur ne consulte que ses propres ordres de mission ;
 * seuls les rôles HR et ADMIN disposent d'une vue globale. Le filtrage est
 * appliqué dans les requêtes — c'est donc ici qu'il doit être vérifié.
 */

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

function courant(utilisateur: {
  id: string;
  email: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  role: Role;
  actif: boolean;
}): UtilisateurCourant {
  return utilisateur;
}

describe('portée de lecture selon le rôle', () => {
  it('restreint un collaborateur à ses propres ordres', async () => {
    const collaborateur = await creerUtilisateurTest({ role: Role.EMPLOYEE });

    expect(aVueGlobale(collaborateur)).toBe(false);
    expect(portee(courant(collaborateur))).toEqual({ demandeurId: collaborateur.id });
  });

  it('ouvre la vue globale aux RH et aux administrateurs', async () => {
    const rh = await creerUtilisateurTest({ role: Role.HR });
    const admin = await creerUtilisateurTest({ role: Role.ADMIN });

    expect(aVueGlobale(rh)).toBe(true);
    expect(aVueGlobale(admin)).toBe(true);
    expect(portee(courant(rh))).toEqual({});
    expect(portee(courant(admin))).toEqual({});
  });
});

describe('lecture d’un ordre de mission', () => {
  it('rend l’ordre d’autrui indiscernable d’un ordre inexistant', async () => {
    const proprietaire = await creerUtilisateurTest();
    const intrus = await creerUtilisateurTest();
    const mission = await creerMissionTest(proprietaire.id);

    expect(await trouverMission(courant(proprietaire), mission.id)).not.toBeNull();
    expect(await trouverMission(courant(intrus), mission.id)).toBeNull();
    expect(await trouverMission(courant(proprietaire), 'identifiant-inexistant')).toBeNull();
  });

  it('laisse les RH consulter l’ordre de n’importe quel collaborateur', async () => {
    const collaborateur = await creerUtilisateurTest();
    const rh = await creerUtilisateurTest({ role: Role.HR });
    const mission = await creerMissionTest(collaborateur.id);

    expect(await trouverMission(courant(rh), mission.id)).not.toBeNull();
  });
});

describe('liste personnelle', () => {
  it('ne renvoie que les ordres du collaborateur, et sait filtrer par statut', async () => {
    const premier = await creerUtilisateurTest();
    const second = await creerUtilisateurTest();

    await creerMissionTest(premier.id, { status: MissionStatus.DRAFT });
    await creerMissionTest(premier.id, { status: MissionStatus.SUBMITTED });
    await creerMissionTest(second.id, { status: MissionStatus.SUBMITTED });

    expect(await listerMesMissions(courant(premier))).toHaveLength(2);
    expect(await listerMesMissions(courant(premier), { status: MissionStatus.DRAFT })).toHaveLength(
      1,
    );
    expect(await listerMesMissions(courant(second))).toHaveLength(1);
  });
});

describe('file d’attente RH', () => {
  it('filtre par statut, demandeur, lieu et période', async () => {
    const yeye = await creerUtilisateurTest({ nom: 'YEYE' });
    const bamba = await creerUtilisateurTest({ nom: 'BAMBA' });

    await creerMissionTest(yeye.id, { status: MissionStatus.SUBMITTED, lieu: 'Assinie' });
    await creerMissionTest(yeye.id, { status: MissionStatus.APPROVED, lieu: 'Bouaké' });
    await creerMissionTest(bamba.id, { status: MissionStatus.SUBMITTED, lieu: 'Korhogo' });

    expect((await listerPourRH({})).total).toBe(3);
    expect((await listerPourRH({ status: MissionStatus.SUBMITTED })).total).toBe(2);
    expect((await listerPourRH({ demandeurId: yeye.id })).total).toBe(2);
    expect((await listerPourRH({ lieu: 'assinie' })).total).toBe(1);
    expect((await listerPourRH({ du: new Date('2026-08-19T00:00:00.000Z') })).total).toBe(3);
    expect((await listerPourRH({ au: new Date('2026-08-18T00:00:00.000Z') })).total).toBe(0);
  });

  it('recherche sur le numéro, le nom, le matricule, l’objet et le lieu', async () => {
    const utilisateur = await creerUtilisateurTest();
    await creerMissionTest(utilisateur.id, { numero: 'OM-2026-0042', objet: 'Visite chantier' });

    expect((await listerPourRH({ recherche: 'OM-2026-0042' })).total).toBe(1);
    expect((await listerPourRH({ recherche: 'yeye' })).total).toBe(1);
    expect((await listerPourRH({ recherche: '4071' })).total).toBe(1);
    expect((await listerPourRH({ recherche: 'chantier' })).total).toBe(1);
    expect((await listerPourRH({ recherche: 'introuvable' })).total).toBe(0);
    // Une recherche vide n'ajoute aucune contrainte.
    expect((await listerPourRH({ recherche: '   ' })).total).toBe(1);
  });

  it('pagine et trie', async () => {
    const utilisateur = await creerUtilisateurTest();
    for (let index = 0; index < 5; index += 1) {
      await creerMissionTest(utilisateur.id, { numero: `OM-2026-000${index}` });
    }

    const page1 = await listerPourRH({ parPage: 2, page: 1 });
    expect(page1.missions).toHaveLength(2);
    expect(page1.nbPages).toBe(3);

    const page3 = await listerPourRH({ parPage: 2, page: 3 });
    expect(page3.missions).toHaveLength(1);

    for (const tri of ['recent', 'ancien', 'depart', 'numero'] as const) {
      expect((await listerPourRH({ tri })).missions, tri).toHaveLength(5);
    }

    const parNumero = await listerPourRH({ tri: 'numero' });
    expect(parNumero.missions[0]?.numero).toBe('OM-2026-0000');
  });

  it('exporte sans pagination', async () => {
    const utilisateur = await creerUtilisateurTest();
    for (let index = 0; index < 25; index += 1) {
      await creerMissionTest(utilisateur.id, {
        numero: `OM-2026-${String(index).padStart(4, '0')}`,
      });
    }

    expect(await listerPourExport({})).toHaveLength(25);
    expect(await listerPourExport({ status: MissionStatus.DRAFT })).toHaveLength(0);
  });
});

describe('compteurs par statut', () => {
  it('renvoie zéro pour les statuts absents', async () => {
    const utilisateur = await creerUtilisateurTest();
    await creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
    await creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
    await creerMissionTest(utilisateur.id, { status: MissionStatus.APPROVED });

    const compteurs = await compterParStatut();
    expect(compteurs.SUBMITTED).toBe(2);
    expect(compteurs.APPROVED).toBe(1);
    expect(compteurs.DRAFT).toBe(0);
    expect(compteurs.REJECTED).toBe(0);
    expect(compteurs.CANCELLED).toBe(0);
  });

  it('sait se restreindre à un demandeur', async () => {
    const premier = await creerUtilisateurTest();
    const second = await creerUtilisateurTest();
    await creerMissionTest(premier.id, { status: MissionStatus.SUBMITTED });
    await creerMissionTest(second.id, { status: MissionStatus.SUBMITTED });

    expect((await compterParStatut({ demandeurId: premier.id })).SUBMITTED).toBe(1);
  });
});

describe('vérification publique par numéro', () => {
  it('n’expose aucune donnée personnelle sensible', async () => {
    const utilisateur = await creerUtilisateurTest();
    await creerMissionTest(utilisateur.id, {
      numero: 'OM-2026-0001',
      status: MissionStatus.APPROVED,
    });

    const publique = await trouverMissionParNumero('OM-2026-0001');
    expect(publique).not.toBeNull();
    expect(publique?.lieu).toBe('Assinie');

    // Ni matricule, ni nom du demandeur, ni objet détaillé.
    expect(publique).not.toHaveProperty('matricule');
    expect(publique).not.toHaveProperty('nom');
    expect(publique).not.toHaveProperty('transportDetail');
  });

  it('renvoie null pour un numéro inconnu', async () => {
    expect(await trouverMissionParNumero('OM-1999-0001')).toBeNull();
  });
});
