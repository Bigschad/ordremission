"""Opérations d'écriture sur les ordres de mission.

Chaque opération renvoie un résultat typé plutôt que de lever : l'appelant web
n'a jamais à rattraper d'exception métier.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from app.domaine import audit, jetons, numerotation, statuts
from app.domaine.validations import Mission, Saisie, transport_ou_defaut, valider
from app.models import MissionOrder, MissionStatus, User, maintenant

RELANCES_MAX = 3


@dataclass
class Issue:
    """Résultat d'une opération : succès avec message, ou erreurs par champ."""

    ok: bool
    mission: MissionOrder | None = None
    message: str = ''
    erreur: str = ''
    erreurs_champs: dict[str, str] = field(default_factory=dict)


def _figer_identite(mission: MissionOrder, utilisateur: User) -> None:
    """L'identité est recopiée sur l'ordre : le poste peut changer ensuite."""
    mission.nom = utilisateur.nom
    mission.prenoms = utilisateur.prenoms
    mission.matricule = utilisateur.matricule
    mission.fonction = utilisateur.fonction


def _appliquer_valeurs(mission: MissionOrder, valeurs: Mission) -> None:
    mission.analytique = valeurs.analytique
    mission.objet = valeurs.objet
    mission.lieu = valeurs.lieu
    mission.date_depart = valeurs.date_depart
    mission.date_retour = valeurs.date_retour
    mission.transport_type = valeurs.transport_type
    mission.transport_detail = valeurs.transport_detail
    mission.litres_gasoil = valeurs.litres_gasoil


def creer_brouillon(
    session: Session, utilisateur: User, saisie: Saisie, ip: str | None = None
) -> Issue:
    """Enregistre un brouillon.

    La validation stricte n'est appliquée qu'à la soumission : on doit pouvoir
    sauvegarder une saisie incomplète et y revenir plus tard. Seuls les champs
    renseignés sont contrôlés.
    """
    resultat = valider(saisie)
    valeurs = resultat.valeurs

    mission = MissionOrder(
        id=str(uuid.uuid4()),
        numero=numerotation.numero_provisoire(),
        demandeur_id=utilisateur.id,
        objet=(saisie.objet or '').strip(),
        lieu=(saisie.lieu or '').strip(),
        analytique=(saisie.analytique or '').strip() or None,
        date_depart=valeurs.date_depart if valeurs else maintenant(),
        date_retour=valeurs.date_retour if valeurs else maintenant(),
        transport_type=valeurs.transport_type
        if valeurs
        else transport_ou_defaut(saisie.transport_type),
        transport_detail=(saisie.transport_detail or '').strip() or None,
        litres_gasoil=valeurs.litres_gasoil if valeurs else None,
        statut=MissionStatus.DRAFT,
    )
    _figer_identite(mission, utilisateur)

    session.add(mission)
    session.flush()

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission.id,
        action='CREATED',
        acteur=utilisateur.email,
        ip=ip,
    )

    return Issue(True, mission=mission, message='Brouillon enregistré.')


def modifier_brouillon(
    session: Session,
    mission: MissionOrder,
    saisie: Saisie,
    utilisateur: User,
    ip: str | None = None,
) -> Issue:
    """Règle 5 — seul le statut DRAFT est modifiable."""
    try:
        statuts.appliquer(mission.statut, statuts.UPDATE)
    except statuts.TransitionInterdite as erreur:
        return Issue(False, erreur=str(erreur))

    resultat = valider(saisie)
    mission.objet = (saisie.objet or '').strip()
    mission.lieu = (saisie.lieu or '').strip()
    mission.analytique = (saisie.analytique or '').strip() or None
    mission.transport_detail = (saisie.transport_detail or '').strip() or None

    if resultat.valeurs is not None:
        _appliquer_valeurs(mission, resultat.valeurs)

    session.flush()
    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission.id,
        action='UPDATED',
        acteur=utilisateur.email,
        ip=ip,
    )

    return Issue(True, mission=mission, message='Brouillon mis à jour.')


