"""Décision RH : atomicité, invalidation croisée, décisions concurrentes."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domaine import decision, jetons, statuts
from app.models import AuditLog, MissionOrder, MissionStatus
from tests.conftest import creer_mission, creer_utilisateur

VALIDEUR = decision.Valideur(id=None, nom=decision.VALIDEUR_SERVICE_RH, email='rh@porteo-group.com')


@pytest.fixture
def mission(session: Session) -> MissionOrder:
    return creer_mission(session, creer_utilisateur(session))


class TestValidation:
    def test_passe_au_statut_valide_et_fige_le_valideur(
        self, session: Session, mission: MissionOrder
    ) -> None:
        resultat = decision.appliquer(
            session, mission_id=mission.id, sens=statuts.APPROVE, valideur=VALIDEUR
        )

        assert resultat.ok
        assert resultat.mission is not None
        assert resultat.mission.statut is MissionStatus.APPROVED
        assert resultat.mission.decide_par_nom == VALIDEUR.nom
        assert resultat.mission.decide_par_email == VALIDEUR.email
        assert resultat.mission.decide_le is not None
        assert resultat.mission.motif_refus is None

    def test_consomme_les_deux_jetons(self, session: Session, mission: MissionOrder) -> None:
        paire = jetons.emettre(session, mission.id)

        decision.appliquer(session, mission_id=mission.id, sens=statuts.APPROVE, valideur=VALIDEUR)

        assert not jetons.resoudre(session, paire.approuver).valide
        assert not jetons.resoudre(session, paire.refuser).valide

    def test_journalise_la_decision(self, session: Session, mission: MissionOrder) -> None:
        decision.appliquer(
            session,
            mission_id=mission.id,
            sens=statuts.APPROVE,
            valideur=VALIDEUR,
            ip='41.66.0.1',
        )

        entrees = list(session.scalars(select(AuditLog).where(AuditLog.entite_id == mission.id)))
        assert any(entree.action == 'APPROVED' for entree in entrees)
        assert any(entree.ip == '41.66.0.1' for entree in entrees)


class TestRefus:
    def test_enregistre_le_motif(self, session: Session, mission: MissionOrder) -> None:
        motif = 'Budget déplacement déjà consommé pour le mois en cours.'
        resultat = decision.appliquer(
            session,
            mission_id=mission.id,
            sens=statuts.REJECT,
            valideur=VALIDEUR,
            motif_refus=motif,
        )

        assert resultat.ok
        assert resultat.mission is not None
        assert resultat.mission.statut is MissionStatus.REJECTED
        assert resultat.mission.motif_refus == motif


class TestDecisionsSuccessives:
    def test_refuse_une_seconde_decision(self, session: Session, mission: MissionOrder) -> None:
        decision.appliquer(session, mission_id=mission.id, sens=statuts.APPROVE, valideur=VALIDEUR)

        seconde = decision.appliquer(
            session,
            mission_id=mission.id,
            sens=statuts.REJECT,
            valideur=VALIDEUR,
            motif_refus='Tentative de revirement après validation.',
        )

        assert not seconde.ok
        assert seconde.motif == 'DEJA_DECIDE'
        assert 'déjà été prise' in seconde.message

        session.expire_all()
        relue = session.get(MissionOrder, mission.id)
        assert relue is not None
        assert relue.statut is MissionStatus.APPROVED


class TestCasDErreur:
    def test_refuse_de_decider_dun_ordre_annule(self, session: Session) -> None:
        mission = creer_mission(session, creer_utilisateur(session), statut=MissionStatus.CANCELLED)

        resultat = decision.appliquer(
            session, mission_id=mission.id, sens=statuts.APPROVE, valideur=VALIDEUR
        )

        assert not resultat.ok
        assert resultat.motif == 'DEJA_DECIDE'
        assert 'annulé' in resultat.message

    def test_refuse_de_decider_dun_brouillon(self, session: Session) -> None:
        mission = creer_mission(session, creer_utilisateur(session), statut=MissionStatus.DRAFT)

        resultat = decision.appliquer(
            session, mission_id=mission.id, sens=statuts.APPROVE, valideur=VALIDEUR
        )
        assert not resultat.ok

    def test_signale_un_ordre_introuvable(self, session: Session) -> None:
        resultat = decision.appliquer(
            session, mission_id='identifiant-inexistant', sens=statuts.APPROVE, valideur=VALIDEUR
        )

        assert not resultat.ok
        assert resultat.motif == 'INTROUVABLE'
