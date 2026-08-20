import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { getEnv } from '@/lib/env';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Répertoire du transport « file » — lu par les tests E2E. */
export const MAILBOX_DIR = path.join(process.cwd(), '.mailbox');

let resendClient: Resend | null = null;

function getResend(): Resend {
  const { RESEND_API_KEY } = getEnv();
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY n'est pas configuré : impossible d'envoyer des e-mails.");
  }
  resendClient ??= new Resend(RESEND_API_KEY);
  return resendClient;
}

/**
 * Transport de test : écrit le message en JSON dans `.mailbox/` au lieu de
 * l'envoyer. Activé par `EMAIL_TRANSPORT=file`. Jamais utilisé en production.
 */
async function envoyerVersFichier(message: EmailMessage): Promise<EmailResult> {
  await fs.mkdir(MAILBOX_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fichier = path.join(MAILBOX_DIR, `${id}.json`);

  await fs.writeFile(
    fichier,
    JSON.stringify(
      {
        id,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text ?? null,
        attachments: (message.attachments ?? []).map((piece) => ({
          filename: piece.filename,
          taille: piece.content.byteLength,
        })),
        sentAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );

  return { ok: true, id };
}

/**
 * Envoie un e-mail. Ne lève jamais : renvoie `{ ok: false, error }` afin que
 * l'appelant puisse journaliser l'échec sans faire échouer l'opération métier.
 */
export async function envoyerEmail(message: EmailMessage): Promise<EmailResult> {
  const env = getEnv();

  try {
    if (env.EMAIL_TRANSPORT === 'file') {
      return await envoyerVersFichier(message);
    }

    const { data, error } = await getResend().emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.attachments && message.attachments.length > 0
        ? {
            attachments: message.attachments.map((piece) => ({
              filename: piece.filename,
              content: piece.content,
            })),
          }
        : {}),
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data?.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erreur inconnue lors de l'envoi",
    };
  }
}
