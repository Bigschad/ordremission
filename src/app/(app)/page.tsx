import { MissionStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Plus } from 'lucide-react';
import { CarteMission } from '@/components/mission/carte-mission';
import { EtatVide } from '@/components/mission/etat-vide';
import { SqueletteListeMissions } from '@/components/mission/squelette-liste';
import { Button } from '@/components/ui/button';
import { compterParStatut, listerMesMissions } from '@/lib/mission/queries';
import { statusLabel } from '@/lib/mission/status';
import { exigerUtilisateur } from '@/lib/session';
import { FiltresStatut } from './filtres-statut';

export const metadata: Metadata = { title: 'Mes ordres de mission' };

function estStatut(valeur: string | undefined): valeur is MissionStatus {
  return valeur !== undefined && Object.values(MissionStatus).includes(valeur as MissionStatus);
}

async function ListeMissions({ statut }: { statut?: MissionStatus }) {
  const utilisateur = await exigerUtilisateur();
  const missions = await listerMesMissions(utilisateur, statut ? { status: statut } : {});

  if (missions.length === 0) {
    return (
      <EtatVide
        titre={
          statut
            ? `Aucun ordre de mission « ${statusLabel(statut).toLowerCase()} »`
            : "Vous n'avez pas encore d'ordre de mission"
        }
        description={
          statut
            ? 'Changez de filtre pour afficher vos autres ordres de mission.'
            : 'Créez votre premier ordre de mission : la saisie prend moins de deux minutes, et les Ressources Humaines le reçoivent immédiatement par e-mail.'
        }
        action={
          statut ? undefined : (
            <Button asChild className="mt-2">
              <Link href="/missions/nouveau">
                <Plus aria-hidden />
                Nouvel ordre de mission
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {missions.map((mission) => (
        <li key={mission.id}>
          <CarteMission mission={mission} />
        </li>
      ))}
    </ul>
  );
}

/** Tableau de bord du collaborateur : ses ordres de mission, filtrés par statut. */
export default async function PageTableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { statut: statutBrut } = await searchParams;
  const statut = estStatut(statutBrut) ? statutBrut : undefined;

  const compteurs = await compterParStatut({ demandeurId: utilisateur.id });
  const total = Object.values(compteurs).reduce((somme, valeur) => somme + valeur, 0);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes ordres de mission</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bonjour {utilisateur.prenoms}, vous avez {total} ordre{total > 1 ? 's' : ''} de mission.
          </p>
        </div>

        <Button asChild size="lg">
          <Link href="/missions/nouveau">
            <Plus aria-hidden />
            Nouvel ordre de mission
          </Link>
        </Button>
      </div>

      <FiltresStatut compteurs={compteurs} total={total} statutActif={statut} />

      <Suspense key={statut ?? 'tous'} fallback={<SqueletteListeMissions />}>
        <ListeMissions statut={statut} />
      </Suspense>
    </main>
  );
}
