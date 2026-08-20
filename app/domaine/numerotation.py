"""Numérotation des ordres de mission : `OM-{année}-{séquence sur 4 chiffres}`.

Le numéro définitif n'est attribué qu'à la **soumission**. Le schéma imposant
un numéro non nul et unique, un brouillon reçoit un numéro provisoire
`BROUILLON-…`, remplacé lors de la soumission. Ni l'interface ni le PDF
n'affichent jamais un numéro provisoire.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import est_sqlite
from app.models import Counter, maintenant

PREFIXE_BROUILLON = 'BROUILLON'
_FORMAT = re.compile(r'^OM-\d{4}-\d{4}$')


def numero_provisoire() -> str:
    """Numéro unique porté par un ordre encore en brouillon."""
    return f'{PREFIXE_BROUILLON}-{secrets.token_hex(6).upper()}'


def est_provisoire(numero: str) -> bool:
    return numero.startswith(f'{PREFIXE_BROUILLON}-')


def formater(annee: int, sequence: int) -> str:
    return f'OM-{annee}-{sequence:04d}'


def est_valide(numero: str) -> bool:
    return bool(_FORMAT.match(numero))


def affichage(numero: str) -> str:
    """Ce que voient l'utilisateur et le PDF."""
    return 'Brouillon (non numéroté)' if est_provisoire(numero) else numero


def prochaine_sequence(session: Session, annee: int) -> int:
    """Incrémente et renvoie la séquence de l'année, en sérialisant les accès.

    Sur PostgreSQL, `SELECT … FOR UPDATE` verrouille la ligne du compteur pour
    la durée de la transaction : deux soumissions simultanées ne peuvent pas
    obtenir le même numéro. SQLite n'admet qu'un seul écrivain et sérialise
    déjà tout, le verrou explicite y est donc inutile — et non supporté.
    """
    requete = select(Counter).where(Counter.annee == annee)
    if not est_sqlite():
        requete = requete.with_for_update()

    compteur = session.scalars(requete).one_or_none()

    if compteur is None:
        # `ON CONFLICT DO NOTHING` absorbe la course entre deux créations
        # simultanées de la ligne de l'année ; on relit ensuite avec verrou.
        session.execute(
            text(
                'INSERT INTO compteur (annee, sequence, modifie_le) '
                'VALUES (:annee, 0, :date) ON CONFLICT (annee) DO NOTHING'
            ),
            {'annee': annee, 'date': maintenant()},
        )
        compteur = session.scalars(requete).one()

    compteur.sequence += 1
    session.flush()
    return compteur.sequence


def attribuer(session: Session, annee: int | None = None) -> str:
    """Attribue le prochain numéro. À appeler dans la transaction de soumission."""
    annee = annee or datetime.now().year
    return formater(annee, prochaine_sequence(session, annee))
