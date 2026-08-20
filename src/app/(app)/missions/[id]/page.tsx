import { MissionStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, CircleX, Download, History, Pencil } from 'lucide-react';
import { BadgeStatut } from '@/components/mission/badge-statut';
import { RecapitulatifMission } from '@/components/mission/recapitulatif-mission';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { auditActionLabel, getMissionAuditTrail } from '@/lib/audit';
import { formatDateTime } from '@/lib/dates';
import { RELANCES_MAX } from '@/lib/mission/constantes';
import { estNumeroProvisoire } from '@/lib/mission/numero';
import { trouverMission } from '@/lib/mission/queries';
import { estAnnulable, estModifiable } from '@/lib/mission/status';
import { exigerUtilisateur } from '@/lib/session';
import { ActionsMission } from './actions-mission';

export const metadata: Metadata = { title: 'Ordre de mission' };

export default async function PageDetailMission({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await exigerUtilisateur();
  const { id } = await params;

  // `trouverMission` applique la règle 9 : un ordre qui ne vous concerne pas
  // est indiscernable d'un ordre inexistant.
  const mission = await trouverMission(utilisateur, id);
  if (!mission) notFound();

  const historique = await getMissionAuditTrail(mission.id);
  const estDemandeur = mission.demandeurId === utilisateur.id;
  const numeroteAffiche = estNumeroProvisoire(mission.numero)
    ? 'Brouillon (non numéroté)'
    : mission.numero;

  return (
    <main className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-3">
          <Link href="/">
            <ChevronLeft aria-hidden />
            Mes ordres de mission
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{numeroteAffiche}</h1>
          <BadgeStatut statut={mission.status} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {mission.objet} — {mission.lieu}
        </p>
      </div>

      {mission.status === MissionStatus.REJECTED && mission.motifRefus ? (
        <Alert variant="destructive">
          <CircleX aria-hidden />
          <AlertTitle>Ordre de mission refusé</AlertTitle>
          <AlertDescription>
            <p>{mission.motifRefus}</p>
            {mission.decidedAt ? (
              <p className="mt-2 text-xs">
                Décision du {formatDateTime(mission.decidedAt)}
                {mission.decidedByName ? ` — ${mission.decidedByName}` : ''}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {mission.status === MissionStatus.APPROVED && mission.decidedAt ? (
        <Alert variant="success">
          <AlertTitle>Ordre de mission validé</AlertTitle>
          <AlertDescription>
            Validé le {formatDateTime(mission.decidedAt)}
            {mission.decidedByName ? ` par ${mission.decidedByName}` : ''}. Présentez le PDF au
            poste de garde lors de votre départ.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          {/* Ouvre le PDF généré à la demande : rien n'est stocké côté serveur. */}
          <a href={`/api/missions/${mission.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Download aria-hidden />
            Télécharger le PDF
          </a>
        </Button>

        {estDemandeur && estModifiable(mission.status) ? (
          <Button asChild variant="outline">
            <Link href={`/missions/${mission.id}/modifier`}>
              <Pencil aria-hidden />
              Modifier le brouillon
            </Link>
          </Button>
        ) : null}

        {estDemandeur ? (
          <ActionsMission
            missionId={mission.id}
            statut={mission.status}
            annulable={estAnnulable(mission.status)}
            supprimable={estModifiable(mission.status)}
            relances={mission.relances}
            relancesMax={RELANCES_MAX}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Détail de la demande</CardTitle>
        </CardHeader>
        <CardContent>
          <RecapitulatifMission mission={mission} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="text-muted-foreground size-5" aria-hidden />
            Historique des actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historique.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune action enregistrée.</p>
          ) : (
            <ol className="space-y-3">
              {historique.map((entree) => (
                <li
                  key={entree.id}
                  className="border-border flex gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{auditActionLabel(entree.action)}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(entree.createdAt)} — {entree.acteur}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
