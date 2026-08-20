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
    <main className="bg-secondary/40 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoPorteo className="items-center" />
          <h1 className="text-primary text-2xl font-bold tracking-tight">Ordres de mission</h1>
          <p className="text-muted-foreground text-sm">
            Dématérialisation des ordres de mission en Côte d&apos;Ivoire
          </p>
        </div>

        <FormulaireConnexion suite={suite ?? '/'} />

        <p className="text-muted-foreground mt-8 text-center text-xs">
          PORTEO GROUP — Abidjan-Marcory, Immeuble Porteo
          <br />
          Boulevard Valery Giscard d&apos;Estaing, 08 BP 2212 Abidjan 09
        </p>
      </div>
    </main>
  );
}