def supprimer_brouillon(
    session: Session, mission: MissionOrder, utilisateur: User, ip: str | None = None
) -> Issue:
    """Règle 5."""
    try:
        statuts.appliquer(mission.statut, statuts.DELETE)
    except statuts.TransitionInterdite as erreur:
        return Issue(False, erreur=str(erreur))

    identifiant = mission.id
    session.delete(mission)
    session.flush()

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=identifiant,
        action='DELETED',
        acteur=utilisateur.email,
        ip=ip,
    )

    return Issue(True, message='Brouillon supprimé.')


@dataclass
class Soumission(Issue):
    jetons: jetons.Paire | None = None


def soumettre(
    session: Session,
    mission: MissionOrder,
    saisie: Saisie,
    utilisateur: User,
    ip: str | None = None,
    quand: datetime | None = None,
) -> Soumission:
    """Soumet un ordre de mission aux Ressources Humaines.

    Le numéro définitif, le passage à SUBMITTED et l'émission des jetons se
    font dans la **même transaction** : aucun numéro n'est consommé par une
    soumission qui échoue.
    """
    try:
        statut_cible = statuts.appliquer(mission.statut, statuts.SUBMIT)
    except statuts.TransitionInterdite as erreur:
        return Soumission(False, erreur=str(erreur))

    resultat = valider(saisie)
    if not resultat.ok:
        return Soumission(
            False,
            erreur='Le formulaire comporte des erreurs : corrigez-les avant de soumettre.',
            erreurs_champs=resultat.erreurs,
        )

    quand = quand or maintenant()
    assert resultat.valeurs is not None

    mission.numero = numerotation.attribuer(session, quand.year)
    _figer_identite(mission, utilisateur)
    _appliquer_valeurs(mission, resultat.valeurs)
    mission.statut = statut_cible
    mission.soumis_le = quand
    session.flush()

    paire = jetons.emettre(session, mission.id, quand)

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission.id,
        action='SUBMITTED',
        acteur=utilisateur.email,
        ip=ip,
        details={'numero': mission.numero},
    )

    return Soumission(
        True,
        mission=mission,
        jetons=paire,
        message=f'Ordre de mission {mission.numero} soumis aux Ressources Humaines.',
    )


def annuler(
    session: Session, mission: MissionOrder, utilisateur: User, ip: str | None = None
) -> Issue:
    """Règle 6 — les jetons en circulation sont invalidés."""
    try:
        statut_cible = statuts.appliquer(mission.statut, statuts.CANCEL)
    except statuts.TransitionInterdite as erreur:
        return Issue(False, erreur=str(erreur))

    mission.statut = statut_cible
    jetons.invalider(session, mission.id)
    session.flush()

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission.id,
        action='CANCELLED',
        acteur=utilisateur.email,
        ip=ip,
        details={'numero': mission.numero},
    )

    return Issue(True, mission=mission, message='Ordre de mission annulé.')


def relancer(
    session: Session, mission: MissionOrder, utilisateur: User, ip: str | None = None
) -> Soumission:
    """Renvoie l'ordre aux RH — prévu pour le cas où l'e-mail initial a échoué.

    De nouveaux jetons sont émis, ceux du message précédent deviennent caducs,
    et le nombre de relances est plafonné.
    """
    try:
        statuts.appliquer(mission.statut, statuts.RESUBMIT)
    except statuts.TransitionInterdite as erreur:
        return Soumission(False, erreur=str(erreur))

    if mission.relances >= RELANCES_MAX:
        return Soumission(
            False,
            erreur=f'Vous avez atteint la limite de {RELANCES_MAX} renvois. '
            'Contactez directement les Ressources Humaines.',
        )

    mission.relances += 1
    paire = jetons.emettre(session, mission.id)
    session.flush()

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission.id,
        action='RESUBMITTED',
        acteur=utilisateur.email,
        ip=ip,
        details={'numero': mission.numero, 'relance': mission.relances},
    )

    return Soumission(
        True,
        mission=mission,
        jetons=paire,
        message=f'Ordre de mission renvoyé aux Ressources Humaines '
        f'({mission.relances}/{RELANCES_MAX}).',
    )
