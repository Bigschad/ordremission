"""Jetons transmis aux Ressources Humaines par e-mail.

Règle 7 : usage unique, validité 7 jours, et **caducité croisée** — dès qu'une
décision est prise, les deux jetons (Valider et Refuser) sont consommés
ensemble. Seule l'empreinte SHA-256 est stockée : une fuite de la base ne
permet pas de rejouer un lien.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import ApprovalToken, MissionOrder, MissionStatus, maintenant

VALIDITE_JOURS = 7
OCTETS = 32

APPROVE = 'APPROVE'
REJECT = 'REJECT'


def empreinte(jeton: str) -> str:
    """Empreinte stockée en base. Le jeton en clair ne quitte jamais l'e-mail."""
    return hashlib.sha256(jeton.encode('utf-8')).hexdigest()


def empreintes_egales(a: str, b: str) -> bool:
    """Comparaison à temps constant."""
    return hmac.compare_digest(a, b)


def generer() -> str:
    return secrets.token_urlsafe(OCTETS)


def expiration(depuis: datetime | None = None) -> datetime:
    return (depuis or maintenant()) + timedelta(days=VALIDITE_JOURS)


@dataclass(frozen=True)
class Paire:
    """Les deux jetons émis pour un ordre de mission, en clair."""

    approuver: str
    refuser: str
    expire_le: datetime


def invalider(session: Session, mission_id: str, quand: datetime | None = None) -> int:
    """Consomme tous les jetons encore actifs d'un ordre de mission."""
    resultat = session.execute(
        update(ApprovalToken)
        .where(ApprovalToken.mission_id == mission_id, ApprovalToken.utilise_le.is_(None))
        .values(utilise_le=quand or maintenant())
    )
    session.flush()
    return int(resultat.rowcount or 0)


def emettre(session: Session, mission_id: str, quand: datetime | None = None) -> Paire:
    """Émet la paire de jetons d'un ordre de mission.

    Les jetons déjà en circulation sont invalidés au passage : une relance
    « Renvoyer aux RH » rend caducs les liens du message précédent.
    """
    quand = quand or maintenant()
    invalider(session, mission_id, quand)

    approuver, refuser = generer(), generer()
    expire = expiration(quand)

    for jeton, action in ((approuver, APPROVE), (refuser, REJECT)):
        session.add(
            ApprovalToken(
                id=str(uuid.uuid4()),
                empreinte=empreinte(jeton),
                mission_id=mission_id,
                action=action,
                expire_le=expire,
            )
        )

    session.flush()
    return Paire(approuver=approuver, refuser=refuser, expire_le=expire)


MOTIFS: dict[str, str] = {
    'INTROUVABLE': "Ce lien n'est pas valide. Vérifiez que vous avez copié l'adresse en entier.",
    'DEJA_UTILISE': 'Ce lien a déjà été utilisé. Un lien de validation ne peut servir '
    "qu'une seule fois.",
    'EXPIRE': f'Ce lien a expiré : sa durée de validité est de {VALIDITE_JOURS} jours. '
    'Demandez au collaborateur de renvoyer sa demande.',
    'DECISION_DEJA_PRISE': 'Une décision a déjà été prise sur cet ordre de mission : '
    "ce lien n'a plus d'effet.",
    'ORDRE_ANNULE': "Cet ordre de mission a été annulé par son demandeur : ce lien n'a plus d'effet.",
}


@dataclass(frozen=True)
class Resolution:
    valide: bool
    mission_id: str | None = None
    action: str | None = None
    motif: str | None = None

    @property
    def message(self) -> str:
        return MOTIFS.get(self.motif or 'INTROUVABLE', MOTIFS['INTROUVABLE'])


def resoudre(session: Session, jeton: str, quand: datetime | None = None) -> Resolution:
    """Vérifie un jeton **sans le consommer**.

    La page `/approve/{jeton}` doit pouvoir s'afficher sur un simple GET sans
    produire d'effet de bord : les scanners d'e-mails préchargent les liens.
    """
    quand = quand or maintenant()

    if not jeton or len(jeton) < 16:
        return Resolution(False, motif='INTROUVABLE')

    enregistrement = session.scalars(
        select(ApprovalToken).where(ApprovalToken.empreinte == empreinte(jeton))
    ).one_or_none()

    if enregistrement is None:
        return Resolution(False, motif='INTROUVABLE')

    mission = session.get(MissionOrder, enregistrement.mission_id)
    statut = mission.statut if mission else None

    if enregistrement.utilise_le is not None:
        # La décision prise explique mieux la situation qu'un « déjà utilisé ».
        if statut in {MissionStatus.APPROVED, MissionStatus.REJECTED}:
            return Resolution(False, motif='DECISION_DEJA_PRISE')
        if statut is MissionStatus.CANCELLED:
            return Resolution(False, motif='ORDRE_ANNULE')
        return Resolution(False, motif='DEJA_UTILISE')

    if enregistrement.expire_le <= quand:
        return Resolution(False, motif='EXPIRE')

    if statut is MissionStatus.CANCELLED:
        return Resolution(False, motif='ORDRE_ANNULE')

    if statut is not MissionStatus.SUBMITTED:
        return Resolution(False, motif='DECISION_DEJA_PRISE')

    return Resolution(True, mission_id=enregistrement.mission_id, action=enregistrement.action)
