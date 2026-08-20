import type { MissionStatus, TransportType } from '@prisma/client';
import { formatDateTime } from '@/lib/dates';
import { formaterLitres } from '@/lib/pdf/render';
import { estNumeroProvisoire } from '@/lib/mission/numero';
import { TRANSPORT_LABELS } from '@/lib/validations/mission';

export interface MissionRecapitulable {
  numero: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  analytique: string | null;
  objet: string;
  lieu: string;
  dateDepart: Date;
  dateRetour: Date;
  transportType: TransportType;
  transportDetail: string | null;
  litresGasoil: { toString(): string } | null;
  status: MissionStatus;
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-52 sm:shrink-0">
        {libelle}
      </dt>
      <dd className="text-sm">{valeur}</dd>
    </div>
  );
}

/**
 * Récapitulatif d'un ordre de mission, dans l'ordre exact du formulaire papier.
 * Utilisé par le détail, les pages de validation et de refus.
 */
export function RecapitulatifMission({ mission }: { mission: MissionRecapitulable }) {
  const litres = formaterLitres(mission.litresGasoil);

  return (
    <dl className="divide-y divide-border">
      <Ligne
        libelle="Numéro"
        valeur={estNumeroProvisoire(mission.numero) ? 'Brouillon (non numéroté)' : mission.numero}
      />
      <Ligne libelle="Nom" valeur={mission.nom} />
      <Ligne libelle="Prénoms" valeur={mission.prenoms} />
      <Ligne libelle="Matricule" valeur={mission.matricule} />
      <Ligne libelle="Fonction" valeur={mission.fonction} />
      {mission.analytique ? <Ligne libelle="Analytique" valeur={mission.analytique} /> : null}
      <Ligne libelle="Objet de la mission" valeur={mission.objet} />
      <Ligne libelle="Lieu de la mission" valeur={mission.lieu} />
      <Ligne libelle="Date de départ" valeur={formatDateTime(mission.dateDepart)} />
      <Ligne libelle="Date de retour" valeur={formatDateTime(mission.dateRetour)} />
      <Ligne libelle="Moyen de transport" valeur={TRANSPORT_LABELS[mission.transportType]} />
      {mission.transportDetail ? (
        <Ligne libelle="Détail du transport" valeur={mission.transportDetail} />
      ) : null}
      <Ligne
        libelle="Carburant"
        valeur={litres ? `${litres} litres de gasoil` : 'Sans dotation de gasoil'}
      />
    </dl>
  );
}
