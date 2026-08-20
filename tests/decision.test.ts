import { MissionStatus } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appliquerDecision, VALIDEUR_BOITE_RH } from '@/lib/mission/decision';
import { creerTokensApprobation, resoudreToken } from '@/lib/mission/tokens';
import { creerMissionTest, creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

/**
 * Application d'une décision RH : atomicité, invalidation croisée des jetons
 * et refus des décisions concurrentes.
 */

const VALIDEUR = { id: null, nom: VALIDEUR_BOITE_RH.nom, email: 'rh@porteo-group.com' };

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

async function missionEnAttente() {
  const utilisateur = await creerUtilisateurTest();
  return creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
}

describe('validation', () => {
  it('passe l’ordre au statut validé et fige le valideur', async () => {
    const mission = await missionEnAttente();

    const resultat = await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'APPROVE',
      valideur: VALIDEUR,
    });

    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.mission.status).toBe(MissionStatus.APPROVED);
      expect(resultat.mission.decidedByName).toBe(VALIDEUR.nom);
      expect(resultat.mission.decidedByEmail).toBe(VALIDEUR.email);
      expect(resultat.mission.decidedAt).not.toBeNull();
      expect(resultat.mission.motifRefus).toBeNull();
    }
  });

  it('consomme les deux jetons (règle 7)', async () => {
    const mission = await missionEnAttente();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'APPROVE',
      valideur: VALIDEUR,
    });

    expect((await resoudreToken(prismaTest, jetons.approuver)).valide).toBe(false);
    expect((await resoudreToken(prismaTest, jetons.refuser)).valide).toBe(false);
  });

  it('journalise la décision', async () => {
    const mission = await missionEnAttente();

    await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'APPROVE',
      valideur: VALIDEUR,
      ip: '41.66.0.1',
    });

    const journal = await prismaTest.auditLog.findMany({
      where: { entite: 'MissionOrder', entiteId: mission.id },
    });

    expect(journal.map((entree) => entree.action)).toContain('APPROVED');
    expect(journal[0]?.ip).toBe('41.66.0.1');
  });
});

describe('refus', () => {
  it('enregistre le motif', async () => {
    const mission = await missionEnAttente();

    const resultat = await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'REJECT',
      valideur: VALIDEUR,
      motifRefus: 'Budget déplacement déjà consommé pour le mois en cours.',
    });

    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.mission.status).toBe(MissionStatus.REJECTED);
      expect(resultat.mission.motifRefus).toMatch(/Budget déplacement/);
    }
  });
});

describe('décisions concurrentes', () => {
  it('n’en retient qu’une seule', async () => {
    const mission = await missionEnAttente();

    const [premiere, seconde] = await Promise.all([
      appliquerDecision({ missionOrderId: mission.id, sens: 'APPROVE', valideur: VALIDEUR }),
      appliquerDecision({
        missionOrderId: mission.id,
        sens: 'REJECT',
        valideur: VALIDEUR,
        motifRefus: 'Refus concurrent qui ne doit pas aboutir.',
      }),
    ]);

    const reussies = [premiere, seconde].filter((resultat) => resultat.ok);
    expect(reussies).toHaveLength(1);

    const echouee = [premiere, seconde].find((resultat) => !resultat.ok);
    expect(echouee && !echouee.ok && echouee.motif).toBe('DEJA_DECIDE');
  });

  it('refuse une seconde décision après coup', async () => {
    const mission = await missionEnAttente();

    await appliquerDecision({ missionOrderId: mission.id, sens: 'APPROVE', valideur: VALIDEUR });
    const seconde = await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'REJECT',
      valideur: VALIDEUR,
      motifRefus: 'Tentative de revirement après validation.',
    });

    expect(seconde.ok).toBe(false);
    if (!seconde.ok) {
      expect(seconde.motif).toBe('DEJA_DECIDE');
      expect(seconde.message).toMatch(/déjà été prise/);
    }

    const relue = await prismaTest.missionOrder.findUniqueOrThrow({ where: { id: mission.id } });
    expect(relue.status).toBe(MissionStatus.APPROVED);
  });
});

describe('cas d’erreur', () => {
  it('refuse de décider d’un ordre annulé (règle 6)', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id, { status: MissionStatus.CANCELLED });

    const resultat = await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'APPROVE',
      valideur: VALIDEUR,
    });

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.motif).toBe('DEJA_DECIDE');
      expect(resultat.message).toMatch(/annulé/);
    }
  });

  it('refuse de décider d’un brouillon', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id, { status: MissionStatus.DRAFT });

    const resultat = await appliquerDecision({
      missionOrderId: mission.id,
      sens: 'APPROVE',
      valideur: VALIDEUR,
    });

    expect(resultat.ok).toBe(false);
  });

  it('signale un ordre de mission introuvable', async () => {
    const resultat = await appliquerDecision({
      missionOrderId: 'identifiant-inexistant',
      sens: 'APPROVE',
      valideur: VALIDEUR,
    });

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.motif).toBe('INTROUVABLE');
  });
});
