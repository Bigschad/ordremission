"""Journal d'audit.

Une écriture d'audit ne doit jamais faire échouer l'opération métier : les
erreurs sont signalées en console et absorbées.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog

ACTIONS = (
    'CREATED',
    'UPDATED',
    'SUBMITTED',
    'RESUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'DELETED',
    'PDF_GENERATED',
    'EMAIL_SENT',
    'EMAIL_FAILED',
    'TOKEN_REPLAYED',
    'RATE_LIMITED',
    'LOGIN',
)

LIBELLES: dict[str, str] = {
    'CREATED': 'Brouillon créé',
    'UPDATED': 'Brouillon modifié',
    'SUBMITTED': 'Soumis aux Ressources Humaines',
    'RESUBMITTED': 'Renvoyé aux Ressources Humaines',
    'APPROVED': 'Validé par les Ressources Humaines',
    'REJECTED': 'Refusé par les Ressources Humaines',
    'CANCELLED': 'Annulé par le demandeur',
    'DELETED': 'Brouillon supprimé',
    'PDF_GENERATED': 'PDF généré',
    'EMAIL_SENT': 'E-mail envoyé',
    'EMAIL_FAILED': "Échec d'envoi d'e-mail",
    'TOKEN_REPLAYED': "Tentative de réutilisation d'un lien",
    'RATE_LIMITED': 'Trop de tentatives — requête bloquée',
    'LOGIN': 'Connexion',
}


def libelle(action: str) -> str:
    return LIBELLES.get(action, action)


def journaliser(
    session: Session,
    *,
    entite: str,
    entite_id: str,
    action: str,
    acteur: str,
    ip: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Écrit une entrée d'audit, sans jamais interrompre l'appelant."""
    try:
        session.add(
            AuditLog(
                id=str(uuid.uuid4()),
                entite=entite,
                entite_id=entite_id,
                action=action,
                acteur=acteur,
                ip=ip,
                details=details,
            )
        )
        session.flush()
    except Exception as erreur:  # pragma: no cover - filet de sécurité
        print(f"Échec d'écriture du journal d'audit : {erreur}")


def historique(session: Session, mission_id: str) -> list[AuditLog]:
    """Historique d'un ordre de mission, du plus récent au plus ancien."""
    return list(
        session.scalars(
            select(AuditLog)
            .where(AuditLog.entite == 'MissionOrder', AuditLog.entite_id == mission_id)
            .order_by(AuditLog.cree_le.desc())
        )
    )
