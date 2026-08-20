import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

/**
 * Le middleware ne fait qu'un filtrage grossier « session présente ou non »,
 * pour éviter d'afficher une page protégée à un visiteur anonyme.
 *
 * Il n'a **aucune valeur d'autorisation** : rôle et compte actif sont
 * revérifiés en base dans chaque page et chaque Server Action.
 */
const { auth } = NextAuth(authConfig);

/** Préfixes accessibles sans session. */
const CHEMINS_PUBLICS = ['/login', '/approve', '/reject', '/verify'];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  const estPublic = CHEMINS_PUBLICS.some(
    (prefixe) => pathname === prefixe || pathname.startsWith(`${prefixe}/`),
  );

  if (estPublic) {
    // Un utilisateur déjà connecté n'a rien à faire sur l'écran de connexion.
    if (request.auth && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!request.auth) {
    const url = new URL('/login', request.nextUrl);
    url.searchParams.set('suite', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     *  - /api/auth (Auth.js)
     *  - les fichiers statiques Next.js
     *  - les fichiers du dossier public
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|porteo-logo.png|robots.txt).*)',
  ],
};
