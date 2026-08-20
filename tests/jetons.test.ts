import { MissionStatus } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  calculerExpiration,
  comparerEmpreintes,
  creerTokensApprobation,
  hacherToken,
  invaliderTokens,
  resoudreToken,
  TOKEN_VALIDITE_JOURS,
} from '@/lib/mission/tokens';
import { creerMissionTest, creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

/**
 * Cycle de vie des jetons d'approbation (règles 6 et 7) :
 * création, usage unique, expiration, invalidation croisée.
 */

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

async function missionSoumise(status: MissionStatus = MissionStatus.SUBMITTED) {
  const utilisateur = await creerUtilisateurTest();
  return creerMissionTest(utilisateur.id, { status });
}

describe('empreinte', () => {
  it('ne stocke jamais le jeton en clair', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const enregistrements = await prismaTest.approvalToken.findMany({
      where: { missionOrderId: mission.id },
    });

    for (const enregistrement of enregistrements) {
      expect(enregistrement.tokenHash).not.toBe(jetons.approuver);
      expect(enregistrement.tokenHash).not.toBe(jetons.refuser);
      // SHA-256 en hexadécimal : 64 caractères.
      expect(enregistrement.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('produit une empreinte stable et comparable à temps constant', () => {
    expect(hacherToken('abc')).toBe(hacherToken('abc'));
    expect(hacherToken('abc')).not.toBe(hacherToken('abd'));
    expect(comparerEmpreintes(hacherToken('abc'), hacherToken('abc'))).toBe(true);
    expect(comparerEmpreintes(hacherToken('abc'), hacherToken('abd'))).toBe(false);
    expect(comparerEmpreintes('court', 'beaucoup plus long')).toBe(false);
  });

  it('génère des jetons distincts et suffisamment longs', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    expect(jetons.approuver).not.toBe(jetons.refuser);
    // 32 octets encodés en base64url ⇒ 43 caractères.
    expect(jetons.approuver.length).toBeGreaterThanOrEqual(43);
    expect(jetons.refuser.length).toBeGreaterThanOrEqual(43);
  });
});

describe('création', () => {
  it(`fixe l'expiration à ${TOKEN_VALIDITE_JOURS} jours`, async () => {
    const mission = await missionSoumise();
    const maintenant = new Date('2026-08-20T12:00:00.000Z');
    const jetons = await creerTokensApprobation(prismaTest, mission.id, maintenant);

    expect(jetons.expireLe.toISOString()).toBe('2026-08-27T12:00:00.000Z');
    expect(calculerExpiration(maintenant).toISOString()).toBe('2026-08-27T12:00:00.000Z');
  });

  it('émet exactement un jeton par action', async () => {
    const mission = await missionSoumise();
    await creerTokensApprobation(prismaTest, mission.id);

    const actifs = await prismaTest.approvalToken.findMany({
      where: { missionOrderId: mission.id, usedAt: null },
    });

    expect(actifs).toHaveLength(2);
    expect(actifs.map((jeton) => jeton.action).sort()).toEqual(['APPROVE', 'REJECT']);
  });

  it('rend caducs les jetons du message précédent lors d’une relance', async () => {
    const mission = await missionSoumise();
    const anciens = await creerTokensApprobation(prismaTest, mission.id);
    const nouveaux = await creerTokensApprobation(prismaTest, mission.id);

    const ancien = await resoudreToken(prismaTest, anciens.approuver);
    expect(ancien.valide).toBe(false);
    if (!ancien.valide) expect(ancien.motif).toBe('DEJA_UTILISE');

    const nouveau = await resoudreToken(prismaTest, nouveaux.approuver);
    expect(nouveau.valide).toBe(true);
  });
});

describe('résolution', () => {
  it('accepte un jeton neuf et renvoie son action', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const approbation = await resoudreToken(prismaTest, jetons.approuver);
    expect(approbation.valide).toBe(true);
    if (approbation.valide) {
      expect(approbation.action).toBe('APPROVE');
      expect(approbation.missionOrderId).toBe(mission.id);
    }

    const refus = await resoudreToken(prismaTest, jetons.refuser);
    expect(refus.valide).toBe(true);
    if (refus.valide) expect(refus.action).toBe('REJECT');
  });

  it('refuse un jeton inconnu, vide ou trop court', async () => {
    for (const valeur of ['', 'court', 'x'.repeat(43)]) {
      const resolution = await resoudreToken(prismaTest, valeur);
      expect(resolution.valide).toBe(false);
      if (!resolution.valide) expect(resolution.motif).toBe('INTROUVABLE');
    }
  });

  it('refuse un jeton expiré', async () => {
    const mission = await missionSoumise();
    const emisIlYaHuitJours = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    const jetons = await creerTokensApprobation(prismaTest, mission.id, emisIlYaHuitJours);

    const resolution = await resoudreToken(prismaTest, jetons.approuver);
    expect(resolution.valide).toBe(false);
    if (!resolution.valide) expect(resolution.motif).toBe('EXPIRE');
  });

  it('accepte un jeton la veille de son expiration', async () => {
    const mission = await missionSoumise();
    const emisIlYaSixJours = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    const jetons = await creerTokensApprobation(prismaTest, mission.id, emisIlYaSixJours);

    expect((await resoudreToken(prismaTest, jetons.approuver)).valide).toBe(true);
  });

  it('n’a aucun effet de bord : deux résolutions successives réussissent', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    // Les scanners d'e-mails préchargent les liens : consulter ne consomme pas.
    expect((await resoudreToken(prismaTest, jetons.approuver)).valide).toBe(true);
    expect((await resoudreToken(prismaTest, jetons.approuver)).valide).toBe(true);

    const enregistrement = await prismaTest.approvalToken.findUnique({
      where: { tokenHash: hacherToken(jetons.approuver) },
    });
    expect(enregistrement?.usedAt).toBeNull();
  });
});

describe('usage unique et invalidation croisée (règle 7)', () => {
  it('refuse un jeton déjà consommé', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await invaliderTokens(prismaTest, mission.id);

    const resolution = await resoudreToken(prismaTest, jetons.approuver);
    expect(resolution.valide).toBe(false);
    if (!resolution.valide) expect(resolution.motif).toBe('DEJA_UTILISE');
  });

  it('consomme les deux jetons ensemble', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const consommes = await invaliderTokens(prismaTest, mission.id);
    expect(consommes).toBe(2);

    expect((await resoudreToken(prismaTest, jetons.approuver)).valide).toBe(false);
    expect((await resoudreToken(prismaTest, jetons.refuser)).valide).toBe(false);
  });

  it('n’invalide pas deux fois : le second appel ne touche aucune ligne', async () => {
    const mission = await missionSoumise();
    await creerTokensApprobation(prismaTest, mission.id);

    expect(await invaliderTokens(prismaTest, mission.id)).toBe(2);
    expect(await invaliderTokens(prismaTest, mission.id)).toBe(0);
  });

  it('explique qu’une décision a déjà été prise', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await invaliderTokens(prismaTest, mission.id);
    await prismaTest.missionOrder.update({
      where: { id: mission.id },
      data: { status: MissionStatus.APPROVED, decidedAt: new Date() },
    });

    const resolution = await resoudreToken(prismaTest, jetons.approuver);
    expect(resolution.valide).toBe(false);
    if (!resolution.valide) expect(resolution.motif).toBe('DECISION_DEJA_PRISE');
  });

  it('signale un ordre de mission annulé (règle 6)', async () => {
    const mission = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await prismaTest.missionOrder.update({
      where: { id: mission.id },
      data: { status: MissionStatus.CANCELLED },
    });

    const resolution = await resoudreToken(prismaTest, jetons.approuver);
    expect(resolution.valide).toBe(false);
    if (!resolution.valide) expect(resolution.motif).toBe('ORDRE_ANNULE');
  });

  it('refuse un jeton dont l’ordre n’est plus en attente', async () => {
    const mission = await missionSoumise(MissionStatus.DRAFT);
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const resolution = await resoudreToken(prismaTest, jetons.approuver);
    expect(resolution.valide).toBe(false);
    if (!resolution.valide) expect(resolution.motif).toBe('DECISION_DEJA_PRISE');
  });

  it('supprime les jetons avec l’ordre de mission', async () => {
    const mission = await missionSoumise();
    await creerTokensApprobation(prismaTest, mission.id);

    await prismaTest.missionOrder.delete({ where: { id: mission.id } });

    expect(await prismaTest.approvalToken.count({ where: { missionOrderId: mission.id } })).toBe(0);
  });
});
