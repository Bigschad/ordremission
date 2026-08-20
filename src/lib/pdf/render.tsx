import { renderToBuffer } from '@react-pdf/renderer';
import type { MissionStatus, TransportType } from '@prisma/client';
import { chargerLogo, genererQrCode } from '@/lib/pdf/assets';
import { OrdreDeMissionPdf, type DonneesPdf } from '@/lib/pdf/document';
import { estNumeroProvisoire } from '@/lib/mission/numero';
import { getAppUrl } from '@/lib/env';

/** Données minimales nécessaires au rendu, telles que renvoyées par Prisma. */
export interface MissionPourPdf {
  numero: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  analytique: string | null;
  objet: string;
  lieu: string;
  dateDepart: Date;
  dateRetour: Date;
  transportType: TransportType;
  transportDetail: string | null;
  litresGasoil: { toString(): string } | null;
  status: MissionStatus;
  motifRefus: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `40` ou `85,5` — les décimales inutiles ne sont pas imprimées. */
export function formaterLitres(valeur: MissionPourPdf['litresGasoil']): string | null {
  if (valeur === null || valeur === undefined) return null;

  const nombre = Number(valeur.toString());
  if (Number.isNaN(nombre)) return null;

  const texte = Number.isInteger(nombre) ? String(nombre) : nombre.toFixed(2).replace(/0$/, '');
  return texte.replace('.', ',');
}

/** URL publique de vérification d'authenticité, encodée dans le QR code. */
export function urlVerification(numero: string): string {
  return `${getAppUrl()}/verify/${encodeURIComponent(numero)}`;
}

/**
 * Nom du fichier téléchargé : `OM-2026-0001_YEYE.pdf`.
 * Tout caractère problématique est remplacé, le nom devant rester utilisable
 * sur tous les systèmes de fichiers et dans un en-tête HTTP.
 */
export function nomFichierPdf(numero: string, nom: string): string {
  const nomNettoye =
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase() || 'COLLABORATEUR';

  const numeroNettoye = estNumeroProvisoire(numero)
    ? 'OM-BROUILLON'
    : numero.replace(/[^A-Za-z0-9-]/g, '');

  return `${numeroNettoye}_${nomNettoye}.pdf`;
}

export async function construireDonneesPdf(mission: MissionPourPdf): Promise<DonneesPdf> {
  const url = urlVerification(mission.numero);

  const [logo, qrCode] = await Promise.all([chargerLogo(), genererQrCode(url)]);

  return {
    numero: mission.numero,
    nom: mission.nom,
    prenoms: mission.prenoms,
    matricule: mission.matricule,
    fonction: mission.fonction,
    analytique: mission.analytique,
    objet: mission.objet,
    lieu: mission.lieu,
    dateDepart: mission.dateDepart,
    dateRetour: mission.dateRetour,
    transportType: mission.transportType,
    transportDetail: mission.transportDetail,
    litresGasoil: formaterLitres(mission.litresGasoil),
    status: mission.status,
    motifRefus: mission.motifRefus,
    decidedAt: mission.decidedAt,
    decidedByName: mission.decidedByName,
    createdAt: mission.createdAt,
    logo,
    qrCode,
    urlVerification: url,
  };
}

/** Rendu brut, sans cache. */
export async function rendrePdf(mission: MissionPourPdf): Promise<Buffer> {
  const donnees = await construireDonneesPdf(mission);
  return renderToBuffer(<OrdreDeMissionPdf donnees={donnees} />);
}

// ---------------------------------------------------------------------------
// Cache mémoire court
// ---------------------------------------------------------------------------

/**
 * Le PDF n'est jamais stocké (aucun service de stockage dans l'offre gratuite) :
 * il est régénéré à la demande. Un cache mémoire de 60 secondes absorbe les
 * rafales — aperçu, téléchargement, pièce jointe d'e-mail — sans consommer de
 * temps de fonction supplémentaire.
 *
 * Le cache est local à l'instance : sur Vercel, chaque instance a le sien, ce
 * qui est sans conséquence puisque le contenu est déterministe.
 */
const DUREE_CACHE_MS = 60_000;
const TAILLE_MAX_CACHE = 32;

interface EntreeCache {
  buffer: Buffer;
  expireA: number;
}

const cache = new Map<string, EntreeCache>();

/** La clé intègre `updatedAt` : toute modification invalide l'entrée. */
export function clefCache(mission: Pick<MissionPourPdf, 'numero' | 'updatedAt'>): string {
  return `${mission.numero}:${mission.updatedAt.getTime()}`;
}

function purger(maintenant: number): void {
  for (const [clef, entree] of cache) {
    if (entree.expireA <= maintenant) cache.delete(clef);
  }

  // Garde-fou mémoire : on évacue les entrées les plus anciennes.
  while (cache.size > TAILLE_MAX_CACHE) {
    const premiere = cache.keys().next();
    if (premiere.done) break;
    cache.delete(premiere.value);
  }
}

export async function rendrePdfAvecCache(mission: MissionPourPdf): Promise<Buffer> {
  const maintenant = Date.now();
  purger(maintenant);

  const clef = clefCache(mission);
  const entree = cache.get(clef);

  if (entree && entree.expireA > maintenant) {
    return entree.buffer;
  }

  const buffer = await rendrePdf(mission);
  cache.set(clef, { buffer, expireA: maintenant + DUREE_CACHE_MS });

  return buffer;
}

/** @internal — utilisé par les tests. */
export function viderCachePdf(): void {
  cache.clear();
}
