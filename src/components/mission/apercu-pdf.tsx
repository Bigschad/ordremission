'use client';

import { FileText, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface ValeursApercu {
  analytique?: string;
  objet?: string;
  lieu?: string;
  dateDepart?: string;
  dateRetour?: string;
  transportType?: string;
  transportDetail?: string;
  litresGasoil?: string;
}

/** Délai d'inactivité avant de régénérer l'aperçu. */
const DELAI_DEBOUNCE_MS = 900;

/**
 * Aperçu du PDF pendant la saisie.
 *
 * Le rendu est demandé au serveur, qui utilise le composant du PDF définitif :
 * ce que le collaborateur voit est exactement ce que recevront les Ressources
 * Humaines. Les appels sont temporisés et le précédent est annulé, pour ne pas
 * multiplier les invocations de fonction.
 */
export function ApercuPdf({ valeurs }: { valeurs: ValeursApercu }) {
  const [urlObjet, setUrlObjet] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const urlPrecedente = useRef<string | null>(null);

  // `signature` évite de relancer un rendu quand rien n'a changé.
  const signature = JSON.stringify(valeurs);

  useEffect(() => {
    const controleur = new AbortController();
    let annule = false;

    const minuteur = setTimeout(async () => {
      setEnCours(true);
      setErreur(null);

      try {
        const donnees = new FormData();
        for (const [clef, valeur] of Object.entries(
          JSON.parse(signature) as Record<string, string | undefined>,
        )) {
          if (valeur !== undefined && valeur !== null) donnees.set(clef, String(valeur));
        }

        const reponse = await fetch('/api/missions/apercu-pdf', {
          method: 'POST',
          body: donnees,
          signal: controleur.signal,
        });

        if (!reponse.ok) throw new Error("L'aperçu n'a pas pu être généré.");

        const blob = await reponse.blob();
        if (annule) return;

        const nouvelleUrl = URL.createObjectURL(blob);
        if (urlPrecedente.current) URL.revokeObjectURL(urlPrecedente.current);
        urlPrecedente.current = nouvelleUrl;
        setUrlObjet(nouvelleUrl);
      } catch (error) {
        if (!annule && !(error instanceof DOMException && error.name === 'AbortError')) {
          setErreur("L'aperçu n'a pas pu être généré. La saisie reste enregistrable.");
        }
      } finally {
        if (!annule) setEnCours(false);
      }
    }, DELAI_DEBOUNCE_MS);

    return () => {
      annule = true;
      controleur.abort();
      clearTimeout(minuteur);
    };
  }, [signature]);

  // Libération de la dernière URL au démontage.
  useEffect(
    () => () => {
      if (urlPrecedente.current) URL.revokeObjectURL(urlPrecedente.current);
    },
    [],
  );

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="bg-secondary/50 flex items-center gap-2 border-b px-4 py-2.5">
        <FileText className="text-primary size-4" aria-hidden />
        <span className="text-sm font-medium">Aperçu du document</span>
        {enCours ? (
          <LoaderCircle className="text-muted-foreground ml-auto size-4 animate-spin" aria-hidden />
        ) : null}
        <span className="sr-only" role="status">
          {enCours ? 'Génération de l’aperçu en cours' : 'Aperçu à jour'}
        </span>
      </div>

      <div className="bg-muted relative flex-grow">
        {urlObjet ? (
          <iframe
            src={`${urlObjet}#toolbar=0&navpanes=0&view=FitH`}
            title="Aperçu de l'ordre de mission"
            className="h-full w-full"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
            {erreur ?? 'Génération de l’aperçu…'}
          </div>
        )}
      </div>

      {erreur && urlObjet ? (
        <p className="bg-destructive/5 text-destructive border-t px-4 py-2 text-xs">{erreur}</p>
      ) : null}
    </div>
  );
}
