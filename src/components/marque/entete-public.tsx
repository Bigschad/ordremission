import { LogoPorteo } from '@/components/marque/logo';

/** En-tête des pages publiques (validation, refus, vérification). */
export function EntetePublic({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
  return (
    <header className="mb-8 flex flex-col items-center gap-3 text-center">
      <LogoPorteo className="items-center" />
      <h1 className="text-primary text-xl font-bold tracking-tight sm:text-2xl">{titre}</h1>
      {sousTitre ? <p className="text-muted-foreground text-sm">{sousTitre}</p> : null}
    </header>
  );
}

/** Mentions légales reprises du pied de page du formulaire papier. */
export function PiedPublic() {
  return (
    <footer className="text-muted-foreground mt-10 text-center text-xs leading-relaxed">
      <p>PORTEO GROUP — contact@porteo-group.com — +225 27 21 54 03 03</p>
      <p>
        ABIDJAN-MARCORY IMMEUBLE PORTEO, Boulevard Valery Giscard d&apos;Estaing ; 08 BP 2212
        Abidjan 09
      </p>
    </footer>
  );
}
