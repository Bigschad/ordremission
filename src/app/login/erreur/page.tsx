import type { Metadata } from 'next';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoPorteo } from '@/components/marque/logo';

export const metadata: Metadata = { title: 'Connexion impossible' };

const MESSAGES: Record<string, string> = {
  Verification:
    "Ce lien de connexion n'est plus valable : il a déjà été utilisé, ou sa durée de validité de 15 minutes est écoulée. Demandez-en un nouveau.",
  AccessDenied:
    "Cette adresse n'est rattachée à aucun collaborateur actif. Rapprochez-vous des Ressources Humaines.",
  Configuration:
    "Le service d'authentification est momentanément indisponible. Réessayez dans quelques instants.",
};

export default async function PageErreurConnexion({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error ? MESSAGES[error] : undefined) ??
    "La connexion n'a pas pu aboutir. Demandez un nouveau lien de connexion.";

  return (
    <main className="bg-secondary/40 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <LogoPorteo className="mx-auto items-center" />

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <TriangleAlert className="size-5" aria-hidden />
              Connexion impossible
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">{message}</p>
            <Button asChild className="w-full">
              <Link href="/login">Demander un nouveau lien</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
