import { headers } from 'next/headers';

/**
 * Adresse IP de l'appelant.
 * Sur Vercel, `x-forwarded-for` est renseigné par le proxy ; la première
 * adresse de la liste est celle du client.
 */
export async function getClientIp(): Promise<string> {
  const entetes = await headers();

  const forwarded = entetes.get('x-forwarded-for');
  if (forwarded) {
    const premiere = forwarded.split(',')[0]?.trim();
    if (premiere) return premiere;
  }

  return entetes.get('x-real-ip') ?? 'inconnue';
}
