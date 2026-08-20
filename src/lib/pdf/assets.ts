import { promises as fs } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

/**
 * Ressources graphiques du PDF.
 * Toutes sont résolues côté serveur et mises en cache pour la durée de vie du
 * processus : le rendu ne fait jamais d'appel réseau.
 */

const CHEMIN_LOGO = path.join(process.cwd(), 'public', 'porteo-logo.png');

let logoCache: string | null | undefined;

/**
 * Logo officiel, encodé en data URI.
 * Renvoie `null` si `public/porteo-logo.png` n'a pas été déposé : le PDF
 * bascule alors sur un bloc typographique de remplacement.
 */
export async function chargerLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;

  try {
    const fichier = await fs.readFile(CHEMIN_LOGO);
    logoCache = `data:image/png;base64,${fichier.toString('base64')}`;
  } catch {
    logoCache = null;
  }

  return logoCache;
}

/** QR code de vérification d'authenticité, en PNG data URI. */
export async function genererQrCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    scale: 6,
    color: { dark: '#1B2A4AFF', light: '#FFFFFFFF' },
  });
}
