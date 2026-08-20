'use client';

import { MissionStatus } from '@prisma/client';
import Link from 'next/link';
import { statusLabel } from '@/lib/mission/status';
import { cn } from '@/lib/utils';

interface Props {
  compteurs: Record<MissionStatus, number>;
  total: number;
  statutActif?: MissionStatus;
}

/**
 * Filtres par statut, rendus sous forme de liens : la sélection reste dans
 * l'URL, ce qui la rend partageable et compatible avec le bouton « retour ».
 */
export function FiltresStatut({ compteurs, total, statutActif }: Props) {
  const onglets = [
    { statut: undefined, libelle: 'Tous', compteur: total },
    ...Object.values(MissionStatus).map((statut) => ({
      statut,
      libelle: statusLabel(statut),
      compteur: compteurs[statut],
    })),
  ];

  return (
    <nav aria-label="Filtrer par statut">
      <ul className="flex flex-wrap gap-2">
        {onglets.map((onglet) => {
          const actif = onglet.statut === statutActif;

          return (
            <li key={onglet.statut ?? 'tous'}>
              <Link
                href={onglet.statut ? `/?statut=${onglet.statut}` : '/'}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  actif
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {onglet.libelle}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    actif ? 'bg-primary-foreground/20' : 'bg-secondary',
                  )}
                >
                  {onglet.compteur}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
