"""Authentification par lien magique.

L'application n'utilise aucun mot de passe. Un collaborateur enregistré et
actif demande un lien, le reçoit par e-mail, et l'ouvre une seule fois.

Deux garde-fous d'énumération :
  - aucun e-mail n'est envoyé à une adresse inconnue ou désactivée ;
  - la réponse de l'écran de connexion est identique dans tous les cas.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import LoginToken, User, maintenant

OCTETS = 32


def empreinte(jeton: str) -> str:
    return hashlib.sha256(jeton.encode('utf-8')).hexdigest()


def emettre(session: Session, email: str, duree_minutes: int) -> str:
    """Émet un lien de connexion et invalide les précédents pour cette adresse."""
    session.execute(
        update(LoginToken)
        .where(LoginToken.email == email, LoginToken.utilise_le.is_(None))
        .values(utilise_le=maintenant())
    )

    jeton = secrets.token_urlsafe(OCTETS)
    session.add(
        LoginToken(
            id=str(uuid.uuid4()),
            empreinte=empreinte(jeton),
            email=email,
            expire_le=maintenant() + timedelta(minutes=duree_minutes),
        )
    )
    session.flush()
    return jeton


@dataclass(frozen=True)
class Verification:
    utilisateur: User | None = None
    message: str = ''

    @property
    def ok(self) -> bool:
        return self.utilisateur is not None


MESSAGE_INVALIDE = (
    "Ce lien de connexion n'est plus valable : il a déjà été utilisé, ou sa durée de "
    'validité est écoulée. Demandez-en un nouveau.'
)
MESSAGE_COMPTE = (
    "Cette adresse n'est rattachée à aucun collaborateur actif. "
    'Rapprochez-vous des Ressources Humaines.'
)


def consommer(session: Session, jeton: str, quand: datetime | None = None) -> Verification:
    """Vérifie et consomme un lien de connexion. Usage strictement unique."""
    quand = quand or maintenant()

    if not jeton or len(jeton) < 16:
        return Verification(message=MESSAGE_INVALIDE)

    enregistrement = session.scalars(
        select(LoginToken).where(LoginToken.empreinte == empreinte(jeton))
    ).one_or_none()

    if enregistrement is None or enregistrement.utilise_le is not None:
        return Verification(message=MESSAGE_INVALIDE)

    if enregistrement.expire_le <= quand:
        return Verification(message=MESSAGE_INVALIDE)

    utilisateur = session.scalars(
        select(User).where(User.email == enregistrement.email)
    ).one_or_none()

    if utilisateur is None or not utilisateur.actif:
        # Le jeton est consommé malgré tout : il ne doit pas rester rejouable.
        enregistrement.utilise_le = quand
        session.flush()
        return Verification(message=MESSAGE_COMPTE)

    enregistrement.utilise_le = quand
    utilisateur.email_verifie_le = utilisateur.email_verifie_le or quand
    session.flush()

    return Verification(utilisateur=utilisateur)


def purger(session: Session, anterieur_a: datetime) -> int:
    """Supprime les liens expirés, appelée ponctuellement."""
    resultat = session.execute(delete(LoginToken).where(LoginToken.expire_le < anterieur_a))
    return int(resultat.rowcount or 0)


def trouver_actif(session: Session, email: str) -> User | None:
    """Collaborateur enregistré **et** actif, ou `None`."""
    utilisateur = session.scalars(select(User).where(User.email == email)).one_or_none()
    return utilisateur if utilisateur is not None and utilisateur.actif else None
