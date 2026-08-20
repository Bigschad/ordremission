import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { FormulaireMission } from '@/components/mission/formulaire-mission';
import { Button } from '@/components/ui/button';
import { toDatetimeLocalValue } from '@/lib/dates';
import { exigerUtilisateur } from '@/lib/session';

export const metadata: Metadata = { title: 'Nouvel ordre de mission' };

/** Valeurs par défaut : demain, de 8h à 17h — le cas le plus courant. */
function valeursParDefaut(): { depart: string; retour: string } {
  const demain = new Date();
  demain.setUTCDate(demain.getUTCDate() + 1);

  const depart = new Date(demain);
  depart.setUTCHours(8, 0, 0, 0);

  const retour = new Date(demain);
  retour.setUTCHours(17, 0, 0, 0);

  return { depart: toDatetimeLocalValue(depart), retour: toDatetimeLocalValue(retour) };
}

export default async function PageNouvelOrdre() {
  const utilisateur = await exigerUtilisateur();
  const defauts = valeursParDefaut();

  return (
    <main className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1">
          <Link href="/">
            <ChevronLeft aria-hidden />
            Mes ordres de mission
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nouvel ordre de mission</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Renseignez votre déplacement : les Ressources Humaines le recevront par e-mail, avec le
          document à valider en pièce jointe.
        </p>
      </div>

      <FormulaireMission
        identite={{
          nom: utilisateur.nom,
          prenoms: utilisateur.prenoms,
          matricule: utilisateur.matricule,
          fonction: utilisateur.fonction,
        }}
        valeursInitiales={{
          analytique: '',
          objet: '',
          lieu: '',
          dateDepart: defauts.depart,
          dateRetour: defauts.retour,
          transportDetail: '',
          litresGasoil: '',
        }}
      />
    </main>
  );
}
