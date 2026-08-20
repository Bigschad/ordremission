'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LienNavigation {
  href: string;
  libelle: string;
  icone: ReactNode;
}

/** Liens principaux, avec mise en évidence de la section courante. */
export function LiensNavigation({ liens }: { liens: LienNavigation[] }) {
  const chemin = usePathname();

  return (
    <nav aria-label="Navigation principale" className="order-3 w-full sm:order-none sm:w-auto">
      <ul className="flex flex-wrap items-center gap-1">
        {liens.map((lien) => {
          const actif = lien.href === '/' ? chemin === '/' : chemin.startsWith(lien.href);

          return (
            <li key={lien.href}>
              <Link
                href={lien.href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  actif
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {lien.icone}
                {lien.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
