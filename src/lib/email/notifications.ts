import { render } from '@react-email/components';
import { MissionStatus } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { formatDateTime, formatDayMonth, formatLong } from '@/lib/dates';
import { envoyerEmail, type EmailResult } from '@/lib/email/transport';
import { MissionDecisionEmail } from '@/lib/email/templates/mission-decision';
import { MissionSubmittedHrEmail } from '@/lib/email/templates/mission-submitted-hr';
import type { LigneRecapitulatif } from '@/lib/email/templates/recapitulatif';
import { getAppUrl, getHrRecipients } from '@/lib/env';
import {
  formaterLitres,
  nomFichierPdf,
  rendrePdfAvecCache,
  type MissionPourPdf,
} from '@/lib/pdf/render';
import { TRANSPORT_LABELS } from '@/lib/validations/mission';

/**
 * Envoi des notifications liées au cycle de vie d'un ordre de mission.
 *
 * Aucune de ces fonctions ne lève : un échec d'envoi est journalisé dans
 * `AuditLog` et remonté à l'appelant, mais **ne remet jamais en cause
 * l'opération métier** — un ordre soumis reste soumis même si l'e-mail échoue,
 * charge au demandeur d'utiliser le bouton « Renvoyer aux RH ».
 */

export interface MissionPourEmail extends MissionPourPdf {
  id: string;
  motifRefus: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
}

/** Lignes du tableau récapitulatif, dans l'ordre du formulaire papier. */
function construireRecapitulatif(mission: MissionPourEmail): LigneRecapitulatif[] {
  const litres = formaterLitres(mission.litresGasoil);

  const lignes: LigneRecapitulatif[] = [
    { libelle: 'Numéro', valeur: mission.numero },
    { libelle: 'Nom', valeur: mission.nom },
    { libelle: 'Prénoms', valeur: mission.prenoms },
    { libelle: 'Matricule', valeur: mission.matricule },
    { libelle: 'Fonction', valeur: mission.fonction },
  ];

  if (mission.analytique) {
    lignes.push({ libelle: 'Analytique', valeur: mission.analytique });
  }

  lignes.push(
    { libelle: 'Objet de la mission', valeur: mission.objet },
    { libelle: 'Lieu de la mission', valeur: mission.lieu },
    { libelle: 'Date de départ', valeur: formatLong(mission.dateDepart) },
    { libelle: 'Date de retour', valeur: formatLong(mission.dateRetour) },
    { libelle: 'Moyen de transport', valeur: TRANSPORT_LABELS[mission.transportType] },
  );

  if (mission.transportDetail) {
    lignes.push({ libelle: 'Détail du transport', valeur: mission.transportDetail });
  }

  lignes.push({
    libelle: 'Carburant',
    valeur: litres ? `${litres} litres de gasoil` : 'Sans dotation de gasoil',
  });

  return lignes;
}

export interface EnvoiNotification extends EmailResult {
  /** Destinataires réellement visés. */
  destinataires: string[];
}

/**
 * Notifie les Ressources Humaines qu'un ordre de mission attend leur décision.
 * Le PDF est joint et les deux liens de décision sont insérés dans le message.
 */
