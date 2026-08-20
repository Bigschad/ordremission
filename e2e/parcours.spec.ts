import { expect, test } from '@playwright/test';
import { MissionStatus } from '@prisma/client';
import {
  attendreMessage,
  COLLABORATEUR,
  dansNJours,
  messages,
  premierLien,
  preparerUtilisateurs,
  prisma,
  reinitialiser,
  RESSOURCES_HUMAINES,
  seConnecter,
} from './aide';

/**
 * Parcours de bout en bout, dans l'ordre du cahier des charges.
 * Chaque scénario repart d'une base vierge : aucun test ne dépend d'un autre.
 */

test.beforeEach(async () => {
  await reinitialiser();
  await preparerUtilisateurs();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Remplit le formulaire d'ordre de mission avec un jeu de valeurs valide. */
async function remplirFormulaire(
  page: import('@playwright/test').Page,
  valeurs: { objet: string; lieu: string },
): Promise<void> {
  await page.getByLabel('Objet de la mission').fill(valeurs.objet);
  await page.getByLabel('Lieu de la mission').fill(valeurs.lieu);
  await page.getByLabel('Date et heure de départ').fill(dansNJours(7, '08:00'));
  await page.getByLabel('Date et heure de retour').fill(dansNJours(7, '17:00'));
  await page.getByRole('radio', { name: "Véhicule de l'établissement" }).check();
}

// ---------------------------------------------------------------------------
// Scénario 1 — connexion par lien magique
// ---------------------------------------------------------------------------
test('1 — un collaborateur se connecte par lien magique', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail professionnelle').fill(COLLABORATEUR);
  await page.getByRole('button', { name: /Recevoir mon lien de connexion/ }).click();

  await expect(page.getByText('Vérifiez votre boîte mail')).toBeVisible();

  const message = await attendreMessage((candidat) => candidat.to.includes(COLLABORATEUR));
  expect(message.subject).toBe('Votre lien de connexion — Ordres de mission Porteo');

  await page.goto(premierLien(message, /https?:\/\/[^\s"<>]*\/api\/auth\/callback\/email[^\s"<>]*/));

  await expect(page.getByRole('heading', { name: 'Mes ordres de mission' })).toBeVisible();
  await expect(page.getByText('SCHADRACH GUY-ROLAND YEYE')).toBeVisible();
});

test("1 bis — une adresse inconnue ne révèle rien et ne crée aucun compte", async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail professionnelle').fill('intrus@exemple.com');
  await page.getByRole('button', { name: /Recevoir mon lien de connexion/ }).click();

  // Réponse identique à celle d'une adresse connue : aucune énumération possible.
  await expect(page.getByText('Vérifiez votre boîte mail')).toBeVisible();

  await page.waitForTimeout(2500);
  expect((await messages()).filter((m) => m.to.includes('intrus@exemple.com'))).toHaveLength(0);
  expect(await prisma.user.count({ where: { email: 'intrus@exemple.com' } })).toBe(0);
});

// ---------------------------------------------------------------------------
// Scénario 2 — brouillon, modification, soumission, e-mail aux RH
// ---------------------------------------------------------------------------
test('2 — brouillon puis modification puis soumission, avec e-mail aux RH', async ({ page }) => {
  await seConnecter(page, COLLABORATEUR);

  await page.getByRole('link', { name: /Nouvel ordre de mission/ }).first().click();
  await remplirFormulaire(page, { objet: 'Visite chantier', lieu: 'Assinie' });

  await page.getByRole('button', { name: 'Enregistrer comme brouillon' }).click();
  await expect(page.getByRole('heading', { name: 'Brouillon (non numéroté)' })).toBeVisible();

  const brouillon = await prisma.missionOrder.findFirstOrThrow();
  expect(brouillon.status).toBe(MissionStatus.DRAFT);
  expect(brouillon.objet).toBe('Visite chantier');

  // -- Modification du brouillon -------------------------------------------
  await page.getByRole('link', { name: 'Modifier le brouillon' }).click();
  await page.getByLabel('Lieu de la mission').fill('Grand-Bassam');
  await page.getByRole('button', { name: 'Enregistrer comme brouillon' }).click();

  await expect(page.getByText('Grand-Bassam').first()).toBeVisible();
  expect((await prisma.missionOrder.findFirstOrThrow()).lieu).toBe('Grand-Bassam');

  // -- Soumission ------------------------------------------------------------
  await page.getByRole('link', { name: 'Modifier le brouillon' }).click();
  await page.getByRole('button', { name: 'Soumettre aux RH' }).click();

  await expect(page.getByRole('heading', { name: /^OM-\d{4}-\d{4}$/ })).toBeVisible();

  const soumis = await prisma.missionOrder.findFirstOrThrow();
  expect(soumis.status).toBe(MissionStatus.SUBMITTED);
  expect(soumis.numero).toMatch(/^OM-\d{4}-0001$/);
  expect(soumis.submittedAt).not.toBeNull();

  // -- E-mail reçu par les Ressources Humaines -------------------------------
  const courriel = await attendreMessage((candidat) =>
    candidat.to.includes(RESSOURCES_HUMAINES),
  );

  expect(courriel.subject).toContain(`[Ordre de mission ${soumis.numero}]`);
  expect(courriel.subject).toContain('SCHADRACH GUY-ROLAND YEYE');
  expect(courriel.subject).toContain('Grand-Bassam');
  expect(courriel.attachments).toHaveLength(1);
  expect(courriel.attachments[0]?.filename).toBe(`${soumis.numero}_YEYE.pdf`);
  expect(courriel.html).toMatch(/\/approve\/[A-Za-z0-9_-]{20,}/);
  expect(courriel.html).toMatch(/\/reject\/[A-Za-z0-9_-]{20,}/);
});

