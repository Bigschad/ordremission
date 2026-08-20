import { MissionStatus, TransportType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { rendrePdf } from '@/lib/pdf/render';
import { numeroProvisoire } from '@/lib/mission/numero';
import { missionBrouillonSchema } from '@/lib/validations/mission';
import { getUtilisateurCourant } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aperçu du PDF pendant la saisie, sans rien enregistrer.
 *
 * Alimente le panneau latéral du formulaire : le collaborateur voit
 * exactement le document qui partira aux Ressources Humaines. Le rendu
 * s'appuie sur le **même composant** que le PDF définitif, ce qui garantit
 * qu'aperçu et document final ne peuvent pas diverger.
 */
export async function POST(requete: Request): Promise<NextResponse> {
  const utilisateur = await getUtilisateurCourant();

  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Authentification requise.' }, { status: 401 });
  }

  const donnees = await requete.formData();

  const analyse = missionBrouillonSchema.safeParse({
    analytique: (donnees.get('analytique') as string | null) ?? undefined,
    objet: (donnees.get('objet') as string | null) ?? undefined,
    lieu: (donnees.get('lieu') as string | null) ?? undefined,
    dateDepart: (donnees.get('dateDepart') as string | null) ?? undefined,
    dateRetour: (donnees.get('dateRetour') as string | null) ?? undefined,
    transportType: (donnees.get('transportType') as string | null) ?? undefined,
    transportDetail: (donnees.get('transportDetail') as string | null) ?? undefined,
    litresGasoil: (donnees.get('litresGasoil') as string | null) ?? undefined,
  });

  // L'aperçu ne doit jamais bloquer la saisie : les champs invalides ou encore
  // vides sont simplement rendus en blanc, comme sur un formulaire papier.
  const valeurs = analyse.success ? analyse.data : null;
  const maintenant = new Date();

  const buffer = await rendrePdf({
    numero: numeroProvisoire(),
    nom: utilisateur.nom,
    prenoms: utilisateur.prenoms,
    matricule: utilisateur.matricule,
    fonction: utilisateur.fonction,
    analytique: valeurs?.analytique ?? null,
    objet: valeurs?.objet ?? '',
    lieu: valeurs?.lieu ?? '',
    dateDepart: valeurs?.dateDepart ?? maintenant,
    dateRetour: valeurs?.dateRetour ?? maintenant,
    transportType: valeurs?.transportType ?? TransportType.VEHICULE_ETABLISSEMENT,
    transportDetail: valeurs?.transportDetail ?? null,
    litresGasoil: valeurs?.litresGasoil ?? null,
    status: MissionStatus.DRAFT,
    motifRefus: null,
    decidedAt: null,
    decidedByName: null,
    createdAt: maintenant,
    updatedAt: maintenant,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="apercu-ordre-de-mission.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
