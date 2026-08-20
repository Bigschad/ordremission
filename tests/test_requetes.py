"""Règle 9 : cloisonnement des ordres de mission selon le rôle."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.domaine import requetes
from app.models import MissionStatus, Role, maintenant
from tests.conftest import creer_mission, creer_utilisateur


class TestPortee:
    def test_un_collaborateur_est_restreint_a_ses_ordres(self, session: Session) -> None:
        collaborateur = creer_utilisateur(session, role=Role.EMPLOYEE)
        assert not requetes.a_vue_globale(collaborateur)
        assert not requetes.est_admin(collaborateur)

    def test_rh_et_admin_ont_la_vue_globale(self, session: Session) -> None:
        assert requetes.a_vue_globale(creer_utilisateur(session, role=Role.HR))
        assert requetes.a_vue_globale(creer_utilisateur(session, role=Role.ADMIN))
        assert requetes.est_admin(creer_utilisateur(session, role=Role.ADMIN))


class TestLectureUnitaire:
    def test_lordre_dautrui_est_indiscernable_dun_ordre_inexistant(self, session: Session) -> None:
        proprietaire = creer_utilisateur(session)
        intrus = creer_utilisateur(session)
        mission = creer_mission(session, proprietaire)

        assert requetes.trouver(session, proprietaire, mission.id) is not None
        assert requetes.trouver(session, intrus, mission.id) is None
        assert requetes.trouver(session, proprietaire, 'inexistant') is None

    def test_les_rh_consultent_tout(self, session: Session) -> None:
        collaborateur = creer_utilisateur(session)
        rh = creer_utilisateur(session, role=Role.HR)
        mission = creer_mission(session, collaborateur)

        assert requetes.trouver(session, rh, mission.id) is not None


class TestListePersonnelle:
    def test_ne_renvoie_que_ses_ordres_et_filtre_par_statut(self, session: Session) -> None:
        premier = creer_utilisateur(session)
        second = creer_utilisateur(session)

        creer_mission(session, premier, statut=MissionStatus.DRAFT)
        creer_mission(session, premier, statut=MissionStatus.SUBMITTED)
        creer_mission(session, second, statut=MissionStatus.SUBMITTED)

        assert len(requetes.mes_missions(session, premier)) == 2
        assert len(requetes.mes_missions(session, premier, MissionStatus.DRAFT)) == 1
        assert len(requetes.mes_missions(session, second)) == 1


class TestFileRH:
    def test_filtre_par_statut_demandeur_lieu_et_periode(self, session: Session) -> None:
        yeye = creer_utilisateur(session, nom='YEYE')
        bamba = creer_utilisateur(session, nom='BAMBA')

        creer_mission(session, yeye, statut=MissionStatus.SUBMITTED, lieu='Assinie')
        creer_mission(session, yeye, statut=MissionStatus.APPROVED, lieu='Bouaké')
        creer_mission(session, bamba, statut=MissionStatus.SUBMITTED, lieu='Korhogo')

        assert requetes.file_rh(session, requetes.Filtres()).total == 3
        assert (
            requetes.file_rh(session, requetes.Filtres(statut=MissionStatus.SUBMITTED)).total == 2
        )
        assert requetes.file_rh(session, requetes.Filtres(demandeur_id=yeye.id)).total == 2
        assert requetes.file_rh(session, requetes.Filtres(lieu='assinie')).total == 1

        hier = maintenant() - timedelta(days=1)
        assert requetes.file_rh(session, requetes.Filtres(du=hier)).total == 3
        assert requetes.file_rh(session, requetes.Filtres(au=hier)).total == 0

    def test_recherche_multi_champs(self, session: Session) -> None:
        utilisateur = creer_utilisateur(session)
        creer_mission(session, utilisateur, numero='OM-2026-0042', objet='Visite chantier')

        for terme in ('OM-2026-0042', 'yeye', utilisateur.matricule, 'chantier', 'Assinie'):
            assert requetes.file_rh(session, requetes.Filtres(recherche=terme)).total == 1

        assert requetes.file_rh(session, requetes.Filtres(recherche='introuvable')).total == 0
        # Une recherche vide n'ajoute aucune contrainte.
        assert requetes.file_rh(session, requetes.Filtres(recherche='   ')).total == 1

    def test_pagination_et_tri(self, session: Session) -> None:
        utilisateur = creer_utilisateur(session)
        for index in range(5):
            creer_mission(session, utilisateur, numero=f'OM-2026-000{index}')

        page1 = requetes.file_rh(session, requetes.Filtres(par_page=2, page=1))
        assert len(page1.missions) == 2
        assert page1.nb_pages == 3

        page3 = requetes.file_rh(session, requetes.Filtres(par_page=2, page=3))
        assert len(page3.missions) == 1

        for tri in requetes.TRIS_VALIDES:
            assert len(requetes.file_rh(session, requetes.Filtres(tri=tri)).missions) == 5

        par_numero = requetes.file_rh(session, requetes.Filtres(tri='numero'))
        assert par_numero.missions[0].numero == 'OM-2026-0000'

    def test_export_sans_pagination(self, session: Session) -> None:
        utilisateur = creer_utilisateur(session)
        for index in range(25):
            creer_mission(session, utilisateur, numero=f'OM-2026-{index:04d}')

        assert len(requetes.pour_export(session, requetes.Filtres())) == 25
        assert not requetes.pour_export(session, requetes.Filtres(statut=MissionStatus.DRAFT))


class TestCompteurs:
    def test_zero_pour_les_statuts_absents(self, session: Session) -> None:
        utilisateur = creer_utilisateur(session)
        creer_mission(session, utilisateur, statut=MissionStatus.SUBMITTED)
        creer_mission(session, utilisateur, statut=MissionStatus.SUBMITTED)
        creer_mission(session, utilisateur, statut=MissionStatus.APPROVED)

        compteurs = requetes.compter_par_statut(session)
        assert compteurs[MissionStatus.SUBMITTED] == 2
        assert compteurs[MissionStatus.APPROVED] == 1
        assert compteurs[MissionStatus.DRAFT] == 0
        assert compteurs[MissionStatus.CANCELLED] == 0

    def test_restriction_a_un_demandeur(self, session: Session) -> None:
        premier = creer_utilisateur(session)
        second = creer_utilisateur(session)
        creer_mission(session, premier, statut=MissionStatus.SUBMITTED)
        creer_mission(session, second, statut=MissionStatus.SUBMITTED)

        compteurs = requetes.compter_par_statut(session, premier.id)
        assert compteurs[MissionStatus.SUBMITTED] == 1


class TestVerificationPublique:
    def test_trouve_par_numero(self, session: Session) -> None:
        utilisateur = creer_utilisateur(session)
        creer_mission(session, utilisateur, numero='OM-2026-0001')

        assert requetes.trouver_par_numero(session, 'OM-2026-0001') is not None
        assert requetes.trouver_par_numero(session, 'OM-1999-0001') is None

    def test_liste_des_demandeurs(self, session: Session) -> None:
        avec = creer_utilisateur(session)
        creer_utilisateur(session)  # sans ordre de mission
        creer_mission(session, avec)

        demandeurs = requetes.demandeurs(session)
        assert [personne.id for personne in demandeurs] == [avec.id]
