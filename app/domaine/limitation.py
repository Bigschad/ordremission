"""Limitation de débit à fenêtre fixe, stockée en base.

L'offre gratuite exclut Redis : PostgreSQL fait l'affaire, à raison d'une
écriture par requête protégée — négligeable face aux quotas Neon.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import RateLimit, maintenant


@dataclass(frozen=True)
class Politique:
    limite: int
    fenetre_secondes: int


POLITIQUES: dict[str, Politique] = {
    # Envoi de lien de connexion : par adresse, puis par IP.
    'connexion_email': Politique(limite=5, fenetre_secondes=15 * 60),
    'connexion_ip': Politique(limite=20, fenetre_secondes=15 * 60),
    # Consultation d'un lien d'approbation.
    'approbation_ip': Politique(limite=30, fenetre_secondes=15 * 60),
    # Vérification publique d'authenticité.
    'verification_ip': Politique(limite=60, fenetre_secondes=15 * 60),
}


@dataclass(frozen=True)
class Resultat:
    autorise: bool
    restant: int
    reinitialisation_a: datetime


def debut_fenetre(instant: datetime, fenetre_secondes: int) -> datetime:
    """Début de la fenêtre courante, aligné sur des bornes fixes."""
    largeur = fenetre_secondes
    horodatage = int(instant.timestamp())
    return datetime.fromtimestamp((horodatage // largeur) * largeur, tz=UTC)


def consommer(
    session: Session,
    cle: str,
    politique: Politique,
    instant: datetime | None = None,
) -> Resultat:
    """Consomme un jeton.

    En cas d'indisponibilité de la base, la requête est **autorisée** : la
    limitation de débit ne doit pas rendre l'application inutilisable.
    """
    instant = instant or maintenant()
    debut = debut_fenetre(instant, politique.fenetre_secondes)
    reinitialisation = debut + timedelta(seconds=politique.fenetre_secondes)

    try:
        ligne = session.scalars(
            select(RateLimit).where(RateLimit.cle == cle, RateLimit.fenetre_debut == debut)
        ).one_or_none()

        if ligne is None:
            ligne = RateLimit(id=str(uuid.uuid4()), cle=cle, fenetre_debut=debut, compteur=0)
            session.add(ligne)
            try:
                session.flush()
            except IntegrityError:
                # Course entre deux requêtes simultanées : on relit la ligne
                # créée par l'autre plutôt que d'échouer.
                session.rollback()
                ligne = session.scalars(
                    select(RateLimit).where(RateLimit.cle == cle, RateLimit.fenetre_debut == debut)
                ).one()

        ligne.compteur += 1
        session.flush()
        compteur = ligne.compteur

    except Exception as erreur:  # pragma: no cover - filet de sécurité
        print(f'Limitation de débit indisponible, requête autorisée : {erreur}')
        return Resultat(True, politique.limite, reinitialisation)

    return Resultat(
        autorise=compteur <= politique.limite,
        restant=max(0, politique.limite - compteur),
        reinitialisation_a=reinitialisation,
    )


def purger(session: Session, anterieur_a: datetime) -> int:
    """Supprime les fenêtres expirées.

    Appelée ponctuellement depuis les points d'entrée protégés : l'offre
    gratuite interdit tout cron plus fréquent qu'une fois par jour.
    """
    try:
        resultat = session.execute(delete(RateLimit).where(RateLimit.fenetre_debut < anterieur_a))
        return int(resultat.rowcount or 0)
    except Exception as erreur:  # pragma: no cover
        print(f'Échec de purge de la limitation de débit : {erreur}')
        return 0
