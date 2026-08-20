import { MissionStatus, TransportType } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clefCache,
  formaterLitres,
  nomFichierPdf,
  rendrePdf,
  rendrePdfAvecCache,
  urlVerification,
  viderCachePdf,
  type MissionPourPdf,
} from '@/lib/pdf/render';

/**
 * Test de non-régression du PDF : le document doit tenir sur **une seule page**
 * et porter le numéro d'ordre de mission.
 */

/** Reproduit la fiche d'origine : YEYE / Visite chantier / Assinie. */
function missionReference(surcharges: Partial<MissionPourPdf> = {}): MissionPourPdf {
  return {
    numero: 'OM-2026-0001',
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
    status: MissionStatus.APPROVED,
    motifRefus: null,
    decidedAt: new Date('2026-08-18T09:30:00.000Z'),
    decidedByName: 'FATOUMATA DIALLO',
    createdAt: new Date('2026-08-17T08:00:00.000Z'),
    updatedAt: new Date('2026-08-18T09:30:00.000Z'),
    ...surcharges,
  };
}

/** Extrait le texte du PDF. `pdf-parse` n'expose pas de types. */
async function extraire(buffer: Buffer): Promise<{ pages: number; texte: string }> {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const analyser = require('pdf-parse') as (
    donnees: Buffer,
  ) => Promise<{ numpages: number; text: string }>;

  const resultat = await analyser(buffer);
  return { pages: resultat.numpages, texte: resultat.text };
}

/** L'interlettrage éclate certains mots à l'extraction : on compare sans espaces. */
function sansEspaces(texte: string): string {
  return texte.replace(/\s+/g, '');
}

beforeEach(() => {
  viderCachePdf();
});

describe('mise en forme des litres', () => {
  it('supprime les décimales inutiles et utilise la virgule', () => {
    expect(formaterLitres(40)).toBe('40');
    expect(formaterLitres(85.5)).toBe('85,5');
    expect(formaterLitres(null)).toBeNull();
    expect(formaterLitres({ toString: () => 'illisible' })).toBeNull();
  });
});

describe('nom du fichier téléchargé', () => {
  it('suit le format OM-2026-0001_YEYE.pdf', () => {
    expect(nomFichierPdf('OM-2026-0001', 'YEYE')).toBe('OM-2026-0001_YEYE.pdf');
  });

  it('nettoie les accents et les caractères problématiques', () => {
    expect(nomFichierPdf('OM-2026-0007', "N'GUESSAN")).toBe('OM-2026-0007_N-GUESSAN.pdf');
    expect(nomFichierPdf('OM-2026-0008', 'KOUAMÉ ADJÉ')).toBe('OM-2026-0008_KOUAME-ADJE.pdf');
  });

  it('remplace un numéro provisoire', () => {
    expect(nomFichierPdf('BROUILLON-ABC-123', 'YEYE')).toBe('OM-BROUILLON_YEYE.pdf');
  });

  it('conserve un nom utilisable même si le nom est vide', () => {
    expect(nomFichierPdf('OM-2026-0001', '   ')).toBe('OM-2026-0001_COLLABORATEUR.pdf');
  });
});

describe('URL de vérification', () => {
  it('pointe vers la page publique du numéro', () => {
    expect(urlVerification('OM-2026-0001')).toMatch(/\/verify\/OM-2026-0001$/);
  });
});

