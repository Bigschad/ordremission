"""Administration des fiches collaborateurs et import CSV en masse."""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domaine import audit
from app.models import Role, User

LIBELLES_ROLE: dict[Role, str] = {
    Role.EMPLOYEE: 'Collaborateur',
    Role.HR: 'Ressources Humaines',
    Role.ADMIN: 'Administrateur',
}

#: Colonnes attendues par l'import CSV.
COLONNES_CSV = ('nom', 'prenoms', 'matricule', 'fonction', 'email', 'role')


@dataclass
class Fiche:
    nom: str = ''
    prenoms: str = ''
    matricule: str = ''
    fonction: str = ''
    email: str = ''
    role: Role = Role.EMPLOYEE
    actif: bool = True


@dataclass
class Resultat:
    fiche: Fiche | None = None
    erreurs: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.fiche is not None and not self.erreurs


def valider(donnees: dict[str, str], actif: bool = True) -> Resultat:
    """Valide une fiche. Le formulaire papier est rempli en majuscules : on normalise."""
    erreurs: dict[str, str] = {}

    def texte(clef: str, libelle: str, maximum: int, majuscules: bool = False) -> str:
        valeur = (donnees.get(clef) or '').strip()
        if not valeur:
            erreurs[clef] = f'{libelle} est obligatoire'
        elif len(valeur) > maximum:
            erreurs[clef] = f'{libelle} ne peut pas dépasser {maximum} caractères'
        return valeur.upper() if majuscules else valeur

    nom = texte('nom', 'Le nom', 100, majuscules=True)
    prenoms = texte('prenoms', 'Les prénoms', 150, majuscules=True)
    matricule = texte('matricule', 'Le matricule', 20)
    fonction = texte('fonction', 'La fonction', 150)

    email = (donnees.get('email') or '').strip().lower()
    if not email:
        erreurs['email'] = "L'adresse e-mail est obligatoire"
    elif '@' not in email or '.' not in email.split('@')[-1] or len(email) < 5:
        erreurs['email'] = 'Adresse e-mail invalide'

    brut_role = (donnees.get('role') or Role.EMPLOYEE.value).strip().upper()
    try:
        role = Role(brut_role)
    except ValueError:
        erreurs['role'] = 'Rôle inconnu'
        role = Role.EMPLOYEE

    if erreurs:
        return Resultat(erreurs=erreurs)

    return Resultat(
        fiche=Fiche(
            nom=nom,
            prenoms=prenoms,
            matricule=matricule,
            fonction=fonction,
            email=email,
            role=role,
            actif=actif,
        )
    )


def _message_unicite(erreur: IntegrityError) -> str:
    """Traduit une violation de contrainte en message métier."""
    detail = str(erreur.orig).lower()

    if 'email' in detail:
        return 'Cette adresse e-mail est déjà utilisée par un autre collaborateur.'
    if 'matricule' in detail:
        return 'Ce matricule est déjà attribué à un autre collaborateur.'
    return 'Cette valeur est déjà utilisée par un autre collaborateur.'


def creer(session: Session, fiche: Fiche, acteur: str) -> tuple[User | None, str]:
    utilisateur = User(
        id=str(uuid.uuid4()),
        nom=fiche.nom,
        prenoms=fiche.prenoms,
        matricule=fiche.matricule,
        fonction=fiche.fonction,
        email=fiche.email,
        role=fiche.role,
        actif=fiche.actif,
    )
    session.add(utilisateur)

    try:
        session.flush()
    except IntegrityError as erreur:
        session.rollback()
        return None, _message_unicite(erreur)

    audit.journaliser(
        session,
        entite='User',
        entite_id=utilisateur.id,
        action='CREATED',
        acteur=acteur,
        details={'email': fiche.email, 'role': fiche.role.value},
    )
    return utilisateur, ''


def modifier(session: Session, utilisateur: User, fiche: Fiche, acteur: str) -> tuple[bool, str]:
    utilisateur.nom = fiche.nom
    utilisateur.prenoms = fiche.prenoms
    utilisateur.matricule = fiche.matricule
    utilisateur.fonction = fiche.fonction
    utilisateur.email = fiche.email
    utilisateur.role = fiche.role
    utilisateur.actif = fiche.actif

    try:
        session.flush()
    except IntegrityError as erreur:
        session.rollback()
        return False, _message_unicite(erreur)

    audit.journaliser(
        session,
        entite='User',
        entite_id=utilisateur.id,
        action='UPDATED',
        acteur=acteur,
        details={'email': fiche.email, 'role': fiche.role.value, 'actif': fiche.actif},
    )
    return True, ''


