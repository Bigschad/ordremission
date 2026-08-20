import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { construireQuery, type ParamsRH } from '@/lib/mission/filtres-url';

interface Props {
  params: ParamsRH;
  page: number;
  nbPages: number;
  total: number;
}

export function Pagination({ params, page, nbPages, total }: Props) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground">
        {total} ordre{total > 1 ? 's' : ''} de mission — page {page} sur {nbPages}
      </p>

      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          <Link
            href={`/rh${construireQuery(params, { page: String(Math.max(1, page - 1)) })}`}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
          >
            <ChevronLeft aria-hidden />
            Précédente
          </Link>
        </Button>

        <Button asChild variant="outline" size="sm">
          <Link
            href={`/rh${construireQuery(params, { page: String(Math.min(nbPages, page + 1)) })}`}
            aria-disabled={page >= nbPages}
            tabIndex={page >= nbPages ? -1 : undefined}
            className={page >= nbPages ? 'pointer-events-none opacity-50' : undefined}
          >
            Suivante
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
