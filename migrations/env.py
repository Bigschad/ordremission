"""Environnement Alembic.

L'URL de la base vient de `DATABASE_URL`, jamais d'`alembic.ini` : aucun secret
n'est écrit dans un fichier versionné.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv

from app.config import _normaliser_database_url
from app.db import creer_moteur
from app.models import Base

load_dotenv()

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    brut = os.environ.get('DATABASE_URL')
    if not brut:
        raise RuntimeError('DATABASE_URL est obligatoire pour exécuter les migrations.')
    return _normaliser_database_url(brut)


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
        # Indispensable sur SQLite, qui ne sait pas modifier une colonne en place.
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    moteur = creer_moteur(_url())

    with moteur.connect() as connexion:
        context.configure(
            connection=connexion,
            target_metadata=target_metadata,
            render_as_batch=connexion.dialect.name == 'sqlite',
        )
        with context.begin_transaction():
            context.run_migrations()

    moteur.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
