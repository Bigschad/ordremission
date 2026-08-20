"""Cycle de vie des jetons d'approbation (règles 6 et 7)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domaine import jetons
from app.models import ApprovalToken, MissionOrder, MissionStatus, maintenant
from tests.conftest import creer_mission, creer_utilisateur


@pytest.fixture
def mission(session: Session) -> MissionOrder:
    return creer_mission(session, creer_utilisateur(session))


class TestEmpreinte:
    def test_le_jeton_nest_jamais_stocke_en_clair(
        self, session: Session, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)

        for enregistrement in session.scalars(
            select(ApprovalToken).where(ApprovalToken.mission_id == mission.id)
        ):
            assert enregistrement.empreinte not in {paire.approuver, paire.refuser}
            assert len(enregistrement.empreinte) == 64  # SHA-256 hexadécimal

    def test_empreinte_stable_et_comparaison_constante(self) -> None:
        assert jetons.empreinte('abc') == jetons.empreinte('abc')
        assert jetons.empreinte('abc') != jetons.empreinte('abd')
        assert jetons.empreintes_egales(jetons.empreinte('abc'), jetons.empreinte('abc'))
        assert not jetons.empreintes_egales(jetons.empreinte('abc'), jetons.empreinte('abd'))

    def test_jetons_distincts_et_suffisamment_longs(
        self, session: Session, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)
        assert paire.approuver != paire.refuser
        # 32 octets encodés en base64url ⇒ 43 caractères.
        assert len(paire.approuver) >= 43


class TestEmission:
    def test_expiration_a_sept_jours(self, session: Session, mission: MissionOrder) -> None:
        instant = maintenant()
        paire = jetons.emettre(session, mission.id, instant)
        assert paire.expire_le == instant + timedelta(days=jetons.VALIDITE_JOURS)

    def test_un_jeton_par_action(self, session: Session, mission: MissionOrder) -> None:
        jetons.emettre(session, mission.id)
        actifs = list(
            session.scalars(
                select(ApprovalToken).where(
                    ApprovalToken.mission_id == mission.id, ApprovalToken.utilise_le.is_(None)
                )
            )
        )
        assert len(actifs) == 2
        assert sorted(jeton.action for jeton in actifs) == ['APPROVE', 'REJECT']

    def test_une_relance_rend_caducs_les_jetons_precedents(
        self, session: Session, mission: MissionOrder
    ) -> None:
        anciens = jetons.emettre(session, mission.id)
        nouveaux = jetons.emettre(session, mission.id)

        assert jetons.resoudre(session, anciens.approuver).motif == 'DEJA_UTILISE'
        assert jetons.resoudre(session, nouveaux.approuver).valide


class TestResolution:
    def test_accepte_un_jeton_neuf(self, session: Session, mission: MissionOrder) -> None:
        paire = jetons.emettre(session, mission.id)

        approbation = jetons.resoudre(session, paire.approuver)
        assert approbation.valide
        assert approbation.action == jetons.APPROVE
        assert approbation.mission_id == mission.id

        assert jetons.resoudre(session, paire.refuser).action == jetons.REJECT

    @pytest.mark.parametrize('valeur', ['', 'court', 'x' * 43])
    def test_refuse_un_jeton_inconnu(self, session: Session, valeur: str) -> None:
        resolution = jetons.resoudre(session, valeur)
        assert not resolution.valide
        assert resolution.motif == 'INTROUVABLE'

    def test_refuse_un_jeton_expire(self, session: Session, mission: MissionOrder) -> None:
        emis = maintenant() - timedelta(days=8)
        paire = jetons.emettre(session, mission.id, emis)

        assert jetons.resoudre(session, paire.approuver).motif == 'EXPIRE'

    def test_accepte_la_veille_de_lexpiration(
        self, session: Session, mission: MissionOrder
    ) -> None:
        emis = maintenant() - timedelta(days=6)
        paire = jetons.emettre(session, mission.id, emis)
        assert jetons.resoudre(session, paire.approuver).valide

    def test_aucun_effet_de_bord(self, session: Session, mission: MissionOrder) -> None:
        """Les scanners d'e-mails préchargent les liens : consulter ne consomme pas."""
        paire = jetons.emettre(session, mission.id)

        assert jetons.resoudre(session, paire.approuver).valide
        assert jetons.resoudre(session, paire.approuver).valide

        enregistrement = session.scalars(
            select(ApprovalToken).where(
                ApprovalToken.empreinte == jetons.empreinte(paire.approuver)
            )
        ).one()
        assert enregistrement.utilise_le is None


class TestUsageUniqueEtCaduciteCroisee:
    def test_refuse_un_jeton_consomme(self, session: Session, mission: MissionOrder) -> None:
        paire = jetons.emettre(session, mission.id)
        jetons.invalider(session, mission.id)

        assert jetons.resoudre(session, paire.approuver).motif == 'DEJA_UTILISE'

    def test_consomme_les_deux_jetons_ensemble(
        self, session: Session, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)
        assert jetons.invalider(session, mission.id) == 2

        assert not jetons.resoudre(session, paire.approuver).valide
        assert not jetons.resoudre(session, paire.refuser).valide

    def test_seconde_invalidation_sans_effet(self, session: Session, mission: MissionOrder) -> None:
        jetons.emettre(session, mission.id)
        assert jetons.invalider(session, mission.id) == 2
        assert jetons.invalider(session, mission.id) == 0

    def test_explique_quune_decision_a_ete_prise(
        self, session: Session, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)
        jetons.invalider(session, mission.id)
        mission.statut = MissionStatus.APPROVED
        session.flush()

        assert jetons.resoudre(session, paire.approuver).motif == 'DECISION_DEJA_PRISE'

    def test_signale_un_ordre_annule(self, session: Session, mission: MissionOrder) -> None:
        paire = jetons.emettre(session, mission.id)
        mission.statut = MissionStatus.CANCELLED
        session.flush()

        assert jetons.resoudre(session, paire.approuver).motif == 'ORDRE_ANNULE'

    def test_refuse_un_ordre_qui_nest_plus_en_attente(self, session: Session) -> None:
        brouillon = creer_mission(session, creer_utilisateur(session), statut=MissionStatus.DRAFT)
        paire = jetons.emettre(session, brouillon.id)

        assert jetons.resoudre(session, paire.approuver).motif == 'DECISION_DEJA_PRISE'

    def test_supprime_les_jetons_avec_lordre(self, session: Session, mission: MissionOrder) -> None:
        jetons.emettre(session, mission.id)
        session.delete(mission)
        session.flush()

        restants = session.scalars(
            select(ApprovalToken).where(ApprovalToken.mission_id == mission.id)
        ).all()
        assert not restants


def test_messages_en_francais() -> None:
    for motif, message in jetons.MOTIFS.items():
        assert message, motif
        assert message[0].isupper()
