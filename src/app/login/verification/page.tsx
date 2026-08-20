import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoPorteo } from '@/components/marque/logo';

export const metadata: Metadata = { title: 'Lien envoyé' };

export default function PageVerification() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <LogoPorteo className="mx-auto items-center" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-primary" aria-hidden />
              Consultez votre messagerie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Un lien de connexion vient de vous être envoyé.</p>
            <p>Il est valable 15 minutes et ne peut servir qu&apos;une seule fois.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
