import { exigerUtilisateur } from '@/lib/session';
import { BarreNavigation } from '@/components/navigation/barre-navigation';

/**
 * Enveloppe des écrans authentifiés.
 * `exigerUtilisateur` relit le profil en base : un compte désactivé perd
 * immédiatement l'accès, sans attendre l'expiration de sa session.
 */
export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const utilisateur = await exigerUtilisateur();

  return (
    <div className="bg-secondary/30 flex min-h-dvh flex-col">
      <BarreNavigation utilisateur={utilisateur} />
      <div className="mx-auto w-full max-w-6xl flex-grow px-4 py-6 sm:py-8">{children}</div>
      <footer className="bg-background text-muted-foreground border-t py-5 text-center text-xs">
        PORTEO GROUP — Abidjan-Marcory, Immeuble Porteo, Boulevard Valery Giscard d&apos;Estaing
      </footer>
    </div>
  );
}
