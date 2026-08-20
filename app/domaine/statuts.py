"""Machine à états des ordres de mission.

Conçue pour rester extensible : la v2 doit pouvoir insérer des étapes
« Supérieur hiérarchique » et « Directeur » entre SUBMITTED et APPROVED en
ajoutant des lignes à la table de transitions, sans toucher aux appelants.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import MissionStatus

Transition = str

SUBMIT: Transition = 'SUBMIT'
RESUBMIT: Transition = 'RESUBMIT'
APPROVE: Transition = 'APPROVE'
REJECT: Transition = 'REJECT'
CANCEL: Transition = 'CANCEL'
UPDATE: Transition = 'UPDATE'
DELETE: Transition = 'DELETE'

TRANSITIONS: tuple[Transition, ...] = (UPDATE, DELETE, SUBMIT, RESUBMIT, APPROVE, REJECT, CANCEL)


@dataclass(frozen=True)
class Regle:
    #: Statuts depuis lesquels la transition est permise.
    depuis: tuple[MissionStatus, ...]
    #: Statut atteint ; `None` lorsque le statut ne change pas.
    vers: MissionStatus | None


_TABLE: dict[Transition, Regle] = {
    UPDATE: Regle((MissionStatus.DRAFT,), None),
    DELETE: Regle((MissionStatus.DRAFT,), None),
    SUBMIT: Regle((MissionStatus.DRAFT,), MissionStatus.SUBMITTED),
    RESUBMIT: Regle((MissionStatus.SUBMITTED,), None),
    APPROVE: Regle((MissionStatus.SUBMITTED,), MissionStatus.APPROVED),
    REJECT: Regle((MissionStatus.SUBMITTED,), MissionStatus.REJECTED),
    CANCEL: Regle((MissionStatus.DRAFT, MissionStatus.SUBMITTED), MissionStatus.CANCELLED),
}

LIBELLES_TRANSITION: dict[Transition, str] = {
    UPDATE: 'Modifier',
    DELETE: 'Supprimer',
    SUBMIT: 'Soumettre aux RH',
    RESUBMIT: 'Renvoyer aux RH',
    APPROVE: 'Valider',
    REJECT: 'Refuser',
    CANCEL: 'Annuler',
}

LIBELLES_STATUT: dict[MissionStatus, str] = {
    MissionStatus.DRAFT: 'Brouillon',
    MissionStatus.SUBMITTED: 'En attente de validation',
    MissionStatus.APPROVED: 'Validé',
    MissionStatus.REJECTED: 'Refusé',
    MissionStatus.CANCELLED: 'Annulé',
}

#: Classe CSS du badge de statut.
VARIANTES_STATUT: dict[MissionStatus, str] = {
    MissionStatus.DRAFT: 'badge--neutre',
    MissionStatus.SUBMITTED: 'badge--attente',
    MissionStatus.APPROVED: 'badge--succes',
    MissionStatus.REJECTED: 'badge--refus',
    MissionStatus.CANCELLED: 'badge--annule',
}


class TransitionInterdite(Exception):
    """Transition refusée par la machine à états."""

    def __init__(self, statut: MissionStatus, transition: Transition) -> None:
        self.statut = statut
        self.transition = transition
        super().__init__(
            f'Action « {LIBELLES_TRANSITION[transition]} » impossible : '
            f"l'ordre de mission est au statut « {libelle(statut)} »."
        )


def peut_transiter(statut: MissionStatus, transition: Transition) -> bool:
    return statut in _TABLE[transition].depuis


def appliquer(statut: MissionStatus, transition: Transition) -> MissionStatus:
    """Renvoie le statut résultant, ou lève `TransitionInterdite`."""
    if not peut_transiter(statut, transition):
        raise TransitionInterdite(statut, transition)
    return _TABLE[transition].vers or statut


def est_final(statut: MissionStatus) -> bool:
    """Statuts terminaux : aucune transition sortante."""
    return statut in {MissionStatus.APPROVED, MissionStatus.REJECTED, MissionStatus.CANCELLED}


def est_modifiable(statut: MissionStatus) -> bool:
    """Règle 5 — seul le brouillon est modifiable ou supprimable."""
    return peut_transiter(statut, UPDATE)


def est_annulable(statut: MissionStatus) -> bool:
    """Règle 6 — brouillon et ordre soumis sont annulables."""
    return peut_transiter(statut, CANCEL)


def est_en_attente(statut: MissionStatus) -> bool:
    """Ordre en attente de décision : ses jetons d'approbation sont actifs."""
    return statut is MissionStatus.SUBMITTED


def libelle(statut: MissionStatus) -> str:
    return LIBELLES_STATUT[statut]


def variante(statut: MissionStatus) -> str:
    return VARIANTES_STATUT[statut]
