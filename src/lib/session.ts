import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface UtilisateurCourant {
  id: string;
  email: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  role: Role;
  actif: boolean;
}

/**
 * Profil de l'utilisateur connecté, **relu en base à chaque appel**.
 *
 * Le jeton de session peut être périmé (rôle modifié, compte désactivé) :
 * l'autorisation ne s'appuie donc jamais sur son contenu seul.
 */
export async function getUtilisateurCourant(): Promise<UtilisateurCourant | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const utilisateur = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      nom: true,
      prenoms: true,
      matricule: true,
      fonction: true,
      role: true,
      actif: true,
    },
  });

  if (!utilisateur || !utilisateur.actif) return null;

  return utilisateur;
}

/** Redirige vers la page de connexion si aucune session valide n'existe. */
export async function exigerUtilisateur(): Promise<UtilisateurCourant> {
  const utilisateur = await getUtilisateurCourant();
  if (!utilisateur) redirect('/login');
  return utilisateur;
}

export function estRH(utilisateur: Pick<UtilisateurCourant, 'role'>): boolean {
  return utilisateur.role === Role.HR || utilisateur.role === Role.ADMIN;
}

export function estAdmin(utilisateur: Pick<UtilisateurCourant, 'role'>): boolean {
  return utilisateur.role === Role.ADMIN;
}

/** Réserve l'accès aux rôles indiqués ; renvoie une 404 sinon (pas d'énumération). */
export async function exigerRole(...roles: Role[]): Promise<UtilisateurCourant> {
  const utilisateur = await exigerUtilisateur();
  if (!roles.includes(utilisateur.role)) redirect('/');
  return utilisateur;
}

/** Vue globale des ordres de mission : RH et administrateurs uniquement (règle 9). */
export async function exigerRH(): Promise<UtilisateurCourant> {
  return exigerRole(Role.HR, Role.ADMIN);
}

export async function exigerAdmin(): Promise<UtilisateurCourant> {
  return exigerRole(Role.ADMIN);
}

/** Erreur d'autorisation levée depuis les Server Actions (jamais une redirection). */
export class AccesRefuseError extends Error {
  constructor(message = "Vous n'êtes pas autorisé à effectuer cette action.") {
    super(message);
    this.name = 'AccesRefuseError';
  }
}

/** Variante pour Server Actions : lève au lieu de rediriger. */
export async function exigerUtilisateurAction(): Promise<UtilisateurCourant> {
  const utilisateur = await getUtilisateurCourant();
  if (!utilisateur) {
    throw new AccesRefuseError('Votre session a expiré. Veuillez vous reconnecter.');
  }
  return utilisateur;
}

export async function exigerRHAction(): Promise<UtilisateurCourant> {
  const utilisateur = await exigerUtilisateurAction();
  if (!estRH(utilisateur)) throw new AccesRefuseError();
  return utilisateur;
}

export async function exigerAdminAction(): Promise<UtilisateurCourant> {
  const utilisateur = await exigerUtilisateurAction();
  if (!estAdmin(utilisateur)) throw new AccesRefuseError();
  return utilisateur;
}
