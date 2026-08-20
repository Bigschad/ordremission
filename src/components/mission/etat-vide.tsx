import type { ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';

/** État vide explicite : jamais une liste blanche sans explication. */
export function EtatVide({
  titre,
  description,
  action,
}: {
  titre: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-background flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
      <FileQuestion className="text-muted-foreground size-9" aria-hidden />
      <h3 className="font-semibold">{titre}</h3>
      <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      {action}
    </div>
  );
}
