import { MissionStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Download } from 'lucide-react';
import { BadgeStatut } from '@/components/mission/badge-statut';
import { EtatVide } from '@/components/mission/etat-vide';
import { SqueletteListeMissions } from '@/components/mission/squelette-liste';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatDateTime } from '@/lib/dates';
import { analyserParamsRH, construireQuery, type ParamsRH } from '@/lib/mission/filtres-url';
import { estNumeroProvisoire } from '@/lib/mission/numero';
import { compterParStatut, listerPourRH } from '@/lib/mission/queries';
import { prisma } from '@/lib/prisma';
import { exigerRH } from '@/lib/session';
import { BarreFiltres } from './barre-filtres';
import { DecisionEnLigne } from './decision-en-ligne';
import { Pagination } from './pagination';

export const metadata: Metadata = { title: 'File Ressources Humaines' };

async function FileMissions({ params }: { params: ParamsRH }) {
  const filtres = analyserParamsRH(params);
  const { missions, total, page, nbPages } = await listerPourRH(filtres);

  if (missions.length === 0) {
    return (
      <EtatVide
        titre="Aucun ordre de mission"
        description="Aucun ordre de mission ne correspond aux filtres sélectionnés. Élargissez la recherche ou réinitialisez les filtres."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <caption className="sr-only">
              Ordres de mission, page {page} sur {nbPages}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Demandeur</TableHead>
                <TableHead>Objet / Lieu</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {missions.map((mission) => (
                <TableRow key={mission.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/missions/${mission.id}`} className="hover:underline">
                      {/* Un brouillon n'a pas encore de numéro : le numéro
                          provisoire est un détail d'implémentation. */}
                      {estNumeroProvisoire(mission.numero) ? 'Brouillon' : mission.numero}
                    </Link>
                  </TableCell>

                  <TableCell className="min-w-40">
                    <p className="font-medium">
                      {mission.prenoms} {mission.nom}
                    </p>
                    <p className="text-xs text-muted-foreground">Matricule {mission.matricule}</p>
                  </TableCell>

                  <TableCell className="min-w-52">
                    <p className="line-clamp-1">{mission.objet}</p>
                    <p className="text-xs text-muted-foreground">{mission.lieu}</p>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs">
                    <p>{formatDateTime(mission.dateDepart)}</p>
                    <p className="text-muted-foreground">→ {formatDate(mission.dateRetour)}</p>
                  </TableCell>

                  <TableCell>
                    <BadgeStatut statut={mission.status} />
                  </TableCell>

                  <TableCell className="text-right">
                    {mission.status === MissionStatus.SUBMITTED ? (
                      <DecisionEnLigne missionId={mission.id} numero={mission.numero} />
                    ) : (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/missions/${mission.id}`}>Consulter</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination params={params} page={page} nbPages={nbPages} total={total} />
    </div>
  );
}

/** File d'attente des Ressources Humaines : vue globale, filtres et décisions. */
export default async function PageFileRH({
  searchParams,
}: {
  searchParams: Promise<ParamsRH>;
}) {
  await exigerRH();
  const params = await searchParams;

  const [compteurs, demandeurs] = await Promise.all([
    compterParStatut(),
    prisma.user.findMany({
      where: { missions: { some: {} } },
      select: { id: true, nom: true, prenoms: true },
      orderBy: [{ nom: 'asc' }, { prenoms: 'asc' }],
    }),
  ]);

  const enAttente = compteurs[MissionStatus.SUBMITTED];

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">File Ressources Humaines</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {enAttente === 0
              ? 'Aucun ordre de mission en attente de décision.'
              : `${enAttente} ordre${enAttente > 1 ? 's' : ''} de mission en attente de décision.`}
          </p>
        </div>

        <Button asChild variant="outline">
          <a href={`/api/rh/export${construireQuery(params, { page: undefined })}`}>
            <Download aria-hidden />
            Exporter en CSV
          </a>
        </Button>
      </div>

      <BarreFiltres params={params} demandeurs={demandeurs} compteurs={compteurs} />

      <Suspense key={JSON.stringify(params)} fallback={<SqueletteListeMissions lignes={6} />}>
        <FileMissions params={params} />
      </Suspense>
    </main>
  );
}
