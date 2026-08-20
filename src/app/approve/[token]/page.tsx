import type { Metadata } from 'next';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { EntetePublic, PiedPublic } from '@/components/marque/entete-public';
import { RecapitulatifMission } from '@/components/mission/recapitulatif-mission';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { preparerPageJeton } from '@/lib/mission/jeton-page';
import { FormulaireValidation } from './formulaire-validation';

export const metadata: Metadata = { title: 'Valider un ordre de mission' };
export const dynamic = 'force-dynamic';

/**
 * Page d'atterrissage « Valider ».
 *
 * Le GET se contente d'afficher le récapitulatif : la validation exige une
 * action explicite (POST via Server Action), conformément à la consigne
 * « aucune action destructrice sur simple GET ».
 */
export default async function PageValidation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const etat = await preparerPageJeton(token, 'APPROVE');

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <EntetePublic
        titre="Validation d'un ordre de mission"
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
              <CircleCheck className="text-success size-5" aria-hidden />
              Ordre de mission {etat.mission.numero}
            </CardTitle>
            <CardDescription>
              Vérifiez les informations ci-dessous, puis confirmez la validation. Aucune décision
              n&apos;est enregistrée tant que vous n&apos;avez pas confirmé.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <RecapitulatifMission mission={etat.mission} />
            <FormulaireValidation token={etat.token} numero={etat.mission.numero} />
          </CardContent>
        </Card>
      )}

      <PiedPublic />
    </main>
  );
}
