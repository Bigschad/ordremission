'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TransportType } from '@prisma/client';
import { LoaderCircle, Save, Send, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import { creerBrouillon, modifierBrouillon, soumettreMission } from '@/actions/missions';
import type { ActionResultat } from '@/actions/resultat';
import { ApercuPdf } from '@/components/mission/apercu-pdf';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  accepteGasoil,
  exigeDetail,
  missionSchema,
  TRANSPORT_DETAIL_LABELS,
  TRANSPORT_LABELS,
  type MissionInput,
} from '@/lib/validations/mission';

export interface IdentiteFigee {
  nom: string;
  prenoms: string;
  matricule: string;
  fonction: string;
}

export interface ValeursInitiales {
  analytique: string;
  objet: string;
  lieu: string;
  dateDepart: string;
  dateRetour: string;
  /** `undefined` tant qu'aucun moyen de transport n'est sélectionné. */
  transportType?: TransportType;
  transportDetail: string;
  litresGasoil: string;
}

/**
 * Normalise la valeur du groupe de boutons radio.
 * react-hook-form renvoie une chaîne vide tant qu'aucun choix n'est fait :
 * on la ramène à `undefined` pour que l'absence de sélection soit explicite.
 */
function normaliserTransport(valeur: unknown): TransportType | undefined {
  return typeof valeur === 'string' && (Object.values(TransportType) as string[]).includes(valeur)
    ? (valeur as TransportType)
    : undefined;
}

/** Champs pilotés par le formulaire — sert à router les erreurs du serveur. */
const CHAMPS: readonly (keyof MissionInput)[] = [
  'analytique',
  'objet',
  'lieu',
  'dateDepart',
  'dateRetour',
  'transportType',
  'transportDetail',
  'litresGasoil',
];

interface Props {
  identite: IdentiteFigee;
  valeursInitiales: ValeursInitiales;
  /** Renseigné en modification d'un brouillon existant. */
  missionId?: string;
}

