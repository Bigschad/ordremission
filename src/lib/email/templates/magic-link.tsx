import { Button, Section, Text } from '@react-email/components';
import { COULEURS, EmailLayout, texteStyles } from './layout';

export interface MagicLinkEmailProps {
  url: string;
  /** Durée de validité du lien, en minutes. */
  dureeMinutes: number;
}

/** Lien de connexion Auth.js — aucun mot de passe dans l'application. */
export function MagicLinkEmail({ url, dureeMinutes }: MagicLinkEmailProps) {
  return (
    <EmailLayout preview="Votre lien de connexion aux ordres de mission Porteo">
      <Text style={texteStyles.titre}>Votre lien de connexion</Text>

      <Text style={texteStyles.paragraphe}>
        Cliquez sur le bouton ci-dessous pour accéder à votre espace « Ordres de mission ». Aucun
        mot de passe n&apos;est nécessaire.
      </Text>

      <Section style={{ margin: '24px 0' }}>
        <Button
          href={url}
          style={{
            backgroundColor: COULEURS.marine,
            borderRadius: '6px',
            color: '#FFFFFF',
            display: 'inline-block',
            fontSize: '15px',
            fontWeight: 600,
            padding: '13px 28px',
            textDecoration: 'none',
          }}
        >
          Me connecter
        </Button>
      </Section>

      <Text style={texteStyles.discret}>
        Ce lien est valable {dureeMinutes} minutes et ne peut servir qu&apos;une seule fois.
      </Text>
      <Text style={texteStyles.discret}>
        Si vous n&apos;êtes pas à l&apos;origine de cette demande, ignorez simplement ce message :
        aucune connexion ne sera établie.
      </Text>
      <Text style={{ ...texteStyles.discret, wordBreak: 'break-all' }}>
        Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur :<br />
        {url}
      </Text>
    </EmailLayout>
  );
}

export default MagicLinkEmail;
