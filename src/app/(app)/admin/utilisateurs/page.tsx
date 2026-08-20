import type { Role } from '@prisma/client';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/prisma';
import { exigerAdmin } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/validations/utilisateur';
import { BoutonsUtilisateur, DialogueCreation, ImportCsv } from './gestion-utilisateurs';

export const metadata: Metadata = { title: 'Collaborateurs' };

const VARIANTES_ROLE: Record<Role, 'default' | 'secondary' | 'outline'> = {
  ADMIN: 'default',
  HR: 'secondary',
  EMPLOYEE: 'outline',
};

/** Administration des fiches collaborateurs — réservée au rôle ADMIN. */
export default async function PageUtilisateurs() {
  const admin = await exigerAdmin();

  const utilisateurs = await prisma.user.findMany({
    select: {
      id: true,
      nom: true,
      prenoms: true,
      matricule: true,
      fonction: true,
      email: true,
      role: true,
      actif: true,
      _count: { select: { missions: true } },
    },
    orderBy: [{ actif: 'desc' }, { nom: 'asc' }, { prenoms: 'asc' }],
  });

  const actifs = utilisateurs.filter((utilisateur) => utilisateur.actif).length;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collaborateurs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {utilisateurs.length} fiche{utilisateurs.length > 1 ? 's' : ''}, dont {actifs} active
            {actifs > 1 ? 's' : ''}. Seul un collaborateur enregistré et actif peut se connecter.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ImportCsv />
          <DialogueCreation />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <caption className="sr-only">Liste des collaborateurs</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Collaborateur</TableHead>
                <TableHead>Matricule</TableHead>
                <TableHead>Fonction</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Ordres</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {utilisateurs.map((utilisateur) => (
                <TableRow key={utilisateur.id} className={utilisateur.actif ? undefined : 'opacity-60'}>
                  <TableCell className="min-w-52">
                    <p className="font-medium">
                      {utilisateur.prenoms} {utilisateur.nom}
                    </p>
                    <p className="text-xs text-muted-foreground">{utilisateur.email}</p>
                  </TableCell>

                  <TableCell className="font-mono text-xs">{utilisateur.matricule}</TableCell>

                  <TableCell className="min-w-40 text-sm">{utilisateur.fonction}</TableCell>

                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={VARIANTES_ROLE[utilisateur.role]}>
                        {ROLE_LABELS[utilisateur.role]}
                      </Badge>
                      {!utilisateur.actif ? <Badge variant="outline">Désactivé</Badge> : null}
                    </div>
                  </TableCell>

                  <TableCell className="tabular-nums">{utilisateur._count.missions}</TableCell>

                  <TableCell className="text-right">
                    <BoutonsUtilisateur
                      utilisateur={{
                        id: utilisateur.id,
                        nom: utilisateur.nom,
                        prenoms: utilisateur.prenoms,
                        matricule: utilisateur.matricule,
                        fonction: utilisateur.fonction,
                        email: utilisateur.email,
                        role: utilisateur.role,
                        actif: utilisateur.actif,
                      }}
                      estMoi={utilisateur.id === admin.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
