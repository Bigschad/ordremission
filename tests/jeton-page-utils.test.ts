import { MissionStatus } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { preparerPageJeton } from '@/lib/mission/jeton-page';
import { creerTokensApprobation } from '@/lib/mission/tokens';
import { cn } from '@/lib/utils';
import { creerMissionTest, creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe('préparation des pages /approve et /reject', () => {
  it('affiche l’ordre de mission pour un jeton valide', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const etat = await preparerPageJeton(jetons.approuver, 'APPROVE');

    expect(etat.valide).toBe(true);
    if (etat.valide) {
      expect(etat.mission.id).toBe(mission.id);
      expect(etat.token).toBe(jetons.approuver);
    }
  });

  it('refuse un jeton de refus sur la page de validation', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const etat = await preparerPageJeton(jetons.refuser, 'APPROVE');

    expect(etat.valide).toBe(false);
    if (!etat.valide) expect(etat.message).toMatch(/ne correspond pas/);
  });

  it('explique qu’un lien inconnu est inutilisable', async () => {
    const etat = await preparerPageJeton('jeton-totalement-inconnu-mais-assez-long', 'APPROVE');

    expect(etat.valide).toBe(false);
    if (!etat.valide) expect(etat.message).toMatch(/n'est pas valide/);
  });

  it('n’a aucun effet de bord : le jeton reste consommable', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id, { status: MissionStatus.SUBMITTED });
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await preparerPageJeton(jetons.approuver, 'APPROVE');
    await preparerPageJeton(jetons.approuver, 'APPROVE');

    const restants = await prismaTest.approvalToken.count({
      where: { missionOrderId: mission.id, usedAt: null },
    });
    expect(restants).toBe(2);
  });
});

describe('fusion de classes utilitaires', () => {
  it('concatène et déduplique les classes Tailwind', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
    // La dernière valeur d'un même utilitaire l'emporte.
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('px-2', false && 'hidden', undefined, 'block')).toBe('px-2 block');
  });
});
