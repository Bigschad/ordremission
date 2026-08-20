"""Fuseau et mise en forme des dates.

PORTEO GROUP est à Abidjan, en UTC+0 toute l'année (pas d'heure d'été). Le
passage explicite par ZoneInfo garde l'application correcte même exécutée sur
un serveur configuré dans un autre fuseau — Vercel tourne en UTC.
"""

from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo('Africa/Abidjan')

JOURS = ('lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche')
MOIS = (
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
)


def en_utc(valeur: datetime) -> datetime:
    """Ramène un instant en UTC, en supposant Abidjan si le fuseau est absent."""
    if valeur.tzinfo is None:
        return valeur.replace(tzinfo=FUSEAU).astimezone(UTC)
    return valeur.astimezone(UTC)


def en_local(valeur: datetime) -> datetime:
    """Exprime un instant dans le fuseau d'Abidjan."""
    if valeur.tzinfo is None:
        valeur = valeur.replace(tzinfo=UTC)
    return valeur.astimezone(FUSEAU)


def depuis_saisie(valeur: str) -> datetime:
    """Convertit une saisie `datetime-local` (« 2026-08-19T13:00 ») en UTC."""
    texte = valeur.strip()
    if len(texte) == 16:
        texte += ':00'
    return datetime.fromisoformat(texte).replace(tzinfo=FUSEAU).astimezone(UTC)


def vers_saisie(valeur: datetime) -> str:
    """Valeur pour un `<input type="datetime-local">`, en heure d'Abidjan."""
    return en_local(valeur).strftime('%Y-%m-%dT%H:%M')


def format_date(valeur: datetime) -> str:
    """`19/08/2026`"""
    return en_local(valeur).strftime('%d/%m/%Y')


def format_heure(valeur: datetime) -> str:
    """`13h00`"""
    return en_local(valeur).strftime('%Hh%M')


def format_datetime(valeur: datetime) -> str:
    """`19/08/2026 à 13h00`"""
    local = en_local(valeur)
    return f'{local.strftime("%d/%m/%Y")} à {local.strftime("%Hh%M")}'


def format_jour_mois(valeur: datetime) -> str:
    """`19/08` — utilisé dans les objets d'e-mail."""
    return en_local(valeur).strftime('%d/%m')


def format_long(valeur: datetime) -> str:
    """`mercredi 19 août 2026 à 13h00`"""
    local = en_local(valeur)
    jour = JOURS[local.weekday()]
    mois = MOIS[local.month - 1]
    return f'{jour} {local.day} {mois} {local.year} à {local.strftime("%Hh%M")}'
