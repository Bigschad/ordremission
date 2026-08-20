import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { FormulaireMission } from '@/components/mission/formulaire-mission';
import { Button } from '@/components/ui/button';
import { toDatetimeLocalValue } from '@/lib/dates';
import { trouverMission } from '@/lib/mission/queries';
import { estModifiable } from '@/lib/mission/status';
import { exigerUtilisateur } from '@/lib/session';

export const metadata: Metadata = { title: 'Modifier le brouillon' };

/** Modification d'un brouillon — règle 5 : seul le statut DRAFT est modifiable. */
export default async function PageModifierBrouillon({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { id } = await params;

  const mission = await trouverMission(utilisateur, id);
  if (!mission) notFound();

  // La modification est réservée au demandeur, et seulement en brouillon.
  if (mission.demandeurId !== utilisateur.id || !estModifiable(mission.status)) {
    redirect(`/missions/${mission.id}`);
  }

  return (
    <main className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-3">
          <Link href={`/missions/${mission.id}`}>
            <ChevronLeft aria-hidden />
            Retour au détail
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Modifier le brouillon</h1>
      </div>

      <FormulaireMission
        missionId={mission.id}
        identite={{
          nom: utilisateur.nom,
          prenoms: utilisateur.prenoms,
          matricule: utilisateur.matricule,
          fonction: utilisateur.fonction,
        }}
        valeursInitiales={{
          analytique: mission.analytique ?? '',
          objet: mission.objet,
          lieu: mission.lieu,
          dateDepart: toDatetimeLocalValue(mission.dateDepart),
          dateRetour: toDatetimeLocalValue(mission.dateRetour),
          transportType: mission.transportType,
          transportDetail: mission.transportDetail ?? '',
          litresGasoil: mission.litresGasoil ? String(mission.litresGasoil) : '',
        }}
      />
    </main>
  );
}
