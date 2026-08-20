'use client';

import { CircleX, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useState, useTransition } from 'react';
import { refuserViaToken } from '@/actions/decisions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MOTIF_REFUS_MIN } from '@/lib/validations/mission';

interface Props {
  token: string;
  numero: string;
}

export function FormulaireRefus({ token, numero }: Props) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [refuse, setRefuse] = useState(false);

  const restants = MOTIF_REFUS_MIN - motif.trim().length;

  function envoyer(donnees: FormData) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await refuserViaToken(token, donnees);
      if (resultat.ok) {
        setRefuse(true);
      } else {
        setErreur(resultat.erreur);
      }
    });
  }

  if (refuse) {
    return (
      <Alert variant="destructive">
        <CircleX aria-hidden />
        <AlertTitle>Ordre de mission {numero} refusé</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Le collaborateur vient d&apos;être informé par e-mail, motif du refus à l&apos;appui.</p>
          <p className="text-xs">
            Ce lien est désormais sans effet : il ne peut plus servir à modifier cette décision.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={envoyer} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="motif">
          Motif du refus <span aria-hidden>*</span>
        </Label>
        <Textarea
          id="motif"
          name="motif"
          required
          rows={4}
          value={motif}
          onChange={(evenement) => setMotif(evenement.target.value)}
          placeholder="Précisez la raison du refus : elle sera transmise au collaborateur."
          aria-invalid={Boolean(erreur)}
          aria-describedby="aide-motif"
        />
        <p id="aide-motif" className="text-xs text-muted-foreground">
          {restants > 0
            ? `Encore ${restants} caractère${restants > 1 ? 's' : ''} avant de pouvoir refuser (minimum ${MOTIF_REFUS_MIN}).`
            : `Motif suffisamment détaillé (minimum ${MOTIF_REFUS_MIN} caractères).`}
        </p>
      </div>

      {erreur ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Refus impossible</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={enCours}>
        {enCours ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden />
            Enregistrement du refus…
          </>
        ) : (
          <>
            <CircleX aria-hidden />
            Confirmer le refus
          </>
        )}
      </Button>
    </form>
  );
}
