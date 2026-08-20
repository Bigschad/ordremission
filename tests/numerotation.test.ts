import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attribuerNumero,
  estNumeroProvisoire,
  estNumeroValide,
  formatNumero,
  numeroProvisoire,
  prochaineSequence,
} from '@/lib/mission/numero';
import { prismaTest, reinitialiserBase, SUR_SQLITE } from './aide-base';

/**
 * Numérotation des ordres de mission.
 * Le test central est celui de concurrence : 50 soumissions simultanées ne
 * doivent produire aucune collision ni aucun trou dans la séquence.
 */

beforeEach(async () => {
  await reinitialiserBase();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe('mise en forme', () => {
  it('produit un numéro sur quatre chiffres', () => {
    expect(formatNumero(2026, 1)).toBe('OM-2026-0001');
    expect(formatNumero(2026, 42)).toBe('OM-2026-0042');
    expect(formatNumero(2026, 9999)).toBe('OM-2026-9999');
  });

  it('reconnaît un numéro valide', () => {
    expect(estNumeroValide('OM-2026-0001')).toBe(true);
    expect(estNumeroValide('OM-2026-1')).toBe(false);
    expect(estNumeroValide('2026-0001')).toBe(false);
    expect(estNumeroValide('')).toBe(false);
  });

  it('distingue un numéro provisoire d’un numéro définitif', () => {
    expect(estNumeroProvisoire(numeroProvisoire())).toBe(true);
    expect(estNumeroProvisoire('OM-2026-0001')).toBe(false);
  });

  it('génère des numéros provisoires distincts', () => {
    const numeros = new Set(Array.from({ length: 500 }, () => numeroProvisoire()));
    expect(numeros.size).toBe(500);
  });
});

describe('séquence par année', () => {
  it('démarre à 1 et s’incrémente', async () => {
    expect(await prochaineSequence(prismaTest, 2026)).toBe(1);
    expect(await prochaineSequence(prismaTest, 2026)).toBe(2);
    expect(await prochaineSequence(prismaTest, 2026)).toBe(3);
  });

  it('tient une séquence indépendante par année', async () => {
    expect(await prochaineSequence(prismaTest, 2026)).toBe(1);
    expect(await prochaineSequence(prismaTest, 2027)).toBe(1);
    expect(await prochaineSequence(prismaTest, 2026)).toBe(2);
    expect(await prochaineSequence(prismaTest, 2027)).toBe(2);
  });

  it('attribue un numéro complet', async () => {
    expect(await attribuerNumero(prismaTest, 2026)).toBe('OM-2026-0001');
    expect(await attribuerNumero(prismaTest, 2026)).toBe('OM-2026-0002');
  });
});

/*
 * Ces deux tests valident le verrou de ligne PostgreSQL sur la table `Counter`.
 * SQLite sérialise toutes les écritures derrière un verrou global : la question
 * ne s'y pose pas, et 50 transactions imbriquées y expirent. La suite complète
 * s'exécute donc avec `pnpm test:pg`, sur le moteur de production.
 */
describe.skipIf(SUR_SQLITE)('concurrence — 50 soumissions simultanées', () => {
  it('n’attribue jamais deux fois le même numéro', async () => {
    const NOMBRE = 50;

    const numeros = await Promise.all(
      Array.from({ length: NOMBRE }, () =>
        prismaTest.$transaction((tx) => attribuerNumero(tx, 2026)),
      ),
    );

    // Aucune collision…
    expect(new Set(numeros).size).toBe(NOMBRE);

    // …et aucun trou : la séquence couvre exactement 1..50.
    const sequences = numeros.map((numero) => Number(numero.slice(-4))).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: NOMBRE }, (_, index) => index + 1));

    const compteur = await prismaTest.counter.findUnique({ where: { annee: 2026 } });
    expect(compteur?.sequence).toBe(NOMBRE);
  });

  it('garantit l’unicité en base, contrainte comprise', async () => {
    const utilisateur = await prismaTest.user.create({
      data: {
        nom: 'YEYE',
        prenoms: 'SCHADRACH GUY-ROLAND',
        matricule: 'C-4071',
        fonction: 'Responsable Développement & Intégration IT',
        email: 'concurrence@porteo-group.com',
      },
    });

    const NOMBRE = 50;

    // Chaque transaction attribue son numéro puis crée l'ordre de mission :
    // c'est exactement le déroulement de la Server Action de soumission.
    const creations = await Promise.all(
      Array.from({ length: NOMBRE }, () =>
        prismaTest.$transaction(async (tx) => {
          const numero = await attribuerNumero(tx, 2026);
          return tx.missionOrder.create({
            data: {
              numero,
              demandeurId: utilisateur.id,
              nom: utilisateur.nom,
              prenoms: utilisateur.prenoms,
              matricule: utilisateur.matricule,
              fonction: utilisateur.fonction,
              objet: 'Visite chantier',
              lieu: 'Assinie',
              dateDepart: new Date('2026-08-19T13:00:00.000Z'),
              dateRetour: new Date('2026-08-19T17:00:00.000Z'),
              transportType: 'VEHICULE_ETABLISSEMENT',
              status: 'SUBMITTED',
              submittedAt: new Date(),
            },
            select: { numero: true },
          });
        }),
      ),
    );

    expect(new Set(creations.map((creation) => creation.numero)).size).toBe(NOMBRE);
    expect(await prismaTest.missionOrder.count()).toBe(NOMBRE);
  });
});
