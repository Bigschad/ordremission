import type { Metadata } from 'next';
import { CircleX, TriangleAlert } from 'lucide-react';
import { EntetePublic, PiedPublic } from '@/components/marque/entete-public';
import { RecapitulatifMission } from '@/components/mission/recapitulatif-mission';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { preparerPageJeton } from '@/lib/mission/jeton-page';
import { FormulaireRefus } from './formulaire-refus';

export const metadata: Metadata = { title: 'Refuser un ordre de mission' };
export const dynamic = 'force-dynamic';

/**
 * Page d'atterrissage « Refuser ».
 * Comme pour la validation, le GET est sans effet : le refus n'est enregistré
 * qu'après saisie d'un motif et confirmation explicite (règle 8).
 */
export default async function PageRefus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const etat = await preparerPageJeton(token, 'REJECT');

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <EntetePublic
        titre="Refus d'un ordre de mission"
        sousTitre="Ressources Humaines — PORTEO GROUP"
      />

      {!etat.valide ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Lien inutilisable</AlertTitle>
          <AlertDescription>{etat.message}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleX className="size-5 text-destructive" aria-hidden />
              Ordre de mission {etat.mission.numero}
            </CardTitle>
            <CardDescription>
              Indiquez le motif du refus : il sera communiqué au collaborateur. Aucune décision
              n&apos;est enregistrée tant que vous n&apos;avez pas confirmé.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <RecapitulatifMission mission={etat.mission} />
            <FormulaireRefus token={etat.token} numero={etat.mission.numero} />
          </CardContent>
        </Card>
      )}

      <PiedPublic />
    </main>
  );
}
