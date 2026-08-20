import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  analyserCsv,
  COLONNES_CSV,
  ROLE_LABELS,
  utilisateurSchema,
} from '@/lib/validations/utilisateur';

describe('validation d’une fiche collaborateur', () => {
  const fiche = {
    nom: 'yeye',
    prenoms: 'schadrach guy-roland',
    matricule: '4071',
    fonction: 'Responsable Développement & Intégration IT',
    email: 'Schadrach.Yeye@Porteo-Group.com',
    role: Role.EMPLOYEE,
    actif: true,
  };

  it('normalise le nom en majuscules et l’e-mail en minuscules', () => {
    const resultat = utilisateurSchema.safeParse(fiche);

    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe('YEYE');
      expect(resultat.data.prenoms).toBe('SCHADRACH GUY-ROLAND');
      expect(resultat.data.email).toBe('schadrach.yeye@porteo-group.com');
    }
  });

  it('refuse une adresse e-mail invalide', () => {
    expect(utilisateurSchema.safeParse({ ...fiche, email: 'pas-un-email' }).success).toBe(false);
  });

  it('refuse les champs obligatoires vides', () => {
    for (const champ of ['nom', 'prenoms', 'matricule', 'fonction'] as const) {
      expect(utilisateurSchema.safeParse({ ...fiche, [champ]: '   ' }).success, champ).toBe(false);
    }
  });

  it('refuse un rôle inconnu', () => {
    expect(utilisateurSchema.safeParse({ ...fiche, role: 'DIRECTEUR' }).success).toBe(false);
  });

  it('donne un libellé français à chaque rôle', () => {
    expect(ROLE_LABELS.EMPLOYEE).toBe('Collaborateur');
    expect(ROLE_LABELS.HR).toBe('Ressources Humaines');
    expect(ROLE_LABELS.ADMIN).toBe('Administrateur');
  });
});

describe('import CSV en masse', () => {
  const entete = COLONNES_CSV.join(',');

  it('accepte un fichier séparé par des virgules', () => {
    const analyse = analyserCsv(
      [
        entete,
        'YEYE,SCHADRACH GUY-ROLAND,4071,Responsable IT,schadrach.yeye@porteo-group.com,EMPLOYEE',
        'DIALLO,FATOUMATA,2001,Responsable RH,rh@porteo-group.com,HR',
      ].join('\n'),
    );

    expect(analyse.erreurs).toHaveLength(0);
    expect(analyse.valides).toHaveLength(2);
    expect(analyse.valides[0]?.donnees.email).toBe('schadrach.yeye@porteo-group.com');
    expect(analyse.valides[1]?.donnees.role).toBe(Role.HR);
  });

  it('accepte le point-virgule d’Excel francophone et le BOM', () => {
    const analyse = analyserCsv(
      [
        '﻿' + COLONNES_CSV.join(';'),
        'YEYE;SCHADRACH;4071;Responsable IT;y@porteo-group.com;EMPLOYEE',
      ].join('\r\n'),
    );

    expect(analyse.erreurs).toHaveLength(0);
    expect(analyse.valides).toHaveLength(1);
  });

  it('gère les valeurs entre guillemets contenant le séparateur', () => {
    const analyse = analyserCsv(
      [entete, 'YEYE,SCHADRACH,4071,"Responsable IT, Réseaux",y@porteo-group.com,EMPLOYEE'].join(
        '\n',
      ),
    );

    expect(analyse.valides[0]?.donnees.fonction).toBe('Responsable IT, Réseaux');
  });

  it('signale les colonnes manquantes', () => {
    const analyse = analyserCsv('nom,prenoms\nYEYE,SCHADRACH');

    expect(analyse.valides).toHaveLength(0);
    expect(analyse.erreurs[0]?.message).toMatch(/Colonnes manquantes/);
  });

  it('signale un fichier vide', () => {
    expect(analyserCsv('   ').erreurs[0]?.message).toMatch(/vide/);
  });

  it('importe les lignes valides et signale les autres, avec leur numéro', () => {
    const analyse = analyserCsv(
      [
        entete,
        'YEYE,SCHADRACH,4071,Responsable IT,y@porteo-group.com,EMPLOYEE',
        'SANS,EMAIL,4072,Fonction,pas-un-email,EMPLOYEE',
        'BAMBA,AWA,4073,Conductrice,awa@porteo-group.com,EMPLOYEE',
      ].join('\n'),
    );

    expect(analyse.valides).toHaveLength(2);
    expect(analyse.erreurs).toHaveLength(1);
    expect(analyse.erreurs[0]?.ligne).toBe(3);
  });

  it('applique le rôle Collaborateur par défaut', () => {
    const analyse = analyserCsv(
      [entete, 'YEYE,SCHADRACH,4071,Responsable IT,y@porteo-group.com,'].join('\n'),
    );

    expect(analyse.valides[0]?.donnees.role).toBe(Role.EMPLOYEE);
  });
});
