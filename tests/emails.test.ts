import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MissionStatus, TransportType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notifierDecisionAuDemandeur, notifierSoumissionAuxRH } from '@/lib/email/notifications';
import { envoyerEmail, MAILBOX_DIR } from '@/lib/email/transport';
import { creerTokensApprobation } from '@/lib/mission/tokens';
import { creerUtilisateurTest, prismaTest, reinitialiserBase } from './aide-base';

/**
 * Notifications. `EMAIL_TRANSPORT=file` (voir .env.test) écrit les messages
 * dans `.mailbox/` au lieu de les envoyer : les tests peuvent donc vérifier
 * objet, destinataires, contenu et pièces jointes sans appeler Resend.
 */

interface MessageEcrit {
  to: string[];
  subject: string;
  html: string;
  text: string | null;
  attachments: { filename: string; taille: number }[];
}

async function messagesEnvoyes(): Promise<MessageEcrit[]> {
  const fichiers = (await fs.readdir(MAILBOX_DIR).catch(() => [])).sort();

  return Promise.all(
    fichiers.map(async (fichier) =>
      JSON.parse(await fs.readFile(path.join(MAILBOX_DIR, fichier), 'utf8')),
    ),
  );
}

async function viderBoite(): Promise<void> {
  await fs.rm(MAILBOX_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await reinitialiserBase();
  await viderBoite();
});

afterAll(async () => {
  await viderBoite();
  await prismaTest.$disconnect();
});

async function missionSoumise() {
  const utilisateur = await creerUtilisateurTest();

  const mission = await prismaTest.missionOrder.create({
    data: {
      numero: 'OM-2026-0001',
      demandeurId: utilisateur.id,
      nom: 'YEYE',
      prenoms: 'SCHADRACH GUY-ROLAND',
      matricule: '4071',
      fonction: 'Responsable Développement & Intégration IT',
      analytique: 'IT-2026-001',
      objet: 'Visite chantier',
      lieu: 'Assinie',
      dateDepart: new Date('2026-08-19T13:00:00.000Z'),
      dateRetour: new Date('2026-08-19T17:00:00.000Z'),
      transportType: TransportType.VEHICULE_ETABLISSEMENT,
      transportDetail: '1234 AB 01',
      litresGasoil: 40,
      status: MissionStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });

  return { utilisateur, mission };
}

describe('transport de test', () => {
  it('écrit le message sur disque au lieu de l’envoyer', async () => {
    const resultat = await envoyerEmail({
      to: ['rh@porteo-group.com'],
      subject: 'Essai',
      html: '<p>Bonjour</p>',
      text: 'Bonjour',
    });

    expect(resultat.ok).toBe(true);

    const messages = await messagesEnvoyes();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe('Essai');
  });
});

describe('notification aux Ressources Humaines', () => {
  it('respecte le format d’objet du cahier des charges', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    const envoi = await notifierSoumissionAuxRH(mission, jetons);
    expect(envoi.ok).toBe(true);
    expect(envoi.destinataires).toEqual(['rh@porteo-group.com']);

    const [message] = await messagesEnvoyes();
    expect(message?.subject).toBe(
      '[Ordre de mission OM-2026-0001] SCHADRACH GUY-ROLAND YEYE — Assinie, du 19/08 au 19/08',
    );
  });

  it('joint le PDF sous le nom attendu', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await notifierSoumissionAuxRH(mission, jetons);

    const [message] = await messagesEnvoyes();
    expect(message?.attachments).toHaveLength(1);
    expect(message?.attachments[0]?.filename).toBe('OM-2026-0001_YEYE.pdf');
    expect(message?.attachments[0]?.taille).toBeGreaterThan(1000);
  });

  it('insère les deux liens de décision', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await notifierSoumissionAuxRH(mission, jetons);

    const [message] = await messagesEnvoyes();
    expect(message?.html).toContain(`/approve/${jetons.approuver}`);
    expect(message?.html).toContain(`/reject/${jetons.refuser}`);
    expect(message?.text).toContain(`/approve/${jetons.approuver}`);
  });

  it('reprend tous les champs du formulaire dans le récapitulatif', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await notifierSoumissionAuxRH(mission, jetons);

    const [message] = await messagesEnvoyes();
    for (const valeur of [
      'OM-2026-0001',
      'YEYE',
      '4071',
      'IT-2026-001',
      'Visite chantier',
      'Assinie',
      "Véhicule de l&#x27;établissement",
      '40 litres de gasoil',
    ]) {
      expect(message?.html, `valeur absente : ${valeur}`).toContain(valeur);
    }
  });

  it('signale la relance dans le message', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await notifierSoumissionAuxRH(mission, jetons, { relance: true });

    const [message] = await messagesEnvoyes();
    expect(message?.html).toContain('Rappel');
  });

  it('journalise l’envoi', async () => {
    const { mission } = await missionSoumise();
    const jetons = await creerTokensApprobation(prismaTest, mission.id);

    await notifierSoumissionAuxRH(mission, jetons);

    const journal = await prismaTest.auditLog.findMany({ where: { entiteId: mission.id } });
    expect(journal.map((entree) => entree.action)).toContain('EMAIL_SENT');
  });
});

describe('notification de décision au demandeur', () => {
  it('joint le PDF validé', async () => {
    const { utilisateur, mission } = await missionSoumise();

    const validee = await prismaTest.missionOrder.update({
      where: { id: mission.id },
      data: {
        status: MissionStatus.APPROVED,
        decidedAt: new Date('2026-08-18T09:30:00.000Z'),
        decidedByName: 'FATOUMATA DIALLO',
      },
    });

    const envoi = await notifierDecisionAuDemandeur(validee, utilisateur.email);
    expect(envoi.ok).toBe(true);

    const [message] = await messagesEnvoyes();
    expect(message?.subject).toBe('Ordre de mission OM-2026-0001 — validé');
    expect(message?.to).toEqual([utilisateur.email]);
    expect(message?.attachments).toHaveLength(1);
    expect(message?.html).toContain('FATOUMATA DIALLO');
  });

  it('met le motif en évidence et n’attache aucun PDF en cas de refus', async () => {
    const { utilisateur, mission } = await missionSoumise();

    const refusee = await prismaTest.missionOrder.update({
      where: { id: mission.id },
      data: {
        status: MissionStatus.REJECTED,
        decidedAt: new Date('2026-08-18T09:30:00.000Z'),
        decidedByName: 'FATOUMATA DIALLO',
        motifRefus: 'Budget déplacement déjà consommé pour le mois en cours.',
      },
    });

    await notifierDecisionAuDemandeur(refusee, utilisateur.email);

    const [message] = await messagesEnvoyes();
    expect(message?.subject).toBe('Ordre de mission OM-2026-0001 — refusé');
    expect(message?.attachments).toHaveLength(0);
    expect(message?.html).toContain('Motif du refus');
    expect(message?.html).toContain('Budget déplacement');
    expect(message?.text).toContain('Budget déplacement');
  });
});
