'use client';

import { Role } from '@prisma/client';
import { LoaderCircle, Pencil, Plus, Power, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  basculerActivation,
  creerUtilisateur,
  importerUtilisateursCsv,
  modifierUtilisateur,
} from '@/actions/utilisateurs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COLONNES_CSV, ROLE_LABELS } from '@/lib/validations/utilisateur';

export interface FicheUtilisateur {
  id: string;
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
  email: string;
  role: Role;
  actif: boolean;
}

const FICHE_VIDE: FicheUtilisateur = {
  id: '',
  nom: '',
  prenoms: '',
  matricule: '',
  fonction: '',
  email: '',
  role: Role.EMPLOYEE,
  actif: true,
};

/** Formulaire partagé par la création et la modification d'une fiche. */
function FormulaireUtilisateur({
  fiche,
  erreurs,
  desactiverRole,
}: {
  fiche: FicheUtilisateur;
  erreurs: Record<string, string>;
  desactiverRole: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(
        [
          { nom: 'nom', libelle: 'Nom', valeur: fiche.nom, type: 'text' },
          { nom: 'prenoms', libelle: 'Prénoms', valeur: fiche.prenoms, type: 'text' },
          { nom: 'matricule', libelle: 'Matricule', valeur: fiche.matricule, type: 'text' },
          { nom: 'email', libelle: 'Adresse e-mail', valeur: fiche.email, type: 'email' },
        ] as const
      ).map((champ) => (
        <div key={champ.nom} className="space-y-1.5">
          <Label htmlFor={`${champ.nom}-${fiche.id}`}>{champ.libelle}</Label>
          <Input
            id={`${champ.nom}-${fiche.id}`}
            name={champ.nom}
            type={champ.type}
            defaultValue={champ.valeur}
            required
            aria-invalid={Boolean(erreurs[champ.nom])}
          />
          {erreurs[champ.nom] ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {erreurs[champ.nom]}
            </p>
          ) : null}
        </div>
      ))}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`fonction-${fiche.id}`}>Fonction</Label>
        <Input
          id={`fonction-${fiche.id}`}
          name="fonction"
          defaultValue={fiche.fonction}
          required
          aria-invalid={Boolean(erreurs.fonction)}
        />
        {erreurs.fonction ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {erreurs.fonction}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`role-${fiche.id}`}>Rôle</Label>
        <select
          id={`role-${fiche.id}`}
          name="role"
          defaultValue={fiche.role}
          disabled={desactiverRole}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Object.values(Role).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        {desactiverRole ? (
          <p className="text-xs text-muted-foreground">
            Vous ne pouvez pas modifier votre propre rôle.
          </p>
        ) : null}
      </div>

      <div className="flex items-end pb-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="actif"
            defaultChecked={fiche.actif}
            disabled={desactiverRole}
            className="size-4 accent-[hsl(var(--primary))]"
          />
          Compte actif
        </label>
      </div>
    </div>
  );
}

/** Dialogue de création d'un collaborateur. */
export function DialogueCreation() {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function envoyer(donnees: FormData): void {
    setErreurs({});
    demarrer(async () => {
      const resultat = await creerUtilisateur(donnees);

      if (!resultat.ok) {
        setErreurs(resultat.erreursChamps ?? {});
        toast.error(resultat.erreur);
        return;
      }

      setOuvert(false);
      toast.success(resultat.message ?? 'Collaborateur enregistré.');
      routeur.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOuvert(true)}>
        <Plus aria-hidden />
        Nouveau collaborateur
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau collaborateur</DialogTitle>
            <DialogDescription>
              Le collaborateur pourra se connecter dès l&apos;enregistrement, en demandant un lien
              de connexion à son adresse professionnelle.
            </DialogDescription>
          </DialogHeader>

          <form action={envoyer} className="space-y-4">
            <FormulaireUtilisateur fiche={FICHE_VIDE} erreurs={erreurs} desactiverRole={false} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Boutons de modification et d'activation d'une fiche existante. */
export function BoutonsUtilisateur({
  utilisateur,
  estMoi,
}: {
  utilisateur: FicheUtilisateur;
  estMoi: boolean;
}) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function envoyer(donnees: FormData): void {
    setErreurs({});
    demarrer(async () => {
      const resultat = await modifierUtilisateur(utilisateur.id, donnees);

      if (!resultat.ok) {
        setErreurs(resultat.erreursChamps ?? {});
        toast.error(resultat.erreur);
        return;
      }

      setOuvert(false);
      toast.success(resultat.message ?? 'Fiche mise à jour.');
      routeur.refresh();
    });
  }

  function basculer(): void {
    demarrer(async () => {
      const resultat = await basculerActivation(utilisateur.id, !utilisateur.actif);

      if (!resultat.ok) {
        toast.error(resultat.erreur);
        return;
      }

      toast.success(resultat.message ?? 'Fiche mise à jour.');
      routeur.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="ghost" size="sm" onClick={() => setOuvert(true)} title="Modifier la fiche">
        <Pencil aria-hidden />
        <span className="sr-only">Modifier</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={basculer}
        disabled={enCours || estMoi}
        title={
          estMoi
            ? 'Vous ne pouvez pas désactiver votre propre compte'
            : utilisateur.actif
              ? 'Désactiver le compte'
              : 'Réactiver le compte'
        }
      >
        <Power aria-hidden className={utilisateur.actif ? 'text-success' : 'text-muted-foreground'} />
        <span className="sr-only">{utilisateur.actif ? 'Désactiver' : 'Réactiver'}</span>
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Modifier {utilisateur.prenoms} {utilisateur.nom}
            </DialogTitle>
            <DialogDescription>
              Les ordres de mission déjà émis conservent l&apos;identité figée au moment de leur
              soumission.
            </DialogDescription>
          </DialogHeader>

          <form action={envoyer} className="space-y-4">
            <FormulaireUtilisateur fiche={utilisateur} erreurs={erreurs} desactiverRole={estMoi} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Import CSV en masse de fiches collaborateurs. */
export function ImportCsv() {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreursLignes, setErreursLignes] = useState<{ ligne: number; message: string }[]>([]);

  function envoyer(donnees: FormData): void {
    setErreursLignes([]);
    demarrer(async () => {
      const resultat = await importerUtilisateursCsv(donnees);

      if (!resultat.ok) {
        toast.error(resultat.erreur);
        return;
      }

      setErreursLignes(resultat.donnees.erreurs);
      toast.success(resultat.message ?? 'Import terminé.');
      routeur.refresh();

      if (resultat.donnees.erreurs.length === 0) setOuvert(false);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOuvert(true)}>
        <Upload aria-hidden />
        Importer un CSV
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import en masse</DialogTitle>
            <DialogDescription>
              Fichier CSV séparé par des virgules ou des points-virgules, avec en première ligne les
              colonnes : {COLONNES_CSV.join(', ')}. Les collaborateurs déjà connus (même adresse
              e-mail) sont mis à jour.
            </DialogDescription>
          </DialogHeader>

          <form action={envoyer} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fichier">Fichier CSV</Label>
              <Input id="fichier" name="fichier" type="file" accept=".csv,text/csv" required />
            </div>

            {erreursLignes.length > 0 ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive">
                  {erreursLignes.length} ligne(s) non importée(s) :
                </p>
                <ul className="space-y-0.5 text-xs text-destructive">
                  {erreursLignes.map((erreur) => (
                    <li key={erreur.ligne}>
                      Ligne {erreur.ligne} — {erreur.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
                Fermer
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Importer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
