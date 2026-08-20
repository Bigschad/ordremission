import type { Metadata } from 'next';
import { MissionStatus } from '@prisma/client';
import { CircleCheck, CircleHelp, CircleX, Clock } from 'lucide-react';
import { EntetePublic, PiedPublic } from '@/components/marque/entete-public';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/dates';
import { trouverMissionParNumero } from '@/lib/mission/queries';
import { statusLabel } from '@/lib/mission/status';
import { consommerRateLimit, POLITIQUES } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/request';

export const metadata: Metadata = { title: "Vérification d'authenticité" };
export const dynamic = 'force-dynamic';

/**
 * Vérification publique d'authenticité, cible du QR code du PDF.
 *
 * Volontairement minimale : statut, dates de la mission, date de décision et
 * nom du valideur. Aucune donnée personnelle sensible n'est exposée — ni
 * matricule, ni objet détaillé du déplacement, ni identité du demandeur.
 */
export default async function PageVerification({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;

  const quota = await consommerRateLimit({
    cle: `verification:ip:${await getClientIp()}`,
    ...POLITIQUES.verificationParIp,
  });

  const mission = quota.autorise ? await trouverMissionParNumero(decodeURIComponent(numero)) : null;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <EntetePublic
        titre="Vérification d'authenticité"
        sousTitre="Ordres de mission — PORTEO GROUP"
      />

      {!quota.autorise ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2">
              <Clock className="size-5" aria-hidden />
              Trop de vérifications
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Merci de patienter quelques minutes avant de vérifier un nouvel ordre de mission.
          </CardContent>
        </Card>
      ) : !mission ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2">
              <CircleHelp className="size-5" aria-hidden />
              Ordre de mission inconnu
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>
              Aucun ordre de mission ne porte le numéro{' '}
              <strong className="text-foreground">{decodeURIComponent(numero)}</strong>.
            </p>
            <p>
              Vérifiez le numéro inscrit sur le document. Un document présentant un numéro inconnu
              ne peut pas être considéré comme authentique.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mission.status === MissionStatus.APPROVED ? (
                <CircleCheck className="text-success size-5" aria-hidden />
              ) : mission.status === MissionStatus.REJECTED ? (
                <CircleX className="text-destructive size-5" aria-hidden />
              ) : (
                <Clock className="text-warning size-5" aria-hidden />
              )}
              {mission.numero}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <dl className="divide-border divide-y text-sm">
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Statut</dt>
                <dd className="font-semibold">{statusLabel(mission.status)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Lieu de la mission</dt>
                <dd>{mission.lieu}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Départ</dt>
                <dd>{formatDateTime(mission.dateDepart)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Retour</dt>
                <dd>{formatDateTime(mission.dateRetour)}</dd>
              </div>
              {mission.decidedAt ? (
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">Date de décision</dt>
                  <dd>{formatDateTime(mission.decidedAt)}</dd>
                </div>
              ) : null}
              {mission.decidedByName ? (
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">Validé par</dt>
                  <dd>{mission.decidedByName}</dd>
                </div>
              ) : null}
            </dl>

            {mission.status !== MissionStatus.APPROVED ? (
              <p className="bg-warning/10 text-warning mt-4 rounded-md p-3 text-xs">
                Cet ordre de mission n&apos;est pas validé : il ne constitue pas une autorisation de
                déplacement.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <PiedPublic />
    </main>
  );
}