describe('non-régression du document', () => {
  it('tient sur une seule page et porte le numéro d’ordre de mission', async () => {
    const buffer = await rendrePdf(missionReference());
    const { pages, texte } = await extraire(buffer);

    expect(pages).toBe(1);
    expect(texte).toContain('OM-2026-0001');
  });

  it('reprend les libellés du formulaire papier, dans l’ordre', async () => {
    const buffer = await rendrePdf(missionReference());
    const { texte } = await extraire(buffer);

    const libelles = [
      "ORDRE DE MISSION EN COTE D'IVOIRE",
      'NOM',
      'PRENOMS',
      'MATRICULE',
      'FONCTION',
      'ANALYTIQUE',
      'OBJET DE LA MISSION',
      'LIEU DE LA MISSION',
      'DATE DE DEPART',
      'DATE DE RETOUR',
      'Il utilisera les moyens de transport et la quantité de carburant suivants',
      "Véhicule de l'établissement",
      'Véhicule personnel',
      'Véhicule de location',
      'Transport en commun',
      'litres de gasoil',
      'Supérieur Hiérarchique',
      'Ressources Humaines',
      'Directeur',
      'Partie réservée à la sécurité',
      'Heure de départ',
      "Heure d'arrivée",
    ];

    let position = -1;
    for (const libelle of libelles) {
      const trouve = texte.indexOf(libelle);
      expect(trouve, `libellé absent : ${libelle}`).toBeGreaterThan(-1);
      expect(trouve, `libellé mal placé : ${libelle}`).toBeGreaterThan(position);
      position = trouve;
    }
  });

  it('reprend les données de la fiche d’origine', async () => {
    const buffer = await rendrePdf(missionReference());
    const { texte } = await extraire(buffer);

    for (const valeur of [
      'YEYE',
      'SCHADRACH GUY-ROLAND',
      '4071',
      'Visite chantier',
      'Assinie',
      'le 19/08/2026 à 13h00',
      'le 19/08/2026 à 17h00',
      '1234 AB 01',
    ]) {
      expect(texte, `valeur absente : ${valeur}`).toContain(valeur);
    }
  });

  it('porte les mentions légales et les coordonnées du pied de page', async () => {
    const buffer = await rendrePdf(missionReference());
    const { texte } = await extraire(buffer);

    expect(texte).toContain('contact@porteo-group.com');
    expect(texte).toContain('+225 27 21 54 03 03');
    expect(texte).toContain('ABIDJAN-MARCORY IMMEUBLE PORTEO');
    expect(texte).toContain('CI-ABJ-2017-B16427');
    expect(sansEspaces(texte)).toContain('WWW.PORTEO-GROUP.COM');
  });

  it('affiche la mention de validation électronique', async () => {
    const buffer = await rendrePdf(missionReference());
    const { texte } = await extraire(buffer);

    expect(texte).toContain('Validé électroniquement par');
    expect(texte).toContain('FATOUMATA DIALLO');
    expect(texte).toContain('18/08/2026');
  });

  it('appose le filigrane REFUSÉ et le motif sur un ordre refusé', async () => {
    const buffer = await rendrePdf(
      missionReference({
        status: MissionStatus.REJECTED,
        motifRefus: 'Budget déplacement déjà consommé pour le mois en cours.',
      }),
    );
    const { pages, texte } = await extraire(buffer);

    expect(pages).toBe(1);
    expect(sansEspaces(texte)).toContain('REFUSÉ');
    expect(texte).toContain('Budget déplacement');
  });

  it('appose le filigrane d’attente sur un ordre soumis', async () => {
    const buffer = await rendrePdf(
      missionReference({ status: MissionStatus.SUBMITTED, decidedAt: null, decidedByName: null }),
    );
    const { pages, texte } = await extraire(buffer);

    expect(pages).toBe(1);
    expect(sansEspaces(texte)).toContain('ENATTENTEDEVALIDATION');
  });

  it('n’affiche pas de numéro pour un brouillon', async () => {
    const buffer = await rendrePdf(
      missionReference({ numero: 'BROUILLON-XYZ-123', status: MissionStatus.DRAFT }),
    );
    const { pages, texte } = await extraire(buffer);

    expect(pages).toBe(1);
    expect(texte).toContain('Brouillon (non numéroté)');
    expect(texte).not.toContain('BROUILLON-XYZ-123');
  });

  it('reste sur une page avec des valeurs longues', async () => {
    const buffer = await rendrePdf(
      missionReference({
        objet:
          "Réception provisoire des travaux de terrassement, de drainage et de revêtement de la voie d'accès à la base vie du chantier, en présence du maître d'ouvrage délégué",
        lieu: 'San-Pédro — zone industrialo-portuaire, secteur 4',
        fonction: 'Responsable Développement & Intégration des Systèmes d’Information et Réseaux',
        status: MissionStatus.REJECTED,
        motifRefus: 'Motif volontairement très détaillé. '.repeat(12),
      }),
    );

    const { pages } = await extraire(buffer);
    expect(pages).toBe(1);
  });
});

describe('cache mémoire', () => {
  it('renvoie le même tampon tant que l’ordre n’a pas changé', async () => {
    const mission = missionReference();

    const premier = await rendrePdfAvecCache(mission);
    const second = await rendrePdfAvecCache(mission);

    expect(second).toBe(premier);
  });

  it('invalide l’entrée dès que l’ordre est modifié', async () => {
    const mission = missionReference();
    const premier = await rendrePdfAvecCache(mission);

    const modifie = missionReference({ updatedAt: new Date('2026-08-19T10:00:00.000Z') });
    const second = await rendrePdfAvecCache(modifie);

    expect(clefCache(modifie)).not.toBe(clefCache(mission));
    expect(second).not.toBe(premier);
  });
});
