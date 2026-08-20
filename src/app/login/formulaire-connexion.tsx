'use client';

import { CheckCircle2, LoaderCircle, Mail, TriangleAlert } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { demanderLienConnexion, type ConnexionState } from './actions';

function BoutonEnvoyer() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden />
          Envoi en cours…
        </>
      ) : (
        <>
          <Mail aria-hidden />
          Recevoir mon lien de connexion
        </>
      )}
    </Button>
  );
}

export function FormulaireConnexion({ suite }: { suite: string }) {
  const [etat, action] = useActionState<ConnexionState, FormData>(demanderLienConnexion, {});

  // Succès : l'action renvoie l'adresse sans erreur.
  if (etat.email && !etat.erreur) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            Vérifiez votre boîte mail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Si l&apos;adresse <strong className="text-foreground">{etat.email}</strong> correspond à
            un collaborateur enregistré, un lien de connexion vient de lui être envoyé.
          </p>
          <p>Ce lien est valable 15 minutes et ne peut servir qu&apos;une seule fois.</p>
          <p>Pensez à consulter vos courriers indésirables.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Saisissez votre adresse professionnelle : vous recevrez un lien de connexion. Aucun mot de
          passe n&apos;est nécessaire.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="suite" value={suite} />

          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail professionnelle</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={etat.email ?? ''}
              placeholder="prenom.nom@porteo-group.com"
              aria-invalid={Boolean(etat.erreur)}
              aria-describedby={etat.erreur ? 'erreur-connexion' : undefined}
            />
          </div>

          {etat.erreur ? (
            <Alert variant="destructive" id="erreur-connexion">
              <TriangleAlert aria-hidden />
              <AlertTitle>Connexion impossible</AlertTitle>
              <AlertDescription>{etat.erreur}</AlertDescription>
            </Alert>
          ) : null}

          <BoutonEnvoyer />
        </form>
      </CardContent>
    </Card>
  );
}
