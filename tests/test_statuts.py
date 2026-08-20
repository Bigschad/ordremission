"""Machine à états : toutes les transitions valides et invalides."""

from __future__ import annotations

import pytest

from app.domaine import statuts
from app.models import MissionStatus

# Statut attendu après transition ; `None` = transition interdite.
ATTENDU: dict[MissionStatus, dict[str, MissionStatus | None]] = {
    MissionStatus.DRAFT: {
        statuts.UPDATE: MissionStatus.DRAFT,
        statuts.DELETE: MissionStatus.DRAFT,
        statuts.SUBMIT: MissionStatus.SUBMITTED,
        statuts.RESUBMIT: None,
        statuts.APPROVE: None,
        statuts.REJECT: None,
        statuts.CANCEL: MissionStatus.CANCELLED,
    },
    MissionStatus.SUBMITTED: {
        statuts.UPDATE: None,
        statuts.DELETE: None,
        statuts.SUBMIT: None,
        statuts.RESUBMIT: MissionStatus.SUBMITTED,
        statuts.APPROVE: MissionStatus.APPROVED,
        statuts.REJECT: MissionStatus.REJECTED,
        statuts.CANCEL: MissionStatus.CANCELLED,
    },
    MissionStatus.APPROVED: dict.fromkeys(statuts.TRANSITIONS),
    MissionStatus.REJECTED: dict.fromkeys(statuts.TRANSITIONS),
    MissionStatus.CANCELLED: dict.fromkeys(statuts.TRANSITIONS),
}

CAS = [
    (statut, transition, ATTENDU[statut][transition])
    for statut in MissionStatus
    for transition in statuts.TRANSITIONS
]


@pytest.mark.parametrize(('statut', 'transition', 'cible'), CAS)
def test_table_de_transitions_exhaustive(
    statut: MissionStatus, transition: str, cible: MissionStatus | None
) -> None:
    """5 statuts × 7 transitions = 35 cas, tous vérifiés."""
    if cible is None:
        assert not statuts.peut_transiter(statut, transition)
        with pytest.raises(statuts.TransitionInterdite):
            statuts.appliquer(statut, transition)
    else:
        assert statuts.peut_transiter(statut, transition)
        assert statuts.appliquer(statut, transition) is cible


def test_message_derreur_en_francais() -> None:
    with pytest.raises(statuts.TransitionInterdite) as erreur:
        statuts.appliquer(MissionStatus.APPROVED, statuts.UPDATE)

    assert 'Modifier' in str(erreur.value)
    assert 'Validé' in str(erreur.value)
    assert erreur.value.statut is MissionStatus.APPROVED
    assert erreur.value.transition == statuts.UPDATE


def test_regle_5_seul_le_brouillon_est_modifiable() -> None:
    assert statuts.est_modifiable(MissionStatus.DRAFT)
    for statut in MissionStatus:
        if statut is not MissionStatus.DRAFT:
            assert not statuts.est_modifiable(statut)


def test_regle_6_brouillon_et_soumis_sont_annulables() -> None:
    assert statuts.est_annulable(MissionStatus.DRAFT)
    assert statuts.est_annulable(MissionStatus.SUBMITTED)
    assert not statuts.est_annulable(MissionStatus.APPROVED)
    assert not statuts.est_annulable(MissionStatus.REJECTED)
    assert not statuts.est_annulable(MissionStatus.CANCELLED)


def test_statuts_terminaux() -> None:
    assert not statuts.est_final(MissionStatus.DRAFT)
    assert not statuts.est_final(MissionStatus.SUBMITTED)
    assert statuts.est_final(MissionStatus.APPROVED)
    assert statuts.est_final(MissionStatus.REJECTED)
    assert statuts.est_final(MissionStatus.CANCELLED)


def test_attente_de_decision() -> None:
    assert statuts.est_en_attente(MissionStatus.SUBMITTED)
    for statut in MissionStatus:
        if statut is not MissionStatus.SUBMITTED:
            assert not statuts.est_en_attente(statut)


def test_libelles_et_variantes() -> None:
    assert statuts.libelle(MissionStatus.SUBMITTED) == 'En attente de validation'
    assert statuts.libelle(MissionStatus.APPROVED) == 'Validé'
    for statut in MissionStatus:
        assert statuts.variante(statut).startswith('badge--')
