import { MissionStatus } from '@prisma/client';
import type { FiltresRH } from '@/lib/mission/queries';

/** Paramètres de recherche acceptés par la file d'attente RH. */
export interface ParamsRH {
  statut?: string;
  demandeur?: string;
  lieu?: string;
  q?: string;
  du?: string;
  au?: string;
  tri?: string;
  page?: string;
}

const TRIS_VALIDES = ['recent', 'ancien', 'depart', 'numero'] as const;

function estStatut(valeur: string | undefined): valeur is MissionStatus {
  return valeur !== undefined && Object.values(MissionStatus).includes(valeur as MissionStatus);
}

function estTri(valeur: string | undefined): valeur is FiltresRH['tri'] & string {
  return valeur !== undefined && (TRIS_VALIDES as readonly string[]).includes(valeur);
}

/** Date au format `yyyy-MM-dd` ; `finDeJournee` cadre la borne supérieure. */
function analyserDate(valeur: string | undefined, finDeJournee = false): Date | undefined {
  if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return undefined;
  const date = new Date(`${valeur}T${finDeJournee ? '23:59:59' : '00:00:00'}.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Convertit les paramètres d'URL en filtres de requête, en ignorant l'invalide. */
export function analyserParamsRH(params: ParamsRH): FiltresRH {
  const page = Number.parseInt(params.page ?? '1', 10);

  return {
    ...(estStatut(params.statut) ? { status: params.statut } : {}),
    ...(params.demandeur ? { demandeurId: params.demandeur } : {}),
    ...(params.lieu ? { lieu: params.lieu } : {}),
    ...(params.q ? { recherche: params.q } : {}),
    ...(analyserDate(params.du) ? { du: analyserDate(params.du) } : {}),
    ...(analyserDate(params.au, true) ? { au: analyserDate(params.au, true) } : {}),
    tri: estTri(params.tri) ? params.tri : 'recent',
    page: Number.isNaN(page) || page < 1 ? 1 : page,
  };
}

/** Reconstruit une query string en ne conservant que les valeurs renseignées. */
export function construireQuery(params: ParamsRH, remplacements: Partial<ParamsRH> = {}): string {
  const fusion = { ...params, ...remplacements };
  const recherche = new URLSearchParams();

  for (const [clef, valeur] of Object.entries(fusion)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') {
      recherche.set(clef, String(valeur));
    }
  }

  const chaine = recherche.toString();
  return chaine ? `?${chaine}` : '';
}