def basculer_activation(session: Session, utilisateur: User, actif: bool, acteur: str) -> str:
    """Aucune suppression n'est proposée : les ordres émis gardent leur demandeur."""
    utilisateur.actif = actif
    session.flush()

    audit.journaliser(
        session,
        entite='User',
        entite_id=utilisateur.id,
        action='UPDATED',
        acteur=acteur,
        details={'actif': actif},
    )
    return 'Collaborateur réactivé.' if actif else 'Collaborateur désactivé.'


@dataclass
class LigneCsv:
    ligne: int
    fiche: Fiche


@dataclass
class ErreurCsv:
    ligne: int
    message: str


@dataclass
class AnalyseCsv:
    valides: list[LigneCsv] = field(default_factory=list)
    erreurs: list[ErreurCsv] = field(default_factory=list)


def analyser_csv(contenu: str) -> AnalyseCsv:
    """Analyse un CSV d'import.

    Séparateur `,` ou `;` (Excel francophone), en-tête obligatoire. Les lignes
    invalides sont signalées sans empêcher l'import des lignes valides.
    """
    texte = contenu.lstrip('﻿')
    lignes = [ligne for ligne in texte.splitlines() if ligne.strip()]

    if not lignes:
        return AnalyseCsv(erreurs=[ErreurCsv(0, 'Le fichier est vide.')])

    separateur = ';' if ';' in lignes[0] else ','
    lecteur = csv.reader(io.StringIO('\n'.join(lignes)), delimiter=separateur)
    rangees = list(lecteur)

    entete = [colonne.strip().lower() for colonne in rangees[0]]
    manquantes = [colonne for colonne in COLONNES_CSV if colonne not in entete]

    if manquantes:
        return AnalyseCsv(
            erreurs=[
                ErreurCsv(
                    1,
                    f"Colonnes manquantes dans l'en-tête : {', '.join(manquantes)}. "
                    f'Attendu : {", ".join(COLONNES_CSV)}.',
                )
            ]
        )

    analyse = AnalyseCsv()

    for index, rangee in enumerate(rangees[1:], start=2):
        donnees = {
            colonne: (rangee[position].strip() if position < len(rangee) else '')
            for position, colonne in enumerate(entete)
        }

        resultat = valider(donnees)
        if resultat.ok and resultat.fiche is not None:
            analyse.valides.append(LigneCsv(index, resultat.fiche))
        else:
            message = ' — '.join(f'{champ} : {texte}' for champ, texte in resultat.erreurs.items())
            analyse.erreurs.append(ErreurCsv(index, message))

    return analyse


@dataclass
class ResultatImport:
    crees: int = 0
    mis_a_jour: int = 0
    erreurs: list[ErreurCsv] = field(default_factory=list)


def importer_csv(session: Session, contenu: str, acteur: str) -> ResultatImport:
    """Les collaborateurs déjà connus (même e-mail) sont mis à jour."""
    analyse = analyser_csv(contenu)
    resultat = ResultatImport(erreurs=list(analyse.erreurs))

    for ligne in analyse.valides:
        existant = session.scalars(
            select(User).where(User.email == ligne.fiche.email)
        ).one_or_none()

        if existant is not None:
            ok, message = modifier(session, existant, ligne.fiche, acteur)
            if ok:
                resultat.mis_a_jour += 1
            else:
                resultat.erreurs.append(ErreurCsv(ligne.ligne, message))
            continue

        cree, message = creer(session, ligne.fiche, acteur)
        if cree is not None:
            resultat.crees += 1
        else:
            resultat.erreurs.append(ErreurCsv(ligne.ligne, message))

    audit.journaliser(
        session,
        entite='User',
        entite_id='import-csv',
        action='CREATED',
        acteur=acteur,
        details={
            'crees': resultat.crees,
            'mis_a_jour': resultat.mis_a_jour,
            'erreurs': len(resultat.erreurs),
        },
    )
    return resultat


def lister(session: Session) -> list[User]:
    return list(
        session.scalars(
            select(User).order_by(User.actif.desc(), User.nom.asc(), User.prenoms.asc())
        )
    )
