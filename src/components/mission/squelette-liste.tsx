import { Skeleton } from '@/components/ui/skeleton';

/** Squelette affiché pendant le chargement d'une liste d'ordres de mission. */
export function SqueletteListeMissions({ lignes = 4 }: { lignes?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement des ordres de mission…</span>
      {Array.from({ length: lignes }, (_, index) => (
        <div key={index} className="rounded-lg border bg-background p-4">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-2.5 h-4 w-2/3" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <Skeleton className="mt-2 h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
