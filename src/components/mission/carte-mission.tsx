import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';
import { BadgeStatut } from '@/components/mission/badge-statut';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/dates';
import { estNumeroProvisoire } from '@/lib/mission/numero';
import type { MissionResume } from '@/lib/mission/queries';

/** Carte d'un ordre de mission, pensée d'abord pour l'affichage mobile. */
export function CarteMission({ mission }: { mission: MissionResume }) {
  const memeJour = formatDate(mission.dateDepart) === formatDate(mission.dateRetour);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <Link href={`/missions/${mission.id}`} className="block rounded-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-mono text-xs text-muted-foreground">
              {estNumeroProvisoire(mission.numero) ? 'Brouillon' : mission.numero}
            </p>
            <BadgeStatut statut={mission.status} />
          </div>

          <h3 className="mt-1.5 font-semibold leading-snug">
            {mission.objet || <span className="text-muted-foreground">Objet non renseigné</span>}
          </h3>

          <dl className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">Lieu</dt>
              <dd>{mission.lieu || 'Lieu non renseigné'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">Dates</dt>
              <dd>
                {memeJour
                  ? formatDateTime(mission.dateDepart)
                  : `${formatDate(mission.dateDepart)} → ${formatDate(mission.dateRetour)}`}
              </dd>
            </div>
          </dl>

          {mission.status === 'REJECTED' && mission.motifRefus ? (
            <p className="mt-3 line-clamp-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
              <span className="font-semibold">Motif du refus : </span>
              {mission.motifRefus}
            </p>
          ) : null}
        </Link>
      </CardContent>
    </Card>
  );
}
