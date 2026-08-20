"""Numérotation des ordres de mission, y compris sous concurrence."""

from __future__ import annotations

import os
import threading

import pytest
from sqlalchemy.orm import Session

from app import db
from app.domaine import numerotation
from app.models import Counter

SUR_POSTGRES = 'postgres' in os.environ.get('TEST_DATABASE_URL', '')


class TestMiseEnForme:
    def test_numero_sur_quatre_chiffres(self) -> None:
        assert numerotation.formater(2026, 1) == 'OM-2026-0001'
        assert numerotation.formater(2026, 42) == 'OM-2026-0042'
        assert numerotation.formater(2026, 9999) == 'OM-2026-9999'

    @pytest.mark.parametrize(
        ('valeur', 'attendu'),
        [('OM-2026-0001', True), ('OM-2026-1', False), ('2026-0001', False), ('', False)],
    )
    def test_reconnait_un_numero_valide(self, valeur: str, attendu: bool) -> None:
        assert numerotation.est_valide(valeur) is attendu

    def test_distingue_provisoire_et_definitif(self) -> None:
        assert numerotation.est_provisoire(numerotation.numero_provisoire())
        assert not numerotation.est_provisoire('OM-2026-0001')

    def test_numeros_provisoires_distincts(self) -> None:
        assert len({numerotation.numero_provisoire() for _ in range(500)}) == 500

    def test_affichage_masque_le_numero_provisoire(self) -> None:
        assert numerotation.affichage('OM-2026-0001') == 'OM-2026-0001'
        assert numerotation.affichage('BROUILLON-ABC') == 'Brouillon (non numéroté)'


class TestSequence:
    def test_demarre_a_un_et_sincremente(self, session: Session) -> None:
        assert numerotation.prochaine_sequence(session, 2026) == 1
        assert numerotation.prochaine_sequence(session, 2026) == 2
        assert numerotation.prochaine_sequence(session, 2026) == 3

    def test_sequence_independante_par_annee(self, session: Session) -> None:
        assert numerotation.prochaine_sequence(session, 2026) == 1
        assert numerotation.prochaine_sequence(session, 2027) == 1
        assert numerotation.prochaine_sequence(session, 2026) == 2

    def test_attribue_un_numero_complet(self, session: Session) -> None:
        assert numerotation.attribuer(session, 2026) == 'OM-2026-0001'
        assert numerotation.attribuer(session, 2026) == 'OM-2026-0002'


@pytest.mark.postgres
@pytest.mark.skipif(
    not SUR_POSTGRES,
    reason='Le verrou de ligne SELECT … FOR UPDATE est propre à PostgreSQL ; '
    "SQLite n'admet qu'un seul écrivain et la question ne s'y pose pas.",
)
class TestConcurrence:
    def test_cinquante_soumissions_simultanees(self, session: Session) -> None:
        """Aucune collision, aucun trou dans la séquence."""
        nombre = 50
        numeros: list[str] = []
        verrou = threading.Lock()

        def attribuer() -> None:
            with db.session_transaction() as locale:
                numero = numerotation.attribuer(locale, 2026)
            with verrou:
                numeros.append(numero)

        fils = [threading.Thread(target=attribuer) for _ in range(nombre)]
        for fil in fils:
            fil.start()
        for fil in fils:
            fil.join()

        assert len(set(numeros)) == nombre

        sequences = sorted(int(numero[-4:]) for numero in numeros)
        assert sequences == list(range(1, nombre + 1))

        session.expire_all()
        compteur = session.get(Counter, 2026)
        assert compteur is not None
        assert compteur.sequence == nombre
