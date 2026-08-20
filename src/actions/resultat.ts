/**
 * Contrat de retour commun à toutes les Server Actions.
 * Aucune exception n'est laissée remonter jusqu'au client : chaque action
 * renvoie un résultat typé, exploitable directement par l'interface.
 */
export type ActionResultat<T = undefined> =
  | { ok: true; donnees: T; message?: string }
  | { ok: false; erreur: string; erreursChamps?: Record<string, string> };

export function succes<T>(donnees: T, message?: string): ActionResultat<T> {
  return { ok: true, donnees, ...(message ? { message } : {}) };
}

export function echec(erreur: string, erreursChamps?: Record<string, string>): ActionResultat<never> {
  return { ok: false, erreur, ...(erreursChamps ? { erreursChamps } : {}) };
}

/** Aplatit les erreurs Zod en `{ champ: message }`, prêtes pour react-hook-form. */
export function erreursDepuisZod(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const issue of issues) {
    const champ = issue.path.map(String).join('.') || '_global';
    erreurs[champ] ??= issue.message;
  }
  return erreurs;
}
