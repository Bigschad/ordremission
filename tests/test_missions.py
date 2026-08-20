"""Cycle de vie d'un ordre de mission : brouillon, soumission, annulation, relance."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domaine import jetons, missions
from app.domaine.dates import vers_saisie
from app.domaine.validations import Saisie
from app.models import ApprovalToken, AuditLog, MissionOrder, MissionStatus, User, maintenant
from tests.conftest import creer_mission, creer_utilisateur


@pytest.fixture
def demandeur(session: Session) -> User:
    return creer_utilisateur(session)


def saisie(**surcharges: str) -> Saisie:
    depart = maintenant() + timedelta(days=7)
    valeurs = {
        'objet': 'Visite chantier',
        'lieu': 'Assinie',
        'analytique': 'IT-2026-001',
        'date_depart': vers_saisie(depart),
        'date_retour': vers_saisie(depart + timedelta(hours=9)),
        'transport_type': 'VEHICULE_ETABLISSEMENT',
        'transport_detail': '1234 AB 01',
        'litres_gasoil': '40',
    }
    valeurs.update(surcharges)
    return Saisie(**valeurs)


def actions(session: Session, mission_id: str) -> list[str]:
    return list(
        session.scalars(
            select(AuditLog.action)
            .where(AuditLog.entite_id == mission_id)
            .order_by(AuditLog.cree_le, AuditLog.id)
        )
    )


# ---------------------------------------------------------------------------
# Brouillon
# ---------------------------------------------------------------------------


def test_un_brouillon_incomplet_est_accepte(session: Session, demandeur: User) -> None:
    """On doit pouvoir enregistrer une saisie partielle et y revenir plus tard."""
    issue = missions.creer_brouillon(session, demandeur, Saisie(objet='À préciser'))

    assert issue.ok
    assert issue.mission is not None
    assert issue.mission.statut is MissionStatus.DRAFT
    assert issue.mission.objet == 'À préciser'
    assert issue.message == 'Brouillon enregistré.'


def test_un_brouillon_porte_un_numero_provisoire(session: Session, demandeur: User) -> None:
    """Aucun numéro définitif n'est consommé tant que l'ordre n'est pas soumis."""
    issue = missions.creer_brouillon(session, demandeur, saisie())

    assert issue.mission is not None
    assert issue.mission.numero.startswith('BROUILLON-')


def test_le_brouillon_fige_lidentite_du_demandeur(session: Session, demandeur: User) -> None:
    issue = missions.creer_brouillon(session, demandeur, saisie())

    assert issue.mission is not None
    assert issue.mission.matricule == demandeur.matricule
    assert issue.mission.fonction == demandeur.fonction


def test_modifier_un_brouillon_met_a_jour_les_champs(session: Session, demandeur: User) -> None:
    mission = missions.creer_brouillon(session, demandeur, saisie()).mission
    assert mission is not None

    issue = missions.modifier_brouillon(
        session, mission, saisie(lieu='Grand-Bassam', litres_gasoil='25'), demandeur
    )

    assert issue.ok
    assert mission.lieu == 'Grand-Bassam'
    assert str(mission.litres_gasoil) == '25'
    assert actions(session, mission.id) == ['CREATED', 'UPDATED']


def test_un_ordre_soumis_nest_plus_modifiable(session: Session, demandeur: User) -> None:
    """Règle 5."""
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)

    issue = missions.modifier_brouillon(session, mission, saisie(), demandeur)

    assert issue.ok is False
    assert issue.erreur


def test_un_brouillon_est_supprimable(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.DRAFT)
    identifiant = mission.id

    issue = missions.supprimer_brouillon(session, mission, demandeur)
    session.commit()

    assert issue.ok
    assert issue.message == 'Brouillon supprimé.'
    assert session.get(MissionOrder, identifiant) is None
    # La trace de suppression survit à l'ordre lui-même.
    assert 'DELETED' in actions(session, identifiant)


def test_un_ordre_soumis_nest_pas_supprimable(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)

    issue = missions.supprimer_brouillon(session, mission, demandeur)

    assert issue.ok is False
    assert session.get(MissionOrder, mission.id) is not None


# ---------------------------------------------------------------------------
# Soumission
# ---------------------------------------------------------------------------


