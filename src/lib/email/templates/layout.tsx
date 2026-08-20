import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

export const COULEURS = {
  marine: '#1B2A4A',
  orange: '#E8A33D',
  fond: '#F4F5F7',
  texte: '#1F2937',
  texteDoux: '#6B7280',
  bordure: '#E5E7EB',
  vert: '#1E7A46',
  rouge: '#B91C1C',
} as const;

const styles = {
  body: {
    backgroundColor: COULEURS.fond,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    margin: '0 auto',
    maxWidth: '600px',
    overflow: 'hidden',
    width: '100%',
  },
  entete: {
    backgroundColor: COULEURS.marine,
    padding: '24px',
  },
  marque: {
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    margin: 0,
  },
  sousMarque: {
    color: COULEURS.orange,
    fontSize: '12px',
    letterSpacing: '0.12em',
    margin: '4px 0 0',
    textTransform: 'uppercase' as const,
  },
  contenu: { padding: '28px 24px' },
  piedDePage: { padding: '0 24px 24px' },
  mentions: {
    color: COULEURS.texteDoux,
    fontSize: '11px',
    lineHeight: '17px',
    margin: '4px 0 0',
  },
  bandeau: {
    backgroundColor: COULEURS.marine,
    color: '#FFFFFF',
    fontSize: '11px',
    letterSpacing: '0.1em',
    padding: '12px 24px',
    textAlign: 'center' as const,
  },
};

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

/** Gabarit commun aux e-mails, aux couleurs PORTEO GROUP. */
export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.entete}>
            <Text style={styles.marque}>PORTEO GROUP</Text>
            <Text style={styles.sousMarque}>Ordres de mission</Text>
          </Section>

          <Section style={styles.contenu}>{children}</Section>

          <Section style={styles.piedDePage}>
            <Hr style={{ borderColor: COULEURS.bordure, margin: '0 0 12px' }} />
            <Text style={styles.mentions}>
              PORTEO GROUP — Abidjan-Marcory, Immeuble Porteo, Boulevard Valery Giscard
              d&apos;Estaing, 08 BP 2212 Abidjan 09
            </Text>
            <Text style={styles.mentions}>contact@porteo-group.com — +225 27 21 54 03 03</Text>
            <Text style={styles.mentions}>Message automatique, merci de ne pas y répondre.</Text>
          </Section>

          <Section style={styles.bandeau}>WWW.PORTEO-GROUP.COM</Section>
        </Container>
      </Body>
    </Html>
  );
}

export const texteStyles = {
  titre: {
    color: COULEURS.marine,
    fontSize: '19px',
    fontWeight: 700,
    lineHeight: '26px',
    margin: '0 0 12px',
  },
  paragraphe: {
    color: COULEURS.texte,
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 14px',
  },
  discret: {
    color: COULEURS.texteDoux,
    fontSize: '12px',
    lineHeight: '19px',
    margin: '0 0 8px',
  },
};
