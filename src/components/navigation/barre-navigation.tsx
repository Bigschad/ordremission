import Link from 'next/link';
import { LogOut, Shield, Users } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { LogoPorteo } from '@/components/marque/logo';
import { Button } from '@/components/ui/button';
import { estAdmin, estRH, type UtilisateurCourant } from '@/lib/session';
import { LiensNavigation } from './liens-navigation';

/**
 * Barre de navigation. Les liens RH et Administration ne sont affichés qu'aux
 * rôles concernés — mais leur accès reste contrôlé côté serveur dans chaque
 * page : masquer un lien n'est jamais une mesure de sécurité.
 */
export function BarreNavigation({ utilisateur }: { utilisateur: UtilisateurCourant }) {
  const liens = [
    { href: '/', libelle: 'Mes ordres de mission', icone: null },
    ...(estRH(utilisateur)
      ? [{ href: '/rh', libelle: 'File Ressources Humaines', icone: <Users className="size-4" /> }]
      : []),
    ...(estAdmin(utilisateur)
      ? [
          {
            href: '/admin/utilisateurs',
            libelle: 'Collaborateurs',
            icone: <Shield className="size-4" />,
          },
        ]
      : []),
  ];

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="Accueil">
          <LogoPorteo />
        </Link>

        <LiensNavigation liens={liens} />

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">
              {utilisateur.prenoms} {utilisateur.nom}
            </p>
            <p className="text-xs text-muted-foreground">
              Matricule {utilisateur.matricule}
            </p>
          </div>

          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <Button type="submit" variant="ghost" size="sm" title="Se déconnecter">
              <LogOut aria-hidden />
              <span className="sr-only sm:not-sr-only">Quitter</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
