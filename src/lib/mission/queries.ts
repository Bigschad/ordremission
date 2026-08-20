import { type MissionStatus, type Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { UtilisateurCourant } from '@/lib/session';

/**
 * Accès en lecture aux ordres de mission.
 * Règle 9 : un collaborateur ne voit que ses propres ordres ; seuls les rôles
 * HR et ADMIN disposent d'une vue globale. Le filtre est appliqué **ici**,
 * jamais dans l'interface.
 */

export const missionSelect = {
  id: true,
  numero: true,
  demandeurId: true,
  nom: true,
  prenoms: true,
  matricule: true,
  fonction: true,
  analytique: true,
  objet: true,
  lieu: true,
  dateDepart: true,
  dateRetour: true,
  transportType: true,
  transportDetail: true,
  litresGasoil: true,
  status: true,
  motifRefus: true,
  submittedAt: true,
  decidedAt: true,
  decidedByName: true,
  decidedByEmail: true,
  relances: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MissionOrderSelect;

export type MissionResume = Prisma.MissionOrderGetPayload<{ select: typeof missionSelect }>;

/** Vue globale réservée aux RH et administrateurs. */
export function aVueGlobale(utilisateur: Pick<UtilisateurCourant, 'role'>): boolean {
  return utilisateur.role === Role.HR || utilisateur.role === Role.ADMIN;
}

/** Restriction appliquée à toute lecture, selon le rôle. */
export function portee(utilisateur: UtilisateurCourant): Prisma.MissionOrderWhereInput {
  return aVueGlobale(utilisateur) ? {} : { demandeurId: utilisateur.id };
}

/** Ordres de mission du collaborateur connecté. */
export function listerMesMissions(
  utilisateur: UtilisateurCourant,
  filtres: { status?: MissionStatus } = {},
): Promise<MissionResume[]> {
  return prisma.missionOrder.findMany({
    where: {
      demandeurId: utilisateur.id,
      ...(filtres.status ? { status: filtres.status } : {}),
    },
    select: missionSelect,
    orderBy: [{ createdAt: 'desc' }],
  });
}

/**
 * Lecture d'un ordre de mission avec contrôle d'accès.
 * Renvoie `null` si l'ordre n'existe pas **ou** si l'utilisateur n'y a pas
 * droit : les deux cas sont indiscernables pour l'appelant.
 */
export async function trouverMission(
  utilisateur: UtilisateurCourant,
  id: string,
): Promise<MissionResume | null> {
  return prisma.missionOrder.findFirst({
    where: { id, ...portee(utilisateur) },
    select: missionSelect,
  });
}

export interface FiltresRH {
  status?: MissionStatus;
  demandeurId?: string;
  lieu?: string;
  recherche?: string;
  du?: Date;
  au?: Date;
  tri?: 'recent' | 'ancien' | 'depart' | 'numero';
  page?: number;
  parPage?: number;
}

export const PAR_PAGE_DEFAUT = 20;

function whereRH(filtres: FiltresRH): Prisma.MissionOrderWhereInput {
  const conditions: Prisma.MissionOrderWhereInput[] = [];

  if (filtres.status) conditions.push({ status: filtres.status });
  if (filtres.demandeurId) conditions.push({ demandeurId: filtres.demandeurId });
  if (filtres.lieu) conditions.push({ lieu: { contains: filtres.lieu, mode: 'insensitive' } });

  if (filtres.du) conditions.push({ dateDepart: { gte: filtres.du } });
  if (filtres.au) conditions.push({ dateDepart: { lte: filtres.au } });

  if (filtres.recherche) {
    const terme = filtres.recherche.trim();
    if (terme.length > 0) {
      conditions.push({
        OR: [
          { numero: { contains: terme, mode: 'insensitive' } },
          { nom: { contains: terme, mode: 'insensitive' } },
          { prenoms: { contains: terme, mode: 'insensitive' } },
          { matricule: { contains: terme, mode: 'insensitive' } },
          { objet: { contains: terme, mode: 'insensitive' } },
          { lieu: { contains: terme, mode: 'insensitive' } },
        ],
      });
    }
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function orderByRH(tri: FiltresRH['tri']): Prisma.MissionOrderOrderByWithRelationInput[] {
  switch (tri) {
    case 'ancien':
      return [{ createdAt: 'asc' }];
    case 'depart':
      return [{ dateDepart: 'asc' }];
    case 'numero':
      return [{ numero: 'asc' }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

export interface PageMissions {
  missions: MissionResume[];
  total: number;
  page: number;
  parPage: number;
  nbPages: number;
}

/** File d'attente RH : filtres, recherche, tri, pagination. */
export async function listerPourRH(filtres: FiltresRH = {}): Promise<PageMissions> {
  const parPage = filtres.parPage ?? PAR_PAGE_DEFAUT;
  const page = Math.max(1, filtres.page ?? 1);
  const where = whereRH(filtres);

  const [missions, total] = await Promise.all([
    prisma.missionOrder.findMany({
      where,
      select: missionSelect,
      orderBy: orderByRH(filtres.tri),
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.missionOrder.count({ where }),
  ]);

  return {
    missions,
    total,
    page,
    parPage,
    nbPages: Math.max(1, Math.ceil(total / parPage)),
  };
}

/** Même filtrage que la file d'attente, sans pagination — pour l'export CSV. */
export function listerPourExport(filtres: FiltresRH = {}): Promise<MissionResume[]> {
  return prisma.missionOrder.findMany({
    where: whereRH(filtres),
    select: missionSelect,
    orderBy: orderByRH(filtres.tri),
    take: 5000,
  });
}

/** Compteurs par statut, pour les onglets de filtre. */
export async function compterParStatut(
  where: Prisma.MissionOrderWhereInput = {},
): Promise<Record<MissionStatus, number>> {
  const lignes = await prisma.missionOrder.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const compteurs: Record<MissionStatus, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };

  for (const ligne of lignes) {
    compteurs[ligne.status] = ligne._count._all;
  }

  return compteurs;
}

/** Ordre de mission destiné au PDF ou à la page publique de vérification. */
export function trouverMissionParNumero(numero: string) {
  return prisma.missionOrder.findUnique({
    where: { numero },
    select: {
      numero: true,
      objet: true,
      lieu: true,
      status: true,
      dateDepart: true,
      dateRetour: true,
      submittedAt: true,
      decidedAt: true,
      decidedByName: true,
    },
  });
}
