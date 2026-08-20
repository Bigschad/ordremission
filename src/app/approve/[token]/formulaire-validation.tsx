'use client';

import { Check, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { validerViaToken } from '@/actions/decisions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface Props {
  token: string;
  numero: string;
}

export function FormulaireValidation({ token, numero }: Props) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [valide, setValide] = useState(false);

  function confirmer() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await validerViaToken(token);
      if (resultat.ok) {
        setValide(true);
      } else {
        setErreur(resultat.erreur);
      }
    });
  }

  if (valide) {
    return (
      <Alert variant="success">
        <CircleCheck aria-hidden />
        <AlertTitle>Ordre de mission {numero} validé</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Le collaborateur vient d&apos;être informé par e-mail et reçoit son ordre de mission
            validé au format PDF.
          </p>
          <p className="text-xs">
            Ce lien est désormais sans effet : il ne peut plus servir à modifier cette décision.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {erreur ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Validation impossible</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="success"
          size="lg"
          className="flex-1"
          onClick={confirmer}
          disabled={enCours}
        >
          {enCours ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Validation en cours…
            </>
          ) : (
            <>
              <Check aria-hidden />
              Confirmer la validation
            </>
          )}
        </Button>

        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link href={`/verify/${encodeURIComponent(numero)}`}>Consulter sans décider</Link>
        </Button>
      </div>
    </div>
  );
}
