import { cn } from '@/lib/utils';

/**
 * Bloc de marque PORTEO GROUP.
 * Le logo officiel (`public/porteo-logo.png`) est optionnel : à défaut,
 * ce composant typographique fait office de repli.
 */
export function LogoPorteo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex flex-col leading-none', className)}>
      <span className="text-primary text-lg font-bold tracking-[0.18em]">PORTEO</span>
      <span className="text-accent text-[0.6rem] font-semibold tracking-[0.34em]">GROUP</span>
    </span>
  );
}
