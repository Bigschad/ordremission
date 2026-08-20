'use client';

import { MissionStatus } from '@prisma/client';
import { CircleX, LoaderCircle, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { annulerMission, renvoyerAuxRH, supprimerBrouillon } from '@/actions/missions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  missionId: string;
  statut: MissionStatus;
  annulable: boolean;
  supprimable: boolean;
  relances: number;
  relancesMax: number;
}

type ActionEnCours = 'annuler' | 'supprimer' | null;

/**
 * Actions du demandeur sur son ordre de mission.
 * Les actions irréversibles passent par une confirmation explicite.
 */
export function ActionsMission({
  missionId,
  statut,
  annulable,
  supprimable,
  relances,
  relancesMax,
}: Props) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [confirmation, setConfirmation] = useState<ActionEnCours>(null);

  const relancesEpuisees = relances >= relancesMax;

  function confirmer(): void {
    const action = confirmation;
    if (!action) return;

    demarrer(async () => {
      const resultat =
        action === 'annuler' ? await annulerMission(missionId) : await supprimerBrouillon(missionId);

      setConfirmation(null);

      if (!resultat.ok) {
        toast.error(resultat.erreur);
        return;
      }

      toast.success(resultat.message ?? 'Opération effectuée.');
      routeur.push('/');
      routeur.refresh();
    });
  }

  function renvoyer(): void {
    demarrer(async () => {
      const resultat = await renvoyerAuxRH(missionId);

      if (!resultat.ok) {
        toast.error(resultat.erreur);
        return;
      }

      toast.success(resultat.message ?? 'Ordre de mission renvoyé.');
      routeur.refresh();
    });
  }

  return (
    <>
      {statut === MissionStatus.SUBMITTED ? (
        <Button
          variant="outline"
          onClick={renvoyer}
          disabled={enCours || relancesEpuisees}
          title={
            relancesEpuisees
              ? `Limite de ${relancesMax} renvois atteinte`
              : 'Renvoyer la demande aux Ressources Humaines'
          }
        >
          {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Renvoyer aux RH
          <span className="text-xs text-muted-foreground">
            ({relances}/{relancesMax})
          </span>
        </Button>
      ) : null}

      {annulable ? (
        <Button variant="outline" onClick={() => setConfirmation('annuler')} disabled={enCours}>
          <CircleX aria-hidden />
          Annuler la demande
        </Button>
      ) : null}

      {supprimable ? (
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmation('supprimer')}
          disabled={enCours}
        >
          <Trash2 aria-hidden />
          Supprimer le brouillon
        </Button>
      ) : null}

      <Dialog open={confirmation !== null} onOpenChange={(ouvert) => !ouvert && setConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation === 'annuler'
                ? "Annuler cet ordre de mission ?"
                : 'Supprimer ce brouillon ?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation === 'annuler'
                ? "L'annulation est définitive. Les liens de décision déjà envoyés aux Ressources Humaines deviendront sans effet."
                : 'Le brouillon sera définitivement supprimé. Cette action est irréversible.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)} disabled={enCours}>
              Revenir en arrière
            </Button>
            <Button variant="destructive" onClick={confirmer} disabled={enCours}>
              {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {confirmation === 'annuler' ? "Oui, annuler" : 'Oui, supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
