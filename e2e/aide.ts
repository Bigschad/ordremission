import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaClient, Role } from '@prisma/client';
import type { Page } from '@playwright/test';

/** Boîte aux lettres du transport de test (`EMAIL_TRANSPORT=file`). */
export const MAILBOX = path.join(process.cwd(), '.mailbox');

export const prisma = new PrismaClient();

export interface MessageTest {
  to: string[];
  subject: string;
  html: string;
  text: string | null;
  attachments: { filename: string; taille: number }[];
  sentAt: string;
}

export async function viderBoite(): Promise<void> {
  await fs.rm(MAILBOX, { recursive: true, force: true });
}

export async function messages(): Promise<MessageTest[]> {
  const fichiers = (await fs.readdir(MAILBOX).catch(() => [])).sort();

  const lus = await Promise.all(
    fichiers.map(async (fichier) =>
      JSON.parse(await fs.readFile(path.join(MAILBOX, fichier), 'utf8')),
    ),
  );

  return lus as MessageTest[];
}

/** Attend l'arrivée d'un message satisfaisant le prédicat donné. */
export async function attendreMessage(
  predicat: (message: MessageTest) => boolean,
  delaiMs = 20_000,
): Promise<MessageTest> {
  const echeance = Date.now() + delaiMs;

  while (Date.now() < echeance) {
    const trouve = (await messages()).find(predicat);
    if (trouve) return trouve;
    await new Promise((resoudre) => setTimeout(resoudre, 400));
  }

  throw new Error("Aucun e-mail correspondant n'est arrivé dans le délai imparti.");
}

/** Première URL absolue contenue dans la version texte d'un message. */
export function premierLien(message: MessageTest, motif: RegExp): string {
  const source = `${message.text ?? ''}\n${message.html}`;
  const trouve = source.match(motif);

  if (!trouve) throw new Error(`Aucun lien correspondant à ${motif} dans le message.`);
  return trouve[0].replace(/&amp;/g, '&');
}

/** Remet la base dans un état connu, sans données résiduelles. */
export async function reinitialiser(): Promise<void> {
  await prisma.approvalToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.missionOrder.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
  await viderBoite();
}

export const COLLABORATEUR = 'schadrach.yeye@porteo-group.com';
export const RESSOURCES_HUMAINES = 'rh@porteo-group.com';

/** Crée le collaborateur de référence et une gestionnaire RH. */
export async function preparerUtilisateurs(): Promise<void> {
  await prisma.user.create({
    data: {
      nom: 'YEYE',
      prenoms: 'SCHADRACH GUY-ROLAND',
      matricule: '4071',
      fonction: 'Responsable Développement & Intégration IT',
      email: COLLABORATEUR,
      role: Role.EMPLOYEE,
      emailVerified: new Date(),
    },
  });

  await prisma.user.create({
    data: {
      nom: 'DIALLO',
      prenoms: 'FATOUMATA',
      matricule: '2001',
      fonction: 'Responsable Ressources Humaines',
      email: RESSOURCES_HUMAINES,
      role: Role.HR,
      emailVerified: new Date(),
    },
  });
}

/**
 * Connexion complète par lien magique : saisie de l'adresse, lecture du
 * message dans la boîte de test, ouverture du lien reçu.
 */
export async function seConnecter(page: Page, email: string): Promise<void> {
  const avant = (await messages()).length;

  await page.goto('/login');
  await page.getByLabel('Adresse e-mail professionnelle').fill(email);
  await page.getByRole('button', { name: /Recevoir mon lien de connexion/ }).click();

  const message = await attendreMessage(
    (candidat) => candidat.to.includes(email) && candidat.subject.includes('lien de connexion'),
  );

  // On s'assure de lire le message qui vient d'arriver, pas un précédent.
  if ((await messages()).length <= avant) {
    throw new Error("Le lien de connexion n'a pas été envoyé.");
  }

  await page.goto(
    premierLien(message, /https?:\/\/[^\s"<>]*\/api\/auth\/callback\/email[^\s"<>]*/),
  );
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Valeur `datetime-local` à J+n, à l'heure indiquée. */
export function dansNJours(jours: number, heure: string): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + jours);
  return `${date.toISOString().slice(0, 10)}T${heure}`;
}
