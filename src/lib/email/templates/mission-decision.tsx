import { Button, Section, Text } from '@react-email/components';
import { COULEURS, EmailLayout, texteStyles } from './layout';
import { Recapitulatif, type LigneRecapitulatif } from './recapitulatif';

export interface MissionDecisionProps {
  numero: string;
  prenoms: string;
  approuve: boolean;
  objet: string;
  lieu: string;
  lignes: LigneRecapitulatif[];
  /** Renseigné uniquement en cas de refus. */
  motifRefus?: string | null;
  decideParNom: string | null;
  decideLe: string;
  urlMission: string;
  nomPieceJointe?: string;
}

const encadreRefus = {
  backgroundColor: '#FDF2F2',
  border: `1px solid ${COULEURS.rouge}33`,
  borderLeft: `4px solid ${COULEURS.rouge}`,
  borderRadius: '6px',
  margin: '0 0 20px',
  padding: '14px 16px',
};

/** Notification adressée au demandeur après décision des Ressources Humaines. */
export function MissionDecisionEmail(props: MissionDecisionProps) {
  const etat = props.approuve ? 'validé' : 'refusé';

  return (
    <EmailLayout preview={`Ordre de mission ${props.numero} — ${etat}`}>
      <Text style={texteStyles.titre}>
        Votre ordre de mission a été {etat}
      </Text>

      <Text style={texteStyles.paragraphe}>
        Bonjour {props.prenoms},<br />
        Votre ordre de mission <strong>{props.numero}</strong> ({props.objet} — {props.lieu}) a été{' '}
        <strong>{etat}</strong> par les Ressources Humaines le {props.decideLe}
        {props.decideParNom ? ` (${props.decideParNom})` : ''}.
      </Text>

      {!props.approuve && props.motifRefus ? (
        <Section style={encadreRefus}>
          <Text
            style={{
              color: COULEURS.rouge,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              margin: '0 0 6px',
              textTransform: 'uppercase',
            }}
          >
            Motif du refus
          </Text>
          <Text style={{ color: COULEURS.texte, fontSize: '14px', lineHeight: '21px', margin: 0 }}>
            {props.motifRefus}
          </Text>
        </Section>
      ) : null}

      {props.approuve ? (
        <Text style={texteStyles.paragraphe}>
          L&apos;ordre de mission validé est joint à ce message
          {props.nomPieceJointe ? ` (${props.nomPieceJointe})` : ''}. Présentez-le au poste de garde
          lors de votre départ.
        </Text>
      ) : (
        <Text style={texteStyles.paragraphe}>
          Vous pouvez créer un nouvel ordre de mission tenant compte de ce motif.
        </Text>
      )}

      <Recapitulatif lignes={props.lignes} />

      <Section style={{ margin: '0 0 18px' }}>
        <Button
          href={props.urlMission}
          style={{
            backgroundColor: COULEURS.marine,
            borderRadius: '6px',
            color: '#FFFFFF',
            display: 'inline-block',
            fontSize: '15px',
            fontWeight: 600,
            padding: '13px 26px',
            textDecoration: 'none',
          }}
        >
          Consulter mon ordre de mission
        </Button>
      </Section>
    </EmailLayout>
  );
}

export default MissionDecisionEmail;
