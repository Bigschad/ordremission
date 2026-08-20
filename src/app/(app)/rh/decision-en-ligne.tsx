'use client';

import { Check, LoaderCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { refuserDepuisFile, validerDepuisFile } from '@/actions/decisions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MOTIF_REFUS_MIN } from '@/lib/validations/mission';

interface Props {
  missionId: string;
  numero: string;
}

/**
 * Actions Valider / Refuser directement dans la file d'attente.
 * L'autorisation est revérifiée côté serveur dans les Server Actions : ces
 * boutons ne font que déclencher l'appel.
 */
export function DecisionEnLigne({ missionId, numero }: Props) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  function valider(): void {
    demarrer(async () => {
      const resultat = await validerDepuisFile(missionId);

      if (!resultat.ok) {
        toast.error(resultat.erreur);
        return;
      }

      toast.success(`Ordre de mission ${numero} validé. Le collaborateur en est informé.`);
      routeur.refresh();
    });
  }

  function refuser(): void {
    setErreur(null);
    demarrer(async () => {
      const resultat = await refuserDepuisFile(missionId, motif);

      if (!resultat.ok) {
        setErreur(resultat.erreur);
        return;
      }

      setRefusOuvert(false);
      setMotif('');
      toast.success(`Ordre de mission ${numero} refusé. Le collaborateur en est informé.`);
      routeur.refresh();
    });
  }

  const restants = MOTIF_REFUS_MIN - motif.trim().length;

  return (
    <div className="flex justify-end gap-1.5">
      <Button
        variant="success"
        size="sm"
        onClick={valider}
        disabled={enCours}
        title={`Valider ${numero}`}
      >
        {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
        <span className="sr-only lg:not-sr-only">Valider</span>
      </Button>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => setRefusOuvert(true)}
        disabled={enCours}
        title={`Refuser ${numero}`}
      >
        <X aria-hidden />
        <span className="sr-only lg:not-sr-only">Refuser</span>
      </Button>

      <Dialog open={refusOuvert} onOpenChange={setRefusOuvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser l&apos;ordre de mission {numero}</DialogTitle>
            <DialogDescription>
              Le motif est obligatoire : il sera communiqué au collaborateur par e-mail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`motif-${missionId}`}>Motif du refus</Label>
            <Textarea
              id={`motif-${missionId}`}
              rows={4}
              value={motif}
              onChange={(evenement) => setMotif(evenement.target.value)}
              aria-invalid={Boolean(erreur)}
            />
            <p className="text-muted-foreground text-xs">
              {restants > 0
                ? `Encore ${restants} caractère${restants > 1 ? 's' : ''} (minimum ${MOTIF_REFUS_MIN}).`
                : 'Motif suffisamment détaillé.'}
            </p>
            {erreur ? (
              <p role="alert" className="text-destructive text-xs font-medium">
                {erreur}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusOuvert(false)} disabled={enCours}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={refuser} disabled={enCours}>
              {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
