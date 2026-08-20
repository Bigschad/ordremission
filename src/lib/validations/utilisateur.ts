import { Role } from '@prisma/client';
import { z } from 'zod';

/** Validation des fiches collaborateurs (écran d'administration). */
export const utilisateurSchema = z.object({
  nom: z
    .string({ required_error: 'Le nom est obligatoire' })
    .trim()
    .min(1, 'Le nom est obligatoire')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    // Le formulaire papier est rempli en majuscules : on normalise.
    .transform((valeur) => valeur.toUpperCase()),
  prenoms: z
    .string({ required_error: 'Les prénoms sont obligatoires' })
    .trim()
    .min(1, 'Les prénoms sont obligatoires')
    .max(150, 'Les prénoms ne peuvent pas dépasser 150 caractères')
    .transform((valeur) => valeur.toUpperCase()),
  matricule: z
    .string({ required_error: 'Le matricule est obligatoire' })
    .trim()
    .min(1, 'Le matricule est obligatoire')
    .max(20, 'Le matricule ne peut pas dépasser 20 caractères'),
  fonction: z
    .string({ required_error: 'La fonction est obligatoire' })
    .trim()
    .min(1, 'La fonction est obligatoire')
    .max(150, 'La fonction ne peut pas dépasser 150 caractères'),
  email: z
    .string({ required_error: "L'adresse e-mail est obligatoire" })
    .trim()
    .toLowerCase()
    .min(1, "L'adresse e-mail est obligatoire")
    .email('Adresse e-mail invalide'),
  role: z.nativeEnum(Role, { required_error: 'Le rôle est obligatoire' }),
  actif: z.coerce.boolean().default(true),
});

export type UtilisateurData = z.infer<typeof utilisateurSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Collaborateur',
  HR: 'Ressources Humaines',
  ADMIN: 'Administrateur',
};

/** Colonnes attendues par l'import CSV en masse. */
export const COLONNES_CSV = ['nom', 'prenoms', 'matricule', 'fonction', 'email', 'role'] as const;

export interface LigneCsv {
  ligne: number;
  donnees: UtilisateurData;
}

export interface ErreurCsv {
  ligne: number;
  message: string;
}

export interface AnalyseCsv {
  valides: LigneCsv[];
  erreurs: ErreurCsv[];
}

/** Découpe une ligne CSV en tenant compte des guillemets. */
function decouperLigne(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let entreGuillemets = false;

  for (let i = 0; i < ligne.length; i += 1) {
    const caractere = ligne[i];

    if (caractere === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i += 1;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (caractere === separateur && !entreGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += caractere;
    }
  }

  champs.push(courant);
  return champs.map((champ) => champ.trim());
}

/**
 * Analyse un CSV d'import en masse.
 * Séparateur `,` ou `;` (Excel francophone), en-tête obligatoire.
 * Les lignes invalides sont signalées sans bloquer les lignes valides.
 */
export function analyserCsv(contenu: string): AnalyseCsv {
  const lignes = contenu
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((ligne) => ligne.trim().length > 0);

  if (lignes.length === 0) {
    return { valides: [], erreurs: [{ ligne: 0, message: 'Le fichier est vide.' }] };
  }

  const entete = lignes[0] ?? '';
  const separateur = entete.includes(';') ? ';' : ',';
  const colonnes = decouperLigne(entete, separateur).map((colonne) => colonne.toLowerCase());

  const manquantes = COLONNES_CSV.filter((colonne) => !colonnes.includes(colonne));
  if (manquantes.length > 0) {
    return {
      valides: [],
      erreurs: [
        {
          ligne: 1,
          message: `Colonnes manquantes dans l'en-tête : ${manquantes.join(', ')}. Attendu : ${COLONNES_CSV.join(', ')}.`,
        },
      ],
    };
  }

  const valides: LigneCsv[] = [];
  const erreurs: ErreurCsv[] = [];

  for (let index = 1; index < lignes.length; index += 1) {
    const numeroLigne = index + 1;
    const champs = decouperLigne(lignes[index] ?? '', separateur);

    const brut: Record<string, string> = {};
    colonnes.forEach((colonne, position) => {
      brut[colonne] = champs[position] ?? '';
    });

    const analyse = utilisateurSchema.safeParse({
      nom: brut.nom,
      prenoms: brut.prenoms,
      matricule: brut.matricule,
      fonction: brut.fonction,
      email: brut.email,
      role: (brut.role || 'EMPLOYEE').toUpperCase(),
      actif: true,
    });

    if (analyse.success) {
      valides.push({ ligne: numeroLigne, donnees: analyse.data });
    } else {
      erreurs.push({
        ligne: numeroLigne,
        message: analyse.error.issues
          .map((issue) => `${issue.path.join('.')} : ${issue.message}`)
          .join(' — '),
      });
    }
  }

  return { valides, erreurs };
}
