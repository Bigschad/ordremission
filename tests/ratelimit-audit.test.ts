import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auditActionLabel, getMissionAuditTrail, logAudit } from '@/lib/audit';
import { consommerRateLimit, debutFenetre, POLITIQUES, purgerRateLimits } from '@/lib/ratelimit';
import { creerMissionTest, creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe('fenêtre de rate limiting', () => {
  it('aligne le début de fenêtre sur des bornes fixes', () => {
    const debut = debutFenetre(new Date('2026-08-20T12:07:31.000Z'), 900);
    expect(debut.toISOString()).toBe('2026-08-20T12:00:00.000Z');

    const suivante = debutFenetre(new Date('2026-08-20T12:16:00.000Z'), 900);
    expect(suivante.toISOString()).toBe('2026-08-20T12:15:00.000Z');
  });
});

describe('consommation de jetons', () => {
  it('autorise jusqu’à la limite puis bloque', async () => {
    const options = { cle: 'test:limite', limite: 3, fenetreSecondes: 900 };
    const maintenant = new Date('2026-08-20T12:00:00.000Z');

    const premier = await consommerRateLimit(options, maintenant);
    expect(premier.autorise).toBe(true);
    expect(premier.restant).toBe(2);

    expect((await consommerRateLimit(options, maintenant)).autorise).toBe(true);
    expect((await consommerRateLimit(options, maintenant)).autorise).toBe(true);

    const quatrieme = await consommerRateLimit(options, maintenant);
    expect(quatrieme.autorise).toBe(false);
    expect(quatrieme.restant).toBe(0);
  });

  it('repart à zéro à la fenêtre suivante', async () => {
    const options = { cle: 'test:fenetre', limite: 1, fenetreSecondes: 900 };

    expect((await consommerRateLimit(options, new Date('2026-08-20T12:00:00.000Z'))).autorise).toBe(
      true,
    );
    expect((await consommerRateLimit(options, new Date('2026-08-20T12:05:00.000Z'))).autorise).toBe(
      false,
    );
    expect((await consommerRateLimit(options, new Date('2026-08-20T12:15:00.000Z'))).autorise).toBe(
      true,
    );
  });

  it('isole les clés les unes des autres', async () => {
    const maintenant = new Date('2026-08-20T12:00:00.000Z');

    await consommerRateLimit({ cle: 'ip:1', limite: 1, fenetreSecondes: 900 }, maintenant);

    const autre = await consommerRateLimit(
      { cle: 'ip:2', limite: 1, fenetreSecondes: 900 },
      maintenant,
    );
    expect(autre.autorise).toBe(true);
  });

  it('indique l’instant de réinitialisation', async () => {
    const resultat = await consommerRateLimit(
      { cle: 'test:reset', limite: 5, fenetreSecondes: 900 },
      new Date('2026-08-20T12:07:00.000Z'),
    );

    expect(resultat.reinitialisationA.toISOString()).toBe('2026-08-20T12:15:00.000Z');
  });

  it('résiste à la concurrence sans dépasser la limite', async () => {
    const options = { cle: 'test:concurrence', limite: 10, fenetreSecondes: 900 };
    const maintenant = new Date('2026-08-20T12:00:00.000Z');

    const resultats = await Promise.all(
      Array.from({ length: 25 }, () => consommerRateLimit(options, maintenant)),
    );

    expect(resultats.filter((resultat) => resultat.autorise)).toHaveLength(10);
  });

  it('purge les fenêtres expirées', async () => {
    await consommerRateLimit(
      { cle: 'test:purge', limite: 5, fenetreSecondes: 900 },
      new Date('2026-08-01T12:00:00.000Z'),
    );

    expect(await prismaTest.rateLimit.count()).toBe(1);
    await purgerRateLimits(new Date('2026-08-10T00:00:00.000Z'));
    expect(await prismaTest.rateLimit.count()).toBe(0);
  });

  it('définit des politiques cohérentes', () => {
    for (const politique of Object.values(POLITIQUES)) {
      expect(politique.limite).toBeGreaterThan(0);
      expect(politique.fenetreSecondes).toBeGreaterThan(0);
    }
  });
});

describe('journal d’audit', () => {
  it('enregistre une entrée et la relit par ordre antichronologique', async () => {
    const utilisateur = await creerUtilisateurTest();
    const mission = await creerMissionTest(utilisateur.id);

    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'CREATED',
      acteur: utilisateur.email,
    });
    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'SUBMITTED',
      acteur: utilisateur.email,
      details: { numero: mission.numero },
    });

    const historique = await getMissionAuditTrail(mission.id);
    expect(historique).toHaveLength(2);
    expect(historique[0]?.action).toBe('SUBMITTED');
  });

  it('n’échoue jamais, même sur une entité inexistante', async () => {
    await expect(
      logAudit({
        entite: 'MissionOrder',
        entiteId: 'inconnu',
        action: 'PDF_GENERATED',
        acteur: 'SYSTEM',
      }),
    ).resolves.toBeUndefined();
  });

  it('traduit les actions en libellés français', () => {
    expect(auditActionLabel('SUBMITTED')).toBe('Soumis aux Ressources Humaines');
    expect(auditActionLabel('APPROVED')).toBe('Validé par les Ressources Humaines');
    expect(auditActionLabel('TOKEN_REPLAYED')).toBe("Tentative de réutilisation d'un lien");
    // Une action inconnue est renvoyée telle quelle plutôt que masquée.
    expect(auditActionLabel('ACTION_INCONNUE')).toBe('ACTION_INCONNUE');
  });
});