// ---------------------------------------------------------------------------
// Scénario 3 — validation RH depuis le lien reçu par e-mail
// ---------------------------------------------------------------------------
test('3 — les RH valident depuis leur boîte mail, sans se connecter', async ({ page }) => {
  await seConnecter(page, COLLABORATEUR);
  await page.getByRole('link', { name: /Nouvel ordre de mission/ }).first().click();
  await remplirFormulaire(page, { objet: 'Réception de travaux', lieu: 'Yamoussoukro' });
  await page.getByRole('button', { name: 'Soumettre aux RH' }).click();
  await expect(page.getByRole('heading', { name: /^OM-\d{4}-\d{4}$/ })).toBeVisible();

  const courrielRH = await attendreMessage((candidat) => candidat.to.includes(RESSOURCES_HUMAINES));
  const lienValidation = premierLien(courrielRH, /https?:\/\/[^\s"<>]*\/approve\/[A-Za-z0-9_-]+/);

  // Les RH ouvrent le lien dans un contexte anonyme : aucune session.
  const anonyme = await page.context().browser()!.newContext();
  const pageRH = await anonyme.newPage();
  await pageRH.goto(lienValidation);

  await expect(pageRH.getByRole('heading', { name: /Ordre de mission OM-/ })).toBeVisible();

  // Le simple affichage ne doit produire aucun effet.
  expect((await prisma.missionOrder.findFirstOrThrow()).status).toBe(MissionStatus.SUBMITTED);

  await pageRH.getByRole('button', { name: 'Confirmer la validation' }).click();
  await expect(pageRH.getByText(/Ordre de mission OM-\d{4}-\d{4} validé/)).toBeVisible();

  const validee = await prisma.missionOrder.findFirstOrThrow();
  expect(validee.status).toBe(MissionStatus.APPROVED);
  expect(validee.decidedAt).not.toBeNull();
  expect(validee.decidedByName).toBeTruthy();

  // -- Le demandeur est informé, PDF validé à l'appui ------------------------
  const courrielDemandeur = await attendreMessage(
    (candidat) =>
      candidat.to.includes(COLLABORATEUR) && candidat.subject.includes(validee.numero),
  );

  expect(courrielDemandeur.subject).toBe(`Ordre de mission ${validee.numero} — validé`);
  expect(courrielDemandeur.attachments).toHaveLength(1);

  await anonyme.close();
});

// ---------------------------------------------------------------------------
// Scénario 4 — refus : motif obligatoire
// ---------------------------------------------------------------------------
test('4 — un refus sans motif est bloqué, un refus motivé aboutit', async ({ page }) => {
  await seConnecter(page, COLLABORATEUR);
  await page.getByRole('link', { name: /Nouvel ordre de mission/ }).first().click();
  await remplirFormulaire(page, { objet: 'Salon professionnel', lieu: 'Grand-Bassam' });
  await page.getByRole('button', { name: 'Soumettre aux RH' }).click();
  await expect(page.getByRole('heading', { name: /^OM-\d{4}-\d{4}$/ })).toBeVisible();

  const courrielRH = await attendreMessage((candidat) => candidat.to.includes(RESSOURCES_HUMAINES));
  const lienRefus = premierLien(courrielRH, /https?:\/\/[^\s"<>]*\/reject\/[A-Za-z0-9_-]+/);

  const anonyme = await page.context().browser()!.newContext();
  const pageRH = await anonyme.newPage();
  await pageRH.goto(lienRefus);

  // -- Motif trop court : le refus est rejeté --------------------------------
  await pageRH.getByLabel('Motif du refus').fill('Non');
  await pageRH.getByRole('button', { name: 'Confirmer le refus' }).click();

  await expect(pageRH.getByText(/au moins 10 caractères/)).toBeVisible();
  expect((await prisma.missionOrder.findFirstOrThrow()).status).toBe(MissionStatus.SUBMITTED);

  // -- Motif suffisant : le refus est enregistré -----------------------------
  const motif = 'Budget déplacement du service déjà consommé pour le mois en cours.';
  await pageRH.getByLabel('Motif du refus').fill(motif);
  await pageRH.getByRole('button', { name: 'Confirmer le refus' }).click();

  await expect(pageRH.getByText(/Ordre de mission OM-\d{4}-\d{4} refusé/)).toBeVisible();

  const refusee = await prisma.missionOrder.findFirstOrThrow();
  expect(refusee.status).toBe(MissionStatus.REJECTED);
  expect(refusee.motifRefus).toBe(motif);

  // Le demandeur reçoit le motif.
  const courrielDemandeur = await attendreMessage(
    (candidat) => candidat.to.includes(COLLABORATEUR) && candidat.subject.includes('refusé'),
  );
  expect(courrielDemandeur.html).toContain('Budget déplacement');
  expect(courrielDemandeur.attachments).toHaveLength(0);

  await anonyme.close();
});

// ---------------------------------------------------------------------------
// Scénario 5 — rejeu d'un lien déjà consommé
// ---------------------------------------------------------------------------
test("5 — un lien déjà utilisé n'a plus aucun effet", async ({ page }) => {
  await seConnecter(page, COLLABORATEUR);
  await page.getByRole('link', { name: /Nouvel ordre de mission/ }).first().click();
  await remplirFormulaire(page, { objet: 'Étude géotechnique', lieu: 'Bouaké' });
  await page.getByRole('button', { name: 'Soumettre aux RH' }).click();
  await expect(page.getByRole('heading', { name: /^OM-\d{4}-\d{4}$/ })).toBeVisible();

  const courrielRH = await attendreMessage((candidat) => candidat.to.includes(RESSOURCES_HUMAINES));
  const lienValidation = premierLien(courrielRH, /https?:\/\/[^\s"<>]*\/approve\/[A-Za-z0-9_-]+/);
  const lienRefus = premierLien(courrielRH, /https?:\/\/[^\s"<>]*\/reject\/[A-Za-z0-9_-]+/);

  const anonyme = await page.context().browser()!.newContext();
  const pageRH = await anonyme.newPage();

  await pageRH.goto(lienValidation);
  await pageRH.getByRole('button', { name: 'Confirmer la validation' }).click();
  await expect(pageRH.getByText(/Ordre de mission OM-\d{4}-\d{4} validé/)).toBeVisible();

  const apresDecision = await prisma.missionOrder.findFirstOrThrow();
  expect(apresDecision.status).toBe(MissionStatus.APPROVED);
  const decisionInitiale = apresDecision.decidedAt?.toISOString();

  // -- Rejeu du lien de validation ------------------------------------------
  await pageRH.goto(lienValidation);
  await expect(pageRH.getByText('Lien inutilisable')).toBeVisible();
  await expect(pageRH.getByText(/décision a déjà été prise/)).toBeVisible();
  await expect(pageRH.getByRole('button', { name: 'Confirmer la validation' })).toHaveCount(0);

  // -- Le lien de refus, jamais utilisé, est caduc lui aussi (règle 7) -------
  await pageRH.goto(lienRefus);
  await expect(pageRH.getByText('Lien inutilisable')).toBeVisible();
  await expect(pageRH.getByRole('button', { name: 'Confirmer le refus' })).toHaveCount(0);

  // -- Aucun changement d'état ------------------------------------------------
  const finale = await prisma.missionOrder.findFirstOrThrow();
  expect(finale.status).toBe(MissionStatus.APPROVED);
  expect(finale.decidedAt?.toISOString()).toBe(decisionInitiale);
  expect(finale.motifRefus).toBeNull();

  await anonyme.close();
});
