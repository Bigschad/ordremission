"""Fixtures partagées.

La campagne s'exécute sur **SQLite en mémoire de fichier temporaire** : aucune
infrastructure n'est requise. PostgreSQL reste le moteur de production ; les
tests qui valident ses garanties propres sont marqués `postgres` et ignorés
tant que `TEST_DATABASE_URL` ne pointe pas sur une base PostgreSQL.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from datetime import timedelta
from decimal import Decimal

import pytest
from flask import Flask
from flask.testing import FlaskClient
from sqlalchemy.orm import Session

from app import creer_app, db
from app.config import Config, _entetes_securite, _normaliser_database_url
from app.models import Base, MissionOrder, MissionStatus, Role, TransportType, User, maintenant


def _url_test(tmp_path_factory: pytest.TempPathFactory) -> str:
    brut = os.environ.get('TEST_DATABASE_URL')
    if brut:
        return _normaliser_database_url(brut)

    fichier = tmp_path_factory.mktemp('base') / 'test.db'
    return f'sqlite:///{fichier}'


@pytest.fixture(scope='session')
def url_base(tmp_path_factory: pytest.TempPathFactory) -> str:
    return _url_test(tmp_path_factory)


@pytest.fixture(scope='session')
def config(url_base: str, tmp_path_factory: pytest.TempPathFactory) -> Config:
    return Config(
        database_url=url_base,
        secret_key='secret-de-test-uniquement',
        app_url='http://localhost:5000',
        email_from='Ordres de mission Porteo <om@porteo-group.com>',
        hr_emails=('rh@porteo-group.com',),
        resend_api_key='',
        email_transport='fichier',
        nom_application='Ordres de mission — PORTEO GROUP',
        debug=False,
        entetes_securite=_entetes_securite(),
    )


@pytest.fixture(scope='session')
def app(config: Config) -> Iterator[Flask]:
    application = creer_app(config)
    # Les formulaires sont testés par leur logique, pas par le jeton CSRF.
    application.config['WTF_CSRF_ENABLED'] = False

    Base.metadata.create_all(db.moteur())
    yield application
    Base.metadata.drop_all(db.moteur())
    db.reinitialiser()


@pytest.fixture
def session(app: Flask) -> Iterator[Session]:
    """Session de base, vidée des données métier avant chaque test."""
    with db.session_transaction() as sess:
        for table in reversed(Base.metadata.sorted_tables):
            sess.execute(table.delete())

    sess = db.nouvelle_session()
    try:
        yield sess
        sess.commit()
    finally:
        sess.close()


def rafraichir(session: Session) -> None:
    """Repart d'une transaction neuve.

    L'application ouvre sa propre session par requête. Tant que la session du
    test garde une transaction ouverte, SQLite lui sert l'instantané pris à sa
    première lecture : les écritures faites par l'application resteraient
    invisibles. Valider libère la transaction, expirer force la relecture.
    """
    session.commit()
    session.expire_all()


@pytest.fixture
def client(app: Flask, session: Session, boite_vide: None) -> FlaskClient:
    return app.test_client()


@pytest.fixture
def boite_vide() -> Iterator[None]:
    """Vide la boîte aux lettres du transport de test."""
    import shutil

    from app.emails.transport import BOITE

    shutil.rmtree(BOITE, ignore_errors=True)
    yield
    shutil.rmtree(BOITE, ignore_errors=True)


# ---------------------------------------------------------------------------
# Fabriques
# ---------------------------------------------------------------------------

_compteur = 0


def _suivant() -> int:
    global _compteur
    _compteur += 1
    return _compteur


def creer_utilisateur(
    session: Session,
    *,
    nom: str = 'YEYE',
    prenoms: str = 'SCHADRACH GUY-ROLAND',
    fonction: str = 'Responsable Développement & Intégration IT',
    role: Role = Role.EMPLOYEE,
    actif: bool = True,
    email: str | None = None,
) -> User:
    numero = _suivant()
    utilisateur = User(
        id=str(uuid.uuid4()),
        nom=nom,
        prenoms=prenoms,
        matricule=f'T{numero:04d}',
        fonction=fonction,
        email=email or f'test{numero}@porteo-group.com',
        role=role,
        actif=actif,
        email_verifie_le=maintenant(),
    )
    session.add(utilisateur)
    # Validé et non simplement vidé : l'application lit dans sa propre session,
    # et une transaction d'écriture laissée ouverte verrouillerait SQLite.
    session.commit()
    return utilisateur


def creer_mission(
    session: Session,
    demandeur: User,
    *,
    statut: MissionStatus = MissionStatus.SUBMITTED,
    numero: str | None = None,
    objet: str = 'Visite chantier',
    lieu: str = 'Assinie',
) -> MissionOrder:
    numero_ligne = _suivant()
    depart = maintenant() + timedelta(days=7)

    mission = MissionOrder(
        id=str(uuid.uuid4()),
        numero=numero or f'TEST-{numero_ligne:04d}',
        demandeur_id=demandeur.id,
        nom=demandeur.nom,
        prenoms=demandeur.prenoms,
        matricule=demandeur.matricule,
        fonction=demandeur.fonction,
        objet=objet,
        lieu=lieu,
        date_depart=depart,
        date_retour=depart + timedelta(hours=4),
        transport_type=TransportType.VEHICULE_ETABLISSEMENT,
        transport_detail='1234 AB 01',
        litres_gasoil=Decimal('40'),
        statut=statut,
        soumis_le=None if statut is MissionStatus.DRAFT else maintenant(),
    )
    session.add(mission)
    session.commit()
    return mission


def connecter(client: FlaskClient, utilisateur: User) -> None:
    """Ouvre une session applicative sans passer par le lien magique."""
    from app.web.securite import CLEF_SESSION

    with client.session_transaction() as session_client:
        session_client[CLEF_SESSION] = utilisateur.id
