import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

/** Champs métier ajoutés à la session et au jeton. */
interface ProfilPorteo {
  id: string;
  role: Role;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  actif: boolean;
}

declare module 'next-auth' {
  interface Session {
    user: ProfilPorteo & DefaultSession['user'];
  }
}

/*
 * `next-auth/jwt` se contente de réexporter `@auth/core/jwt` : c'est donc le
 * module d'origine qu'il faut augmenter pour que le typage soit pris en compte.
 */
declare module '@auth/core/jwt' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface JWT extends ProfilPorteo {}
}

export {};