export async function notifierSoumissionAuxRH(
  mission: MissionPourEmail,
  jetons: { approuver: string; refuser: string },
  options: { relance?: boolean } = {},
): Promise<EnvoiNotification> {
  const destinataires = getHrRecipients();

  if (destinataires.length === 0) {
    const erreur = "Aucune adresse RH n'est configurée (HR_EMAIL).";
    await logAudit({
      entite: 'MissionOrder',
      entiteId: mission.id,
      action: 'EMAIL_FAILED',
      acteur: 'SYSTEM',
      details: { type: 'MISSION_SUBMITTED_HR', erreur },
    });
    return { ok: false, error: erreur, destinataires };
  }

  const appUrl = getAppUrl();
  const nomPieceJointe = nomFichierPdf(mission.numero, mission.nom);
  const lignes = construireRecapitulatif(mission);

  const sujet = `[Ordre de mission ${mission.numero}] ${mission.prenoms} ${mission.nom} — ${mission.lieu}, du ${formatDayMonth(mission.dateDepart)} au ${formatDayMonth(mission.dateRetour)}`;

  const urlValider = `${appUrl}/approve/${jetons.approuver}`;
  const urlRefuser = `${appUrl}/reject/${jetons.refuser}`;

  const html = await render(
    MissionSubmittedHrEmail({
      numero: mission.numero,
      prenoms: mission.prenoms,
      nom: mission.nom,
      lieu: mission.lieu,
      objet: mission.objet,
      lignes,
      urlValider,
      urlRefuser,
      validiteJours: 7,
      nomPieceJointe,
      relance: options.relance ?? false,
    }),
  );

  const texte = [
    `Ordre de mission ${mission.numero} — ${mission.prenoms} ${mission.nom}`,
    ...lignes.map((ligne) => `${ligne.libelle} : ${ligne.valeur}`),
    '',
    `Valider : ${urlValider}`,
    `Refuser : ${urlRefuser}`,
    '',
    "Ces liens sont valables 7 jours et ne peuvent servir qu'une seule fois.",
  ].join('\n');

  let pieceJointe: Buffer | null = null;
  try {
    pieceJointe = await rendrePdfAvecCache(mission);
  } catch (error) {
    // Le PDF ne doit pas empêcher la notification : le message part sans pièce
    // jointe, et les RH disposent du récapitulatif complet dans le corps.
    console.error('Échec de génération du PDF joint', error);
  }

  const resultat = await envoyerEmail({
    to: destinataires,
    subject: sujet,
    html,
    text: texte,
    ...(pieceJointe ? { attachments: [{ filename: nomPieceJointe, content: pieceJointe }] } : {}),
  });

  await logAudit({
    entite: 'MissionOrder',
    entiteId: mission.id,
    action: resultat.ok ? 'EMAIL_SENT' : 'EMAIL_FAILED',
    acteur: 'SYSTEM',
    details: {
      type: 'MISSION_SUBMITTED_HR',
      destinataires,
      relance: options.relance ?? false,
      pieceJointe: pieceJointe !== null,
      erreur: resultat.error ?? null,
    },
  });

  return { ...resultat, destinataires };
}

/** Informe le demandeur de la décision prise sur son ordre de mission. */
export async function notifierDecisionAuDemandeur(
  mission: MissionPourEmail,
  emailDemandeur: string,
): Promise<EnvoiNotification> {
  const destinataires = [emailDemandeur];
  const approuve = mission.status === MissionStatus.APPROVED;
  const appUrl = getAppUrl();
  const nomPieceJointe = nomFichierPdf(mission.numero, mission.nom);

  const html = await render(
    MissionDecisionEmail({
      numero: mission.numero,
      prenoms: mission.prenoms,
      approuve,
      objet: mission.objet,
      lieu: mission.lieu,
      lignes: construireRecapitulatif(mission),
      motifRefus: mission.motifRefus,
      decideParNom: mission.decidedByName,
      decideLe: mission.decidedAt ? formatDateTime(mission.decidedAt) : '',
      urlMission: `${appUrl}/missions/${mission.id}`,
      ...(approuve ? { nomPieceJointe } : {}),
    }),
  );

  const texte = [
    `Votre ordre de mission ${mission.numero} a été ${approuve ? 'validé' : 'refusé'}.`,
    mission.decidedAt ? `Décision du ${formatDateTime(mission.decidedAt)}.` : '',
    !approuve && mission.motifRefus ? `Motif du refus : ${mission.motifRefus}` : '',
    '',
    `Consulter : ${appUrl}/missions/${mission.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Seul un ordre validé mérite une pièce jointe : un refus n'a pas de document.
  let pieceJointe: Buffer | null = null;
  if (approuve) {
    try {
      pieceJointe = await rendrePdfAvecCache(mission);
    } catch (error) {
      console.error('Échec de génération du PDF validé', error);
    }
  }

  const resultat = await envoyerEmail({
    to: destinataires,
    subject: `Ordre de mission ${mission.numero} — ${approuve ? 'validé' : 'refusé'}`,
    html,
    text: texte,
    ...(pieceJointe ? { attachments: [{ filename: nomPieceJointe, content: pieceJointe }] } : {}),
  });

  await logAudit({
    entite: 'MissionOrder',
    entiteId: mission.id,
    action: resultat.ok ? 'EMAIL_SENT' : 'EMAIL_FAILED',
    acteur: 'SYSTEM',
    details: {
      type: 'MISSION_DECISION',
      destinataires,
      decision: approuve ? 'APPROVED' : 'REJECTED',
      erreur: resultat.error ?? null,
    },
  });

  return { ...resultat, destinataires };
}
