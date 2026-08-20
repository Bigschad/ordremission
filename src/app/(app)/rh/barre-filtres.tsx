'use client';

import { MissionStatus } from '@prisma/client';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { construireQuery, type ParamsRH } from '@/lib/mission/filtres-url';
import { statusLabel } from '@/lib/mission/status';
import { cn } from '@/lib/utils';

interface Props {
  params: ParamsRH;
  demandeurs: { id: string; nom: string; prenoms: string }[];
  compteurs: Record<MissionStatus, number>;
}

const TRIS = [
  { valeur: 'recent', libelle: 'Plus récents' },
  { valeur: 'ancien', libelle: 'Plus anciens' },
  { valeur: 'depart', libelle: 'Date de départ' },
  { valeur: 'numero', libelle: 'Numéro' },
] as const;

/**
 * Filtres de la file d'attente.
 * L'état vit dans l'URL : une vue filtrée reste partageable et le bouton
 * « retour » du navigateur fonctionne comme attendu.
 */
export function BarreFiltres({ params, demandeurs, compteurs }: Props) {
  const routeur = useRouter();
  const total = Object.values(compteurs).reduce((somme, valeur) => somme + valeur, 0);

  function appliquer(remplacements: Partial<ParamsRH>): void {
    routeur.push(`/rh${construireQuery(params, { ...remplacements, page: undefined })}`);
  }

  function rechercher(donnees: FormData): void {
    appliquer({ q: String(donnees.get('q') ?? '') });
  }

  const filtresActifs = Boolean(
    params.statut || params.demandeur || params.lieu || params.q || params.du || params.au,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Onglets de statut */}
        <nav aria-label="Filtrer par statut">
          <ul className="flex flex-wrap gap-2">
            {[
              { statut: undefined, libelle: 'Tous', compteur: total },
              ...Object.values(MissionStatus).map((statut) => ({
                statut,
                libelle: statusLabel(statut),
                compteur: compteurs[statut],
              })),
            ].map((onglet) => {
              const actif = (onglet.statut ?? undefined) === (params.statut ?? undefined);

              return (
                <li key={onglet.statut ?? 'tous'}>
                  <Link
                    href={`/rh${construireQuery(params, { statut: onglet.statut, page: undefined })}`}
                    aria-current={actif ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      actif
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {onglet.libelle}
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs tabular-nums',
                        actif ? 'bg-primary-foreground/20' : 'bg-secondary',
                      )}
                    >
                      {onglet.compteur}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form action={rechercher} className="flex gap-2">
          <div className="relative flex-grow">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Label htmlFor="q" className="sr-only">
              Rechercher
            </Label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Numéro, nom, matricule, objet ou lieu…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="demandeur">Demandeur</Label>
            <select
              id="demandeur"
              defaultValue={params.demandeur ?? ''}
              onChange={(evenement) => appliquer({ demandeur: evenement.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Tous les demandeurs</option>
              {demandeurs.map((demandeur) => (
                <option key={demandeur.id} value={demandeur.id}>
                  {demandeur.prenoms} {demandeur.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lieu">Lieu</Label>
            <Input
              id="lieu"
              defaultValue={params.lieu ?? ''}
              placeholder="Assinie, Bouaké…"
              onBlur={(evenement) => {
                if (evenement.target.value !== (params.lieu ?? '')) {
                  appliquer({ lieu: evenement.target.value });
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="du">Départ du</Label>
              <Input
                id="du"
                type="date"
                defaultValue={params.du ?? ''}
                onChange={(evenement) => appliquer({ du: evenement.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="au">au</Label>
              <Input
                id="au"
                type="date"
                defaultValue={params.au ?? ''}
                onChange={(evenement) => appliquer({ au: evenement.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tri">Trier par</Label>
            <select
              id="tri"
              defaultValue={params.tri ?? 'recent'}
              onChange={(evenement) => appliquer({ tri: evenement.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TRIS.map((tri) => (
                <option key={tri.valeur} value={tri.valeur}>
                  {tri.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtresActifs ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/rh">
              <X aria-hidden />
              Réinitialiser les filtres
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
