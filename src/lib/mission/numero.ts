import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Numérotation des ordres de mission : `OM-{année}-{séquence sur 4 chiffres}`.
 *
 * Le numéro définitif n'est attribué qu'à la **soumission**. Or le schéma
 * impose `numero` non nul et unique : un brouillon reçoit donc un numéro
 * provisoire `BROUILLON-…`, remplacé par le numéro définitif lors de la
 * soumission. L'interface et le PDF n'affichent jamais un numéro provisoire.
 */

const PREFIXE_BROUILLON = 'BROUILLON';

/** Numéro provisoire, unique, porté par un ordre de mission encore en brouillon. */
export function numeroProvisoire(): string {
  const aleatoire = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${PREFIXE_BROUILLON}-${Date.now().toString(36).toUpperCase()}-${aleatoire}`;
}

export function estNumeroProvisoire(numero: string): boolean {
  return numero.startsWith(`${PREFIXE_BROUILLON}-`);
}

/** Met en forme un numéro à partir de l'année et de la séquence. */
export function formatNumero(annee: number, sequence: number): string {
  return `OM-${annee}-${String(sequence).padStart(4, '0')}`;
}

/** Vrai si la chaîne respecte le format `OM-AAAA-NNNN`. */
export function estNumeroValide(numero: string): boolean {
  return /^OM-\d{4}-\d{4}$/.test(numero);
}

/** Client Prisma ou client transactionnel — les deux savent exécuter la requête. */
type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

/**
 * Incrémente et renvoie la séquence de l'année dans une transaction, en
 * sérialisant les accès concurrents.
 *
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` est atomique côté Postgres :
 * la ligne du compteur est verrouillée pour la durée de la mise à jour, ce qui
 * équivaut à un `SELECT … FOR UPDATE` suivi d'un `UPDATE`, en une seule
 * aller-retour réseau (précieux en serverless).
 */
export async function prochaineSequence(tx: PrismaExecutor, annee: number): Promise<number> {
  const lignes = await tx.$queryRaw<{ sequence: number }[]>`
    INSERT INTO "Counter" ("annee", "sequence", "updatedAt")
    VALUES (${annee}, 1, NOW())
    ON CONFLICT ("annee")
    DO UPDATE SET "sequence" = "Counter"."sequence" + 1, "updatedAt" = NOW()
    RETURNING "sequence"
  `;

  const ligne = lignes[0];
  if (!ligne) {
    throw new Error("Impossible d'attribuer un numéro d'ordre de mission.");
  }

  return Number(ligne.sequence);
}

/**
 * Attribue le prochain numéro d'ordre de mission pour l'année donnée.
 * À appeler à l'intérieur d'une transaction pour que le numéro et le passage
 * au statut `SUBMITTED` soient validés ou annulés ensemble.
 */
export async function attribuerNumero(
  tx: PrismaExecutor,
  annee: number = new Date().getUTCFullYear(),
): Promise<string> {
  const sequence = await prochaineSequence(tx, annee);
  return formatNumero(annee, sequence);
}
