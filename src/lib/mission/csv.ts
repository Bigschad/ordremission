import { formatDateTime } from '@/lib/dates';
import { statusLabel } from '@/lib/mission/status';
import type { MissionResume } from '@/lib/mission/queries';
import { TRANSPORT_LABELS } from '@/lib/validations/mission';

const ENTETES = [
  'Numéro',
  'Statut',
  'Nom',
  'Prénoms',
  'Matricule',
  'Fonction',
  'Analytique',
  'Objet',
  'Lieu',
  'Départ',
  'Retour',
  'Transport',
  'Détail transport',
  'Litres de gasoil',
  'Soumis le',
  'Décidé le',
  'Décidé par',
  'Motif du refus',
] as const;

/** Échappement CSV : guillemets doublés dès qu'un caractère spécial apparaît. */
function echapper(valeur: string): string {
  if (/[";\r\n]/.test(valeur)) {
    return `"${valeur.replace(/"/g, '""')}"`;
  }
  return valeur;
}

function ligne(mission: MissionResume): string[] {
  return [
    mission.numero,
    statusLabel(mission.status),
    mission.nom,
    mission.prenoms,
    mission.matricule,
    mission.fonction,
    mission.analytique ?? '',
    mission.objet,
    mission.lieu,
    formatDateTime(mission.dateDepart),
    formatDateTime(mission.dateRetour),
    TRANSPORT_LABELS[mission.transportType],
    mission.transportDetail ?? '',
    mission.litresGasoil ? String(mission.litresGasoil).replace('.', ',') : '',
    mission.submittedAt ? formatDateTime(mission.submittedAt) : '',
    mission.decidedAt ? formatDateTime(mission.decidedAt) : '',
    mission.decidedByName ?? '',
    mission.motifRefus ?? '',
  ];
}

/**
 * Export CSV des ordres de mission.
 *
 * Séparateur `;` et BOM UTF-8 : c'est ce qu'attend Excel en configuration
 * francophone, sans quoi les accents et les colonnes sont illisibles.
 */
export function construireCsv(missions: MissionResume[]): string {
  const lignes = [
    ENTETES.map(echapper).join(';'),
    ...missions.map((mission) => ligne(mission).map(echapper).join(';')),
  ];

  return `﻿${lignes.join('\r\n')}\r\n`;
}

/** `ordres-de-mission-2026-08-20.csv` */
export function nomFichierCsv(maintenant: Date = new Date()): string {
  return `ordres-de-mission-${maintenant.toISOString().slice(0, 10)}.csv`;
}