/** Ligne d'un champ, avec libellé, aide et message d'erreur associés. */
function Champ({
  id,
  libelle,
  aide,
  erreur,
  obligatoire,
  children,
}: {
  id: string;
  libelle: string;
  aide?: string;
  erreur?: string;
  obligatoire?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {libelle}
        {obligatoire ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {aide && !erreur ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
      {erreur ? (
        <p id={`${id}-erreur`} role="alert" className="text-xs font-medium text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Formulaire d'ordre de mission, en une seule page découpée en trois sections :
 * identité (pré-remplie et verrouillée), mission, transport.
 *
 * La validation s'appuie sur le **même schéma Zod que le serveur** : un
 * message d'erreur affiché ici est exactement celui que renverrait l'action.
 */
export function FormulaireMission({ identite, valeursInitiales, missionId }: Props) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();

  /*
   * Le résolveur applique le schéma partagé : les messages affichés ici sont
   * exactement ceux que renverrait la Server Action. La valeur transformée par
   * Zod n'est pas exploitée — les Server Actions reçoivent un `FormData` et
   * revalident systématiquement côté serveur.
   */
  const form = useForm<MissionInput>({
    resolver: zodResolver(missionSchema),
    defaultValues: valeursInitiales,
    mode: 'onBlur',
  });

  const valeurs = form.watch();
  const transport = normaliserTransport(valeurs.transportType);
  const gasoilAutorise = transport !== undefined && accepteGasoil(transport);
  const detailObligatoire = transport !== undefined && exigeDetail(transport);

  /** Transforme l'état du formulaire en `FormData` pour les Server Actions. */
  function versFormData(): FormData {
    const donnees = new FormData();
    for (const [clef, valeur] of Object.entries(form.getValues())) {
      donnees.set(clef, valeur === null || valeur === undefined ? '' : String(valeur));
    }
    // Règle 3 : aucune quantité de gasoil pour un transport en commun.
    if (!gasoilAutorise) donnees.set('litresGasoil', '');
    return donnees;
  }

  /** Applique les erreurs renvoyées par le serveur sur les champs concernés. */
  function appliquerErreursServeur(resultat: Extract<ActionResultat<never>, { ok: false }>): void {
    toast.error(resultat.erreur);

    for (const [champ, message] of Object.entries(resultat.erreursChamps ?? {})) {
      if ((CHAMPS as readonly string[]).includes(champ)) {
        form.setError(champ as keyof MissionInput, { type: 'server', message });
      }
    }
  }

  /** « Enregistrer comme brouillon » : aucune règle métier n'est exigée. */
  function enregistrerBrouillon(): void {
    demarrer(async () => {
      const donnees = versFormData();
      const resultat = missionId
        ? await modifierBrouillon(missionId, donnees)
        : await creerBrouillon(donnees);

      if (!resultat.ok) {
        appliquerErreursServeur(resultat);
        return;
      }

      toast.success(resultat.message ?? 'Brouillon enregistré.');
      routeur.push(`/missions/${resultat.donnees.id}`);
      routeur.refresh();
    });
  }

  /** « Soumettre aux RH » : validation stricte côté client puis côté serveur. */
  const soumettre: SubmitHandler<MissionInput> = () => {
    demarrer(async () => {
      const donnees = versFormData();

      // Un brouillon doit exister avant d'être soumis : on l'enregistre au vol.
      let identifiant = missionId;
      if (!identifiant) {
        const creation = await creerBrouillon(donnees);
        if (!creation.ok) {
          appliquerErreursServeur(creation);
          return;
        }
        identifiant = creation.donnees.id;
      }

      const resultat = await soumettreMission(identifiant, donnees);

      if (!resultat.ok) {
        appliquerErreursServeur(resultat);
        return;
      }

      toast.success(resultat.message ?? 'Ordre de mission soumis.');
      routeur.push(`/missions/${resultat.donnees.id}`);
      routeur.refresh();
    });
  };

  const erreurs = form.formState.errors;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <form onSubmit={form.handleSubmit(soumettre)} className="space-y-5" noValidate>
        {/* -- Section 1 : identité, pré-remplie et verrouillée ------------- */}
        <Card>
          <CardHeader>
            <CardTitle>1. Identité du demandeur</CardTitle>
            <CardDescription>
              Ces informations proviennent de votre fiche collaborateur et ne sont pas modifiables
              ici. Une erreur ? Signalez-la aux Ressources Humaines.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Champ id="nom" libelle="Nom">
              <Input id="nom" value={identite.nom} readOnly disabled />
            </Champ>
            <Champ id="prenoms" libelle="Prénoms">
              <Input id="prenoms" value={identite.prenoms} readOnly disabled />
            </Champ>
            <Champ id="matricule" libelle="Matricule">
              <Input id="matricule" value={identite.matricule} readOnly disabled />
            </Champ>
            <Champ id="fonction" libelle="Fonction">
              <Input id="fonction" value={identite.fonction} readOnly disabled />
            </Champ>
          </CardContent>
        </Card>

        {/* -- Section 2 : la mission --------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>2. La mission</CardTitle>
            <CardDescription>Objet, lieu et dates du déplacement.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Champ
              id="objet"
              libelle="Objet de la mission"
              obligatoire
              erreur={erreurs.objet?.message}
              aide="Exemple : visite chantier, réception de travaux, audit fournisseur."
            >
              <Textarea
                id="objet"
                rows={2}
                autoFocus
                aria-invalid={Boolean(erreurs.objet)}
                aria-describedby={erreurs.objet ? 'objet-erreur' : undefined}
                {...form.register('objet')}
              />
            </Champ>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                id="lieu"
                libelle="Lieu de la mission"
                obligatoire
                erreur={erreurs.lieu?.message}
              >
                <Input
                  id="lieu"
                  autoComplete="off"
                  aria-invalid={Boolean(erreurs.lieu)}
                  aria-describedby={erreurs.lieu ? 'lieu-erreur' : undefined}
                  {...form.register('lieu')}
                />
              </Champ>

              <Champ
                id="analytique"
                libelle="Code analytique"
                aide="Facultatif — code d'imputation du service."
                erreur={erreurs.analytique?.message}
              >
                <Input id="analytique" autoComplete="off" {...form.register('analytique')} />
              </Champ>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                id="dateDepart"
                libelle="Date et heure de départ"
                obligatoire
                erreur={erreurs.dateDepart?.message}
              >
                <Input
                  id="dateDepart"
                  type="datetime-local"
                  aria-invalid={Boolean(erreurs.dateDepart)}
                  aria-describedby={erreurs.dateDepart ? 'dateDepart-erreur' : undefined}
                  {...form.register('dateDepart')}
                />
              </Champ>

              <Champ
                id="dateRetour"
                libelle="Date et heure de retour"
                obligatoire
                erreur={erreurs.dateRetour?.message}
              >
                <Input
                  id="dateRetour"
                  type="datetime-local"
                  aria-invalid={Boolean(erreurs.dateRetour)}
                  aria-describedby={erreurs.dateRetour ? 'dateRetour-erreur' : undefined}
                  {...form.register('dateRetour')}
                />
              </Champ>
            </div>
          </CardContent>
        </Card>

        {/* -- Section 3 : le transport ------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>3. Transport et carburant</CardTitle>
            <CardDescription>
              Un seul moyen de transport par ordre de mission, comme sur le formulaire papier.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Moyen de transport
                <span className="ml-0.5 text-destructive" aria-hidden>
                  *
                </span>
              </legend>

              <div className="space-y-2">
                {Object.values(TransportType).map((type) => (
                  <label
                    key={type}
                    htmlFor={`transport-${type}`}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2.5 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      id={`transport-${type}`}
                      type="radio"
                      value={type}
                      className="size-4 accent-[hsl(var(--primary))]"
                      {...form.register('transportType')}
                    />
                    {TRANSPORT_LABELS[type]}
                  </label>
                ))}
              </div>

              {erreurs.transportType ? (
                <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">
                  {erreurs.transportType.message}
                </p>
              ) : null}
            </fieldset>

            {transport !== undefined ? (
              <Champ
                id="transportDetail"
                libelle={TRANSPORT_DETAIL_LABELS[transport].replace(' (facultatif)', '')}
                obligatoire={detailObligatoire}
                erreur={erreurs.transportDetail?.message}
                aide={detailObligatoire ? undefined : 'Facultatif.'}
              >
                <Input
                  id="transportDetail"
                  autoComplete="off"
                  aria-invalid={Boolean(erreurs.transportDetail)}
                  aria-describedby={erreurs.transportDetail ? 'transportDetail-erreur' : undefined}
                  {...form.register('transportDetail')}
                />
              </Champ>
            ) : null}

            {gasoilAutorise ? (
              <Champ
                id="litresGasoil"
                libelle="Quantité de gasoil (litres)"
                aide="Facultatif — laissez vide si aucune dotation n'est prévue."
                erreur={erreurs.litresGasoil?.message}
              >
                <Input
                  id="litresGasoil"
                  type="number"
                  min="0"
                  max="9999.99"
                  step="0.01"
                  inputMode="decimal"
                  aria-invalid={Boolean(erreurs.litresGasoil)}
                  aria-describedby={erreurs.litresGasoil ? 'litresGasoil-erreur' : undefined}
                  {...form.register('litresGasoil')}
                />
              </Champ>
            ) : transport === TransportType.TRANSPORT_EN_COMMUN ? (
              <Alert>
                <TriangleAlert aria-hidden />
                <AlertTitle>Pas de dotation de carburant</AlertTitle>
                <AlertDescription>
                  Aucune quantité de gasoil ne peut être demandée pour un déplacement en transport
                  en commun.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-lg sm:border">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={enregistrerBrouillon}
            disabled={enCours}
          >
            <Save aria-hidden />
            Enregistrer comme brouillon
          </Button>

          <Button type="submit" size="lg" disabled={enCours}>
            {enCours ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                Envoi en cours…
              </>
            ) : (
              <>
                <Send aria-hidden />
                Soumettre aux RH
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Aperçu du PDF — réservé au bureau, la place manque sur mobile. */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 h-[min(78vh,52rem)]">
          <ApercuPdf
            valeurs={{
              analytique: valeurs.analytique ?? '',
              objet: valeurs.objet ?? '',
              lieu: valeurs.lieu ?? '',
              dateDepart: valeurs.dateDepart ?? '',
              dateRetour: valeurs.dateRetour ?? '',
              transportType: valeurs.transportType ?? '',
              transportDetail: valeurs.transportDetail ?? '',
              litresGasoil:
                gasoilAutorise && valeurs.litresGasoil !== null && valeurs.litresGasoil !== undefined
                  ? String(valeurs.litresGasoil)
                  : '',
            }}
          />
        </div>
      </aside>
    </div>
  );
}
