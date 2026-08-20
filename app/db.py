"""Accès à la base : moteur, sessions et différences de dialecte.

PostgreSQL (Neon) est le moteur de production. SQLite sert la démonstration et
les tests, afin de pouvoir lancer l'application sans aucune infrastructure.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

_moteur: Engine | None = None
_fabrique: sessionmaker[Session] | None = None


def est_sqlite(url: str | None = None) -> bool:
    cible: str = url if url is not None else os.environ.get('DATABASE_URL', '')
    return cible.startswith('sqlite')


def _configurer_sqlite(dbapi_connection: Any, _record: Any) -> None:
    """Réglages appliqués à chaque connexion SQLite.

    - `foreign_keys` : SQLite ne vérifie pas les clés étrangères par défaut ;
      sans ce réglage la suppression en cascade des jetons ne s'appliquerait pas.
    - `journal_mode=WAL` : autorise les lectures pendant une écriture. Sans lui,
      le serveur et le processus de test se bloquent mutuellement.
    - `busy_timeout` : attente bornée plutôt qu'échec immédiat sur verrou.
    """
    curseur = dbapi_connection.cursor()
    curseur.execute('PRAGMA foreign_keys=ON')
    curseur.execute('PRAGMA journal_mode=WAL')
    curseur.execute('PRAGMA busy_timeout=10000')
    curseur.close()


def creer_moteur(url: str) -> Engine:
    """Construit le moteur adapté à la cible.

    En serverless (Vercel + Neon), une fonction ne survit pas d'une invocation à
    l'autre : maintenir un pool de connexions n'a pas de sens et épuiserait le
    quota de connexions de Neon. `NullPool` ouvre et referme à la demande, et
    `pool_pre_ping` élimine les connexions coupées par la mise en veille.
    """
    if est_sqlite(url):
        moteur = create_engine(url, future=True)
        event.listen(moteur, 'connect', _configurer_sqlite)
        return moteur

    return create_engine(
        url,
        future=True,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={'connect_timeout': 10},
    )


def initialiser(url: str) -> Engine:
    """Installe le moteur global. Appelé une fois au démarrage."""
    global _moteur, _fabrique
    _moteur = creer_moteur(url)
    _fabrique = sessionmaker(bind=_moteur, expire_on_commit=False, future=True)
    return _moteur


def moteur() -> Engine:
    if _moteur is None:
        raise RuntimeError("La base n'est pas initialisée : appelez db.initialiser(url).")
    return _moteur


def nouvelle_session() -> Session:
    if _fabrique is None:
        raise RuntimeError("La base n'est pas initialisée : appelez db.initialiser(url).")
    return _fabrique()


@contextmanager
def session_transaction() -> Iterator[Session]:
    """Session validée à la sortie, annulée en cas d'exception."""
    session = nouvelle_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reinitialiser() -> None:
    """Libère le moteur — utilisé entre deux campagnes de test."""
    global _moteur, _fabrique
    if _moteur is not None:
        _moteur.dispose()
    _moteur = None
    _fabrique = None
