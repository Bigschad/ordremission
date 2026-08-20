/**
 * Différences de dialecte entre les deux moteurs supportés.
 *
 * PostgreSQL (Neon) est le moteur de production. SQLite sert la démonstration
 * et les tests, afin de pouvoir lancer l'application sans infrastructure :
 * `DATABASE_URL="file:./demo.db"`.
 */

/** Vrai lorsque `DATABASE_URL` désigne un fichier SQLite. */
export function estSqlite(url: string = process.env.DATABASE_URL ?? ''): boolean {
  return url.startsWith('file:');
}

/** Filtre « contient » accepté par Prisma sur les deux moteurs. */
export interface FiltreContient {
  contains: string;
}

/**
 * Filtre « contient », insensible à la casse.
 *
 * PostgreSQL exige `mode: 'insensitive'` ; SQLite ne connaît pas cette option
 * et compare déjà les caractères ASCII sans tenir compte de la casse — la
 * différence ne porte donc que sur les caractères accentués, ce qui est
 * acceptable pour une base de démonstration.
 *
 * Le type de retour ne mentionne volontairement pas `mode` : cette propriété
 * n'existe pas dans le client Prisma généré pour SQLite, et l'application doit
 * se compiler quel que soit le client en place.
 */
export function contient(valeur: string): FiltreContient {
  const filtre: FiltreContient & Record<string, unknown> = { contains: valeur };

  if (!estSqlite()) {
    filtre.mode = 'insensitive';
  }

  return filtre;
}
