import { PrismaClient, Role } from '@prisma/client';

/**
 * Client Prisma partagé par les tests.
 * Il pointe sur la base décrite par `.env.test`, chargée par `vitest.config.ts`.
 */
export const prismaTest = new PrismaClient();

/** Vide les tables métier entre deux tests. */
export async function reinitialiserBase(): Promise<void> {
  await prismaTest.approvalToken.deleteMany();
  await prismaTest.auditLog.deleteMany();
  await prismaTest.missionOrder.deleteMany();
  await prismaTest.counter.deleteMany();
  await prismaTest.rateLimit.deleteMany();
  await prismaTest.user.deleteMany();
}

let compteur = 0;

/** Crée un collaborateur de test aux identifiants uniques. */
export async function creerUtilisateurTest(
  surcharges: Partial<{
    nom: string;
    prenoms: string;
    fonction: string;
    role: Role;
    actif: boolean;
  }> = {},
) {
  compteur += 1;

  return prismaTest.user.create({
    data: {
      nom: surcharges.nom ?? 'YEYE',
      prenoms: surcharges.prenoms ?? 'SCHADRACH GUY-ROLAND',
      matricule: `T${String(compteur).padStart(4, '0')}`,
      fonction: surcharges.fonction ?? 'Responsable Développement & Intégration IT',
      email: `test${compteur}@porteo-group.com`,
      role: surcharges.role ?? Role.EMPLOYEE,
      actif: surcharges.actif ?? true,
    },
  });
}

/** Crée un ordre de mission de test rattaché à un demandeur. */
export async function creerMissionTest(
  demandeurId: string,
  surcharges: Partial<{
    numero: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    objet: string;
    lieu: string;
  }> = {},
) {
  compteur += 1;

  return prismaTest.missionOrder.create({
    data: {
      numero: surcharges.numero ?? `TEST-${compteur}`,
      demandeurId,
      nom: 'YEYE',
      prenoms: 'SCHADRACH GUY-ROLAND',
      matricule: '4071',
      fonction: 'Responsable Développement & Intégration IT',
      objet: surcharges.objet ?? 'Visite chantier',
      lieu: surcharges.lieu ?? 'Assinie',
      dateDepart: new Date('2026-08-19T13:00:00.000Z'),
      dateRetour: new Date('2026-08-19T17:00:00.000Z'),
      transportType: 'VEHICULE_ETABLISSEMENT',
      transportDetail: '1234 AB 01',
      litresGasoil: 40,
      status: surcharges.status ?? 'SUBMITTED',
      submittedAt: surcharges.status === 'DRAFT' ? null : new Date(),
    },
  });
}
