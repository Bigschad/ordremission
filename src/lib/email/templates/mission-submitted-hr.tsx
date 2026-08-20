import { Button, Column, Hr, Row, Section, Text } from '@react-email/components';
import { COULEURS, EmailLayout, texteStyles } from './layout';
import { Recapitulatif, type LigneRecapitulatif } from './recapitulatif';

export interface MissionSubmittedHrProps {
  numero: string;
  prenoms: string;
  nom: string;
  lieu: string;
  objet: string;
  lignes: LigneRecapitulatif[];
  /** URL absolue de la page de validation (`/approve/{token}`). */
  urlValider: string;
  /** URL absolue de la page de refus (`/reject/{token}`). */
  urlRefuser: string;
  /** Durée de validité des liens, en jours. */
  validiteJours: number;
  nomPieceJointe: string;
  /** Vrai lorsqu'il s'agit d'une relance du demandeur. */
  relance?: boolean;
}

const bouton = {
  borderRadius: '6px',
  color: '#FFFFFF',
  display: 'block',
  fontSize: '15px',
  fontWeight: 700,
  padding: '13px 10px',
  textAlign: 'center' as const,
  textDecoration: 'none',
};

/** Notification adressée aux Ressources Humaines à la soumission d'un ordre. */
export function MissionSubmittedHrEmail(props: MissionSubmittedHrProps) {
  return (
    <EmailLayout
      preview={`${props.prenoms} ${props.nom} — ${props.objet} à ${props.lieu} (${props.numero})`}
    >
      <Text style={texteStyles.titre}>
        {props.relance ? 'Rappel — ordre de mission en attente' : 'Nouvel ordre de mission à valider'}
      </Text>

      <Text style={texteStyles.paragraphe}>
        <strong>
          {props.prenoms} {props.nom}
        </strong>{' '}
        a soumis un ordre de mission portant le numéro <strong>{props.numero}</strong>. Le document
        complet est joint à ce message au format PDF ({props.nomPieceJointe}).
      </Text>

      <Recapitulatif lignes={props.lignes} />

      <Section style={{ margin: '4px 0 18px' }}>
        <Row>
          <Column style={{ paddingRight: '6px', width: '50%' }}>
            <Button href={props.urlValider} style={{ ...bouton, backgroundColor: COULEURS.vert }}>
              ✓ Valider
            </Button>
          </Column>
          <Column style={{ paddingLeft: '6px', width: '50%' }}>
            <Button href={props.urlRefuser} style={{ ...bouton, backgroundColor: COULEURS.rouge }}>
              ✗ Refuser
            </Button>
          </Column>
        </Row>
      </Section>

      <Text style={texteStyles.discret}>
        Ces liens sont valables {props.validiteJours} jours et ne peuvent servir qu&apos;une seule
        fois. Dès qu&apos;une décision est prise, les deux liens deviennent sans effet.
      </Text>
      <Text style={texteStyles.discret}>
        Un refus nécessite obligatoirement la saisie d&apos;un motif, qui sera communiqué au
        collaborateur.
      </Text>

      <Hr style={{ borderColor: COULEURS.bordure, margin: '16px 0 10px' }} />

      <Text style={{ ...texteStyles.discret, wordBreak: 'break-all' }}>
        Les boutons ne fonctionnent pas ? Ouvrez l&apos;une de ces adresses dans votre navigateur :
        <br />
        Valider : {props.urlValider}
        <br />
        Refuser : {props.urlRefuser}
      </Text>
    </EmailLayout>
  );
}

export default MissionSubmittedHrEmail;
