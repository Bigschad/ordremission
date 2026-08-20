/**
 * Affiche les liens contenus dans le dernier e-mail écrit par le transport de
 * test (`EMAIL_TRANSPORT="file"`), qui dépose les messages dans `.mailbox/`.
 *
 *   pnpm lien              → dernier message reçu
 *   pnpm lien connexion    → dernier lien de connexion
 *   pnpm lien approve      → dernier lien de validation RH
 *   pnpm lien reject       → dernier lien de refus RH
 *
 * Évite d'avoir à ouvrir une vraie boîte mail pour tester en local.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Message {
  to: string[];
  subject: string;
  html: string;
  text: string | null;
  attachments: { filename: string }[];
  sentAt: string;
}

const MAILBOX = path.join(process.cwd(), '.mailbox');

const FILTRES: Record<string, RegExp> = {
  connexion: /\/api\/auth\/callback\/email\?[^\s"'<>]+/,
  approve: /\/approve\/[A-Za-z0-9_-]+/,
  reject: /\/reject\/[A-Za-z0-9_-]+/,
};

function lireMessages(): Message[] {
  let fichiers: string[];

  try {
    fichiers = readdirSync(MAILBOX)
      .filter((nom) => nom.endsWith('.json'))
      .sort();
  } catch {
    console.error(
      "Aucun message : le dossier .mailbox n'existe pas.\n" +
        'Vérifiez que EMAIL_TRANSPORT="file" figure dans votre .env, puis refaites une action qui déclenche un e-mail.',
    );
    process.exit(1);
  }

  return fichiers.map(
    (nom) => JSON.parse(readFileSync(path.join(MAILBOX, nom), 'utf8')) as Message,
  );
}

/** Les liens du corps HTML sont échappés : on les remet en forme. */
function nettoyer(lien: string): string {
  return lien.replace(/&amp;/g, '&');
}

function extraire(message: Message, motif: RegExp): string | null {
  // La version texte est prioritaire : elle ne contient aucune entité HTML.
  const source = `${message.text ?? ''}\n${message.html}`;
  const trouve = source.match(new RegExp(`https?://[^\\s"'<>]*${motif.source}`));
  return trouve ? nettoyer(trouve[0]) : null;
}

function main(): void {
  const messages = lireMessages();

  if (messages.length === 0) {
    console.error('Aucun message dans .mailbox.');
    process.exit(1);
  }

  const demande = process.argv[2];

  if (demande && demande in FILTRES) {
    const motif = FILTRES[demande] as RegExp;

    for (const message of [...messages].reverse()) {
      const lien = extraire(message, motif);
      if (lien) {
        console.log(lien);
        return;
      }
    }

    console.error(`Aucun lien « ${demande} » trouvé dans les ${messages.length} message(s).`);
    process.exit(1);
  }

  const dernier = messages[messages.length - 1] as Message;

  console.log(`À        : ${dernier.to.join(', ')}`);
  console.log(`Objet    : ${dernier.subject}`);
  if (dernier.attachments.length > 0) {
    console.log(`Pièces   : ${dernier.attachments.map((piece) => piece.filename).join(', ')}`);
  }
  console.log('Liens    :');

  let trouve = false;
  for (const [nom, motif] of Object.entries(FILTRES)) {
    const lien = extraire(dernier, motif);
    if (lien) {
      console.log(`  ${nom.padEnd(10)} ${lien}`);
      trouve = true;
    }
  }

  if (!trouve) console.log('  (aucun)');
}

main();
