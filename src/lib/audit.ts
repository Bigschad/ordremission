import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'SUBMITTED',
  'RESUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'DELETED',
  'PDF_GENERATED',
  'EMAIL_SENT',
  'EMAIL_FAILED',
  'TOKEN_REPLAYED',
  'RATE_LIMITED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  entite: string;
  entiteId: string;
  action: AuditAction;
  acteur: string;
  ip?: string | null;
  details?: Prisma.InputJsonValue;
}

/**
 * Écrit une entrée d'audit. Ne doit jamais faire échouer l'opération métier :
 * une erreur de journalisation est signalée en console et absorbée.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entite: entry.entite,
        entiteId: entry.entiteId,
        action: entry.action,
        acteur: entry.acteur,
        ip: entry.ip ?? null,
        details: entry.details,
      },
    });
  } catch (error) {
    console.error("Échec d'écriture du journal d'audit", error);
  }
}

/** Historique d'un ordre de mission, du plus récent au plus ancien. */
export function getMissionAuditTrail(missionOrderId: string) {
  return prisma.auditLog.findMany({
    where: { entite: 'MissionOrder', entiteId: missionOrderId },
    orderBy: { createdAt: 'desc' },
  });
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Brouillon créé',
  UPDATED: 'Brouillon modifié',
  SUBMITTED: 'Soumis aux Ressources Humaines',
  RESUBMITTED: 'Renvoyé aux Ressources Humaines',
  APPROVED: 'Validé par les Ressources Humaines',
  REJECTED: 'Refusé par les Ressources Humaines',
  CANCELLED: 'Annulé par le demandeur',
  DELETED: 'Brouillon supprimé',
  PDF_GENERATED: 'PDF généré',
  EMAIL_SENT: 'E-mail envoyé',
  EMAIL_FAILED: "Échec d'envoi d'e-mail",
  TOKEN_REPLAYED: "Tentative de réutilisation d'un lien",
  RATE_LIMITED: 'Trop de tentatives — requête bloquée',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
