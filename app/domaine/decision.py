"""Application d'une décision des Ressources Humaines.

Ce module est partagé par les deux points d'entrée : le lien reçu par e-mail
(`/approve/{jeton}`, `/reject/{jeton}`) et la file d'attente `/rh` pour un
utilisateur authentifié.

La décision est **atomique** : la mise à jour n'est appliquée que si l'ordre est
encore au statut SUBMITTED. Deux valideurs simultanés ne peuvent donc pas
produire deux décisions contradictoires.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.domaine import audit, jetons, statuts
from app.models import MissionOrder, MissionStatus, maintenant

#: Valideur enregistré lorsqu'une décision est prise depuis la boîte RH,
#: sans connexion — le cas nominal décrit par le cahier des charges.
VALIDEUR_SERVICE_RH = 'Ressources Humaines — PORTEO GROUP'


@dataclass(frozen=True)
class Valideur:
    #: `None` lorsque la décision vient d'un lien e-mail, sans session.
    id: str | None
    nom: str
    email: str


@dataclass(frozen=True)
class Resultat:
    ok: bool
    mission: MissionOrder | None = None
    motif: str | None = None
    message: str = ''


def appliquer(
    session: Session,
    *,
    mission_id: str,
    sens: str,
    valideur: Valideur,
    motif_refus: str | None = None,
    ip: str | None = None,
    quand: datetime | None = None,
) -> Resultat:
    """Applique une décision et consomme les jetons associés."""
    quand = quand or maintenant()
    statut_cible = statuts.appliquer(MissionStatus.SUBMITTED, sens)

    # Le filtre sur le statut rend la mise à jour idempotente : une seconde
    # décision concurrente touche zéro ligne.
    resultat = session.execute(
        update(MissionOrder)
        .where(MissionOrder.id == mission_id, MissionOrder.statut == MissionStatus.SUBMITTED)
        .values(
            statut=statut_cible,
            decide_le=quand,
            decide_par_id=valideur.id,
            decide_par_nom=valideur.nom,
            decide_par_email=valideur.email,
            motif_refus=motif_refus if sens == statuts.REJECT else None,
        )
    )

    if not resultat.rowcount:
        session.flush()
        mission = session.get(MissionOrder, mission_id)

        if mission is None:
            return Resultat(
                False, motif='INTROUVABLE', message='Cet ordre de mission est introuvable.'
            )

        message = (
            "Cet ordre de mission a été annulé par son demandeur : aucune décision n'est possible."
            if mission.statut is MissionStatus.CANCELLED
            else 'Une décision a déjà été prise sur cet ordre de mission.'
        )
        return Resultat(False, motif='DEJA_DECIDE', message=message)

    # Règle 7 — les deux jetons sont consommés ensemble.
    jetons.invalider(session, mission_id, quand)
    session.flush()
    session.expire_all()

    mission = session.get(MissionOrder, mission_id)
    assert mission is not None

    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission_id,
        action='APPROVED' if sens == statuts.APPROVE else 'REJECTED',
        acteur=valideur.email,
        ip=ip,
        details={
            'numero': mission.numero,
            'valideur': valideur.nom,
            **({'motif': motif_refus} if motif_refus else {}),
        },
    )

    return Resultat(True, mission=mission)
