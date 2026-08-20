import type { Metadata } from 'next';
import { LogoPorteo } from '@/components/marque/logo';
import { FormulaireConnexion } from './formulaire-connexion';

export const metadata: Metadata = { title: 'Connexion' };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoPorteo className="items-center" />
          <h1 className="text-2xl font-bold tracking-tight text-primary">Ordres de mission</h1>
          <p className="text-sm text-muted-foreground">
            Dématérialisation des ordres de mission en Côte d&apos;Ivoire
          </p>
        </div>

        <FormulaireConnexion suite={suite ?? '/'} />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          PORTEO GROUP — Abidjan-Marcory, Immeuble Porteo
          <br />
          Boulevard Valery Giscard d&apos;Estaing, 08 BP 2212 Abidjan 09
        </p>
      </div>
    </main>
  );
}
