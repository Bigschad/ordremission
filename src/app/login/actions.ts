'use server';

import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { consommerRateLimit, POLITIQUES } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/request';

const connexionSchema = z.object({
  email: z
    .string({ required_error: 'Votre adresse e-mail est obligatoire' })
    .trim()
    .toLowerCase()
    .min(1, 'Votre adresse e-mail est obligatoire')
    .email('Adresse e-mail invalide'),
});

export interface ConnexionState {
  erreur?: string;
  email?: string;
}

/**
 * Demande d'envoi d'un lien de connexion.
 *
 * La réponse est volontairement identique que l'adresse existe ou non :
 * l'application ne doit pas permettre d'énumérer les collaborateurs.
 */
export async function demanderLienConnexion(
  _etatPrecedent: ConnexionState,
  donnees: FormData,
): Promise<ConnexionState> {
  const analyse = connexionSchema.safeParse({ email: donnees.get('email') });

  if (!analyse.success) {
    return {
      erreur: analyse.error.issues[0]?.message ?? 'Adresse e-mail invalide',
      email: String(donnees.get('email') ?? ''),
    };
  }

  const { email } = analyse.data;
  const ip = await getClientIp();

  const parEmail = await consommerRateLimit({
    cle: `auth:signin:email:${email}`,
    ...POLITIQUES.connexionParEmail,
  });
  const parIp = await consommerRateLimit({
    cle: `auth:signin:ip:${ip}`,
    ...POLITIQUES.connexionParIp,
  });

  if (!parEmail.autorise || !parIp.autorise) {
    await logAudit({
      entite: 'Auth',
      entiteId: email,
      action: 'RATE_LIMITED',
      acteur: email,
      ip,
      details: { route: 'demanderLienConnexion' },
    });

    return {
      erreur:
        'Trop de demandes de connexion. Merci de patienter quelques minutes avant de réessayer.',
      email,
    };
  }

  const suite = String(donnees.get('suite') ?? '/');
  // On n'accepte qu'un chemin interne : évite une redirection ouverte.
  const redirectTo = suite.startsWith('/') && !suite.startsWith('//') ? suite : '/';

  await signIn('email', { email, redirect: false, redirectTo });

  return { email };
}
