import { NextResponse } from 'next/server';
import { construireCsv, nomFichierCsv } from '@/lib/mission/csv';
import { analyserParamsRH, type ParamsRH } from '@/lib/mission/filtres-url';
import { listerPourExport } from '@/lib/mission/queries';
import { estRH, getUtilisateurCourant } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export CSV de la file d'attente, avec les mêmes filtres que l'écran.
 * Réservé aux Ressources Humaines et aux administrateurs (règle 9).
 */
export async function GET(requete: Request): Promise<NextResponse> {
  const utilisateur = await getUtilisateurCourant();

  if (!utilisateur || !estRH(utilisateur)) {
    return NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 });
  }

  const url = new URL(requete.url);
  const params: ParamsRH = Object.fromEntries(url.searchParams.entries());

  const missions = await listerPourExport(analyserParamsRH(params));
  const csv = construireCsv(missions);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomFichierCsv()}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
