/**
 * Prépare une configuration de démonstration prête à l'emploi.
 *
 *   pnpm demo
 *
 * Écrit un `.env` si aucun n'existe : base SQLite locale, secret aléatoire,
 * e-mails déposés dans `.mailbox/` plutôt qu'envoyés. Aucun compte Neon ni
 * Resend n'est nécessaire.
 *
 * Dans un Codespace GitHub, l'URL publique du port transféré est détectée
 * automatiquement : les liens des e-mails et le QR code du PDF pointent alors
 * vers la bonne adresse.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ENV = path.join(process.cwd(), '.env');
const PORT = process.env.PORT ?? '3000';

/** URL publique de l'application, selon l'environnement d'exécution. */
function urlApplication(): string {
  const codespace = process.env.CODESPACE_NAME;
  const domaine = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

  if (codespace && domaine) {
    return `https://${codespace}-${PORT}.${domaine}`;
  }

  return `http://localhost:${PORT}`;
}

function creerEnv(url: string): void {
  const contenu = [
    '# Configuration de démonstration — générée par `pnpm demo`.',
    '# Aucune infrastructure requise : base SQLite locale, e-mails sur disque.',
    '',
    '# Base SQLite. Pour PostgreSQL/Neon, remplacez par la chaîne « pooled »',
    '# et ajoutez DIRECT_URL, puis lancez `pnpm db:generate && pnpm db:deploy`.',
    'DATABASE_URL="file:./demo.db"',
    '',
    `AUTH_SECRET="${randomBytes(32).toString('base64')}"`,
    `AUTH_URL="${url}"`,
    'AUTH_TRUST_HOST="true"',
    `APP_URL="${url}"`,
    '',
    '# Les e-mails sont écrits dans .mailbox/ au lieu d’être envoyés.',
    '# `pnpm lien` en extrait les liens. Ne jamais utiliser en production.',
    'EMAIL_TRANSPORT="file"',
    'HR_EMAIL="rh@porteo-group.com"',
    '',
    'NEXT_PUBLIC_APP_NAME="Ordres de mission — PORTEO GROUP"',
    '',
  ].join('\n');

  writeFileSync(ENV, contenu, 'utf8');
  console.log('✓ .env de démonstration créé.');
}

/** Met à jour les URL d'un .env de démonstration existant (nom de Codespace variable). */
function actualiserUrls(url: string): void {
  const contenu = readFileSync(ENV, 'utf8');

  if (!contenu.includes('généré par `pnpm demo`')) {
    console.log('→ .env existant conservé (il n’a pas été généré par `pnpm demo`).');
    return;
  }

  const misAJour = contenu
    .replace(/^AUTH_URL=.*$/m, `AUTH_URL="${url}"`)
    .replace(/^APP_URL=.*$/m, `APP_URL="${url}"`);

  if (misAJour !== contenu) {
    writeFileSync(ENV, misAJour, 'utf8');
    console.log('✓ URL de démonstration actualisées.');
  }
}

function main(): void {
  const url = urlApplication();

  if (existsSync(ENV)) {
    actualiserUrls(url);
  } else {
    creerEnv(url);
  }

  console.log('');
  console.log(`  Application     ${url}`);
  console.log('');
  console.log('  Comptes de démonstration');
  console.log('    schadrach.yeye@porteo-group.com   collaborateur (matricule 4071)');
  console.log('    rh@porteo-group.com               Ressources Humaines');
  console.log('    admin@porteo-group.com            administrateur');
  console.log('');
  console.log('  Aucun mot de passe : saisissez l’adresse sur l’écran de connexion,');
  console.log('  puis récupérez le lien reçu avec `pnpm lien connexion`.');
  console.log('');
}

main();
