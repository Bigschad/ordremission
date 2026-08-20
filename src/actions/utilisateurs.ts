'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request';
import { AccesRefuseError, exigerAdminAction } from '@/lib/session';
import { analyserCsv, utilisateurSchema } from '@/lib/validations/utilisateur';
import { echec, erreursDepuisZod, succes, type ActionResultat } from './resultat';

function extraire(donnees: FormData) {
  return {
    nom: (donnees.get('nom') as string | null) ?? '',
    prenoms: (donnees.get('prenoms') as string | null) ?? '',
    matricule: (donnees.get('matricule') as string | null) ?? '',
    fonction: (donnees.get('fonction') as string | null) ?? '',
    email: (donnees.get('email') as string | null) ?? '',
    role: (donnees.get('role') as string | null) ?? 'EMPLOYEE',
    actif: donnees.get('actif') === 'on' || donnees.get('actif') === 'true',
  };
}

/** Traduit les violations de contrainte d'unicité en message métier. */
function messageUnicite(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const cibles = error.meta?.target;
    const champs = Array.isArray(cibles) ? cibles.map(String) : [String(cibles ?? '')];

    if (champs.some((champ) => champ.includes('email'))) {
      return 'Cette adresse e-mail est déjà utilisée par un autre collaborateur.';
    }
    if (champs.some((champ) => champ.includes('matricule'))) {
      return 'Ce matricule est déjà attribué à un autre collaborateur.';
    }
    return 'Cette valeur est déjà utilisée par un autre collaborateur.';
  }
  return null;
}

function gererErreur(error: unknown): ActionResultat<never> {
  if (error instanceof AccesRefuseError) return echec(error.message);

  const unicite = messageUnicite(error);
  if (unicite) return echec(unicite);

  console.error('Erreur de Server Action « utilisateur »', error);
  return echec("Une erreur inattendue est survenue. L'opération n'a pas été enregistrée.");
}

export async function creerUtilisateur(donnees: FormData): Promise<ActionResultat<{ id: string }>> {
  try {
    const admin = await exigerAdminAction();
    const analyse = utilisateurSchema.safeParse(extraire(donnees));

    if (!analyse.success) {
      return echec('Certains champs sont invalides.', erreursDepuisZod(analyse.error.issues));
    }

    const utilisateur = await prisma.user.create({
      data: analyse.data,
      select: { id: true },
    });

    await logAudit({
      entite: 'User',
      entiteId: utilisateur.id,
      action: 'CREATED',
      acteur: admin.email,
      ip: await getClientIp(),
      details: { email: analyse.data.email, role: analyse.data.role },
    });

    revalidatePath('/admin/utilisateurs');
    return succes({ id: utilisateur.id }, 'Collaborateur enregistré.');
  } catch (error) {
    return gererErreur(error);
  }
}

export async function modifierUtilisateur(
  id: string,
  donnees: FormData,
): Promise<ActionResultat<{ id: string }>> {
  try {
    const admin = await exigerAdminAction();
    const analyse = utilisateurSchema.safeParse(extraire(donnees));

    if (!analyse.success) {
      return echec('Certains champs sont invalides.', erreursDepuisZod(analyse.error.issues));
    }

    // Un administrateur ne peut ni se rétrograder ni se désactiver lui-même :
    // cela pourrait laisser l'application sans administrateur actif.
    if (id === admin.id && (analyse.data.role !== 'ADMIN' || !analyse.data.actif)) {
      return echec(
        'Vous ne pouvez pas retirer votre propre rôle d’administrateur ni désactiver votre compte.',
      );
    }

    await prisma.user.update({ where: { id }, data: analyse.data });

    await logAudit({
      entite: 'User',
      entiteId: id,
      action: 'UPDATED',
      acteur: admin.email,
      ip: await getClientIp(),
      details: { email: analyse.data.email, role: analyse.data.role, actif: analyse.data.actif },
    });

    revalidatePath('/admin/utilisateurs');
    return succes({ id }, 'Fiche collaborateur mise à jour.');
  } catch (error) {
    return gererErreur(error);
  }
}

/**
 * Active ou désactive un collaborateur.
 * Aucune suppression n'est proposée : les ordres de mission déjà émis doivent
 * conserver leur demandeur.
 */
export async function basculerActivation(
  id: string,
  actif: boolean,
): Promise<ActionResultat<{ id: string; actif: boolean }>> {
  try {
    const admin = await exigerAdminAction();

    if (id === admin.id && !actif) {
      return echec('Vous ne pouvez pas désactiver votre propre compte.');
    }

    await prisma.user.update({ where: { id }, data: { actif } });

    await logAudit({
      entite: 'User',
      entiteId: id,
      action: 'UPDATED',
      acteur: admin.email,
      ip: await getClientIp(),
      details: { actif },
    });

    revalidatePath('/admin/utilisateurs');
    return succes({ id, actif }, actif ? 'Collaborateur réactivé.' : 'Collaborateur désactivé.');
  } catch (error) {
    return gererErreur(error);
  }
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; message: string }[];
}

/**
 * Import CSV en masse.
 * Les collaborateurs déjà connus (même e-mail) sont mis à jour ; les lignes
 * invalides sont rapportées sans empêcher l'import des lignes valides.
 */
export async function importerUtilisateursCsv(
  donnees: FormData,
): Promise<ActionResultat<ResultatImport>> {
  try {
    const admin = await exigerAdminAction();

    const fichier = donnees.get('fichier');
    if (!(fichier instanceof File) || fichier.size === 0) {
      return echec('Sélectionnez un fichier CSV.');
    }

    if (fichier.size > 1_000_000) {
      return echec('Le fichier ne doit pas dépasser 1 Mo.');
    }

    const analyse = analyserCsv(await fichier.text());

    let crees = 0;
    let misAJour = 0;
    const erreurs = [...analyse.erreurs];

    for (const ligne of analyse.valides) {
      try {
        const existant = await prisma.user.findUnique({
          where: { email: ligne.donnees.email },
          select: { id: true },
        });

        if (existant) {
          await prisma.user.update({ where: { id: existant.id }, data: ligne.donnees });
          misAJour += 1;
        } else {
          await prisma.user.create({ data: ligne.donnees });
          crees += 1;
        }
      } catch (error) {
        erreurs.push({
          ligne: ligne.ligne,
          message: messageUnicite(error) ?? 'Enregistrement impossible.',
        });
      }
    }

    await logAudit({
      entite: 'User',
      entiteId: 'import-csv',
      action: 'CREATED',
      acteur: admin.email,
      ip: await getClientIp(),
      details: { crees, misAJour, erreurs: erreurs.length },
    });

    revalidatePath('/admin/utilisateurs');

    return succes(
      { crees, misAJour, erreurs },
      `Import terminé : ${crees} création(s), ${misAJour} mise(s) à jour, ${erreurs.length} ligne(s) en erreur.`,
    );
  } catch (error) {
    return gererErreur(error);
  }
}
