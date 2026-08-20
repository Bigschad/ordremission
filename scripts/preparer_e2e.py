"""Prépare la base des tests de bout en bout.

    python -m scripts.preparer_e2e

Crée le schéma et deux comptes : un collaborateur et une gestionnaire RH.
Volontairement minimal — chaque scénario crée les ordres dont il a besoin.
"""

from __future__ import annotations

import os
import uuid

from app import db
from app.config import _normaliser_database_url
from app.models import Base, Role, User, maintenant

COMPTES = (
    (
        'schadrach.yeye@porteo-group.com',
        'YEYE',
        'SCHADRACH GUY-ROLAND',
        'P0117',
        'Responsable Développement & Intégration IT',
        Role.EMPLOYEE,
    ),
    (
        'rh@porteo-group.com',
        'DIALLO',
        'FATOUMATA',
        'P0042',
        'Gestionnaire des Ressources Humaines',
        Role.HR,
    ),
)


def executer() -> None:
    moteur = db.initialiser(_normaliser_database_url(os.environ['DATABASE_URL']))
    Base.metadata.create_all(moteur)

    with db.session_transaction() as session:
        for email, nom, prenoms, matricule, fonction, role in COMPTES:
            session.add(
                User(
                    id=str(uuid.uuid4()),
                    email=email,
                    nom=nom,
                    prenoms=prenoms,
                    matricule=matricule,
                    fonction=fonction,
                    role=role,
                    actif=True,
                    email_verifie_le=maintenant(),
                )
            )

    print(f'{len(COMPTES)} comptes créés.')


if __name__ == '__main__':
    executer()
