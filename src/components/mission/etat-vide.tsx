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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background px-6 py-14 text-center">
      <FileQuestion className="size-9 text-muted-foreground" aria-hidden />
      <h3 className="font-semibold">{titre}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