def test_la_soumission_attribue_le_numero_et_emet_les_jetons(
    session: Session, demandeur: User
) -> None:
    mission = missions.creer_brouillon(session, demandeur, saisie()).mission
    assert mission is not None

    issue = missions.soumettre(session, mission, saisie(), demandeur)
    session.commit()

    assert issue.ok
    assert issue.jetons is not None
    assert mission.statut is MissionStatus.SUBMITTED
    assert mission.numero == f'OM-{maintenant().year}-0001'
    assert mission.soumis_le is not None
    assert issue.message.endswith('soumis aux Ressources Humaines.')

    emis = session.scalars(
        select(ApprovalToken).where(ApprovalToken.mission_id == mission.id)
    ).all()
    assert sorted(jeton.action for jeton in emis) == ['APPROVE', 'REJECT']


def test_une_soumission_invalide_ne_consomme_aucun_numero(
    session: Session, demandeur: User
) -> None:
    """Le numéro et le passage à SUBMITTED se font dans la même transaction."""
    mission = missions.creer_brouillon(session, demandeur, saisie()).mission
    assert mission is not None
    provisoire = mission.numero

    issue = missions.soumettre(session, mission, saisie(lieu=''), demandeur)

    assert issue.ok is False
    assert issue.erreurs_champs['lieu']
    assert mission.numero == provisoire
    assert mission.statut is MissionStatus.DRAFT
    assert session.scalars(select(ApprovalToken)).all() == []


def test_soumettre_deux_fois_est_refuse(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)

    issue = missions.soumettre(session, mission, saisie(), demandeur)

    assert issue.ok is False
    assert issue.jetons is None


# ---------------------------------------------------------------------------
# Annulation (règle 6)
# ---------------------------------------------------------------------------


def test_annuler_invalide_les_jetons_en_circulation(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)
    paire = jetons.emettre(session, mission.id)
    session.flush()

    issue = missions.annuler(session, mission, demandeur)
    session.commit()

    assert issue.ok
    assert mission.statut is MissionStatus.CANCELLED
    for jeton in (paire.approuver, paire.refuser):
        resolution = jetons.resoudre(session, jeton)
        assert resolution.valide is False
        assert resolution.motif == 'ORDRE_ANNULE'


def test_un_ordre_deja_valide_ne_peut_plus_etre_annule(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.APPROVED)

    issue = missions.annuler(session, mission, demandeur)

    assert issue.ok is False
    assert mission.statut is MissionStatus.APPROVED


def test_un_brouillon_est_annulable_sans_avoir_ete_soumis(
    session: Session, demandeur: User
) -> None:
    """La table de transitions autorise CANCEL depuis DRAFT comme depuis SUBMITTED."""
    mission = creer_mission(session, demandeur, statut=MissionStatus.DRAFT)

    assert missions.annuler(session, mission, demandeur).ok
    assert mission.statut is MissionStatus.CANCELLED


# ---------------------------------------------------------------------------
# Relance
# ---------------------------------------------------------------------------


def test_relancer_emet_de_nouveaux_jetons_et_perime_les_anciens(
    session: Session, demandeur: User
) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)
    ancienne = jetons.emettre(session, mission.id)
    session.flush()

    issue = missions.relancer(session, mission, demandeur)
    session.commit()

    assert issue.ok
    assert issue.jetons is not None
    assert mission.relances == 1
    assert '1/3' in issue.message
    assert jetons.resoudre(session, ancienne.approuver).valide is False
    assert jetons.resoudre(session, issue.jetons.approuver).valide is True


def test_le_nombre_de_relances_est_plafonne(session: Session, demandeur: User) -> None:
    mission = creer_mission(session, demandeur, statut=MissionStatus.SUBMITTED)

    for tour in range(missions.RELANCES_MAX):
        assert missions.relancer(session, mission, demandeur).ok, tour

    refus = missions.relancer(session, mission, demandeur)

    assert refus.ok is False
    assert 'limite de 3 renvois' in refus.erreur
    assert mission.relances == missions.RELANCES_MAX


def test_seul_un_ordre_en_attente_peut_etre_relance(session: Session, demandeur: User) -> None:
    for statut in (MissionStatus.DRAFT, MissionStatus.APPROVED, MissionStatus.CANCELLED):
        mission = creer_mission(session, demandeur, statut=statut)
        assert missions.relancer(session, mission, demandeur).ok is False, statut
