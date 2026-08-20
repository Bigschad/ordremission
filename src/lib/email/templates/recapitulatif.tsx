import { Row, Column, Section, Text } from '@react-email/components';
import { COULEURS } from './layout';

export interface LigneRecapitulatif {
  libelle: string;
  valeur: string;
}

const styles = {
  section: {
    border: `1px solid ${COULEURS.bordure}`,
    borderRadius: '6px',
    margin: '0 0 20px',
    padding: '4px 14px',
  },
  ligne: { borderBottom: `1px solid ${COULEURS.bordure}` },
  libelle: {
    color: COULEURS.texteDoux,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    margin: '9px 0',
    textTransform: 'uppercase' as const,
    verticalAlign: 'top' as const,
    width: '42%',
  },
  valeur: {
    color: COULEURS.texte,
    fontSize: '13px',
    margin: '9px 0',
    verticalAlign: 'top' as const,
  },
};

/** Tableau récapitulatif des champs d'un ordre de mission. */
export function Recapitulatif({ lignes }: { lignes: LigneRecapitulatif[] }) {
  return (
    <Section style={styles.section}>
      {lignes.map((ligne, index) => (
        <Row key={ligne.libelle} style={index < lignes.length - 1 ? styles.ligne : undefined}>
          <Column style={styles.libelle}>
            <Text style={styles.libelle}>{ligne.libelle}</Text>
          </Column>
          <Column style={styles.valeur}>
            <Text style={styles.valeur}>{ligne.valeur}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}
