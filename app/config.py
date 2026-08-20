"""Configuration de l'application, lue depuis l'environnement.

Aucun secret n'est écrit en dur : tout provient de variables d'environnement,
documentées dans `.env.example`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

# Fuseau de référence de PORTEO GROUP. Abidjan est en UTC+0 toute l'année.
FUSEAU = 'Africa/Abidjan'


class ConfigurationInvalide(RuntimeError):
    """Une variable d'environnement obligatoire est absente ou incohérente."""


def _obligatoire(nom: str) -> str:
    valeur = os.environ.get(nom, '').strip()
    if not valeur:
        raise ConfigurationInvalide(
            f"La variable d'environnement {nom} est obligatoire. "
            'Voir .env.example pour la liste complète.'
        )
    return valeur


def _facultatif(nom: str, defaut: str = '') -> str:
    return os.environ.get(nom, defaut).strip()


@dataclass(frozen=True)
class Config:
    """Instantané de la configuration, figé au démarrage."""

    database_url: str
    secret_key: str
    app_url: str
    email_from: str
    hr_emails: tuple[str, ...]
    resend_api_key: str
    email_transport: str
    nom_application: str
    debug: bool = False

    # Réglages métier, rarement modifiés.
    duree_lien_connexion_minutes: int = 15
    duree_jeton_approbation_jours: int = 7
    relances_max: int = 3

    entetes_securite: dict[str, str] = field(default_factory=dict)

    @property
    def est_sqlite(self) -> bool:
        return self.database_url.startswith('sqlite')

    def url_verification(self, numero: str) -> str:
        return f'{self.app_url}/verify/{numero}'


def _normaliser_database_url(brut: str) -> str:
    """Ramène les variantes rencontrées à un DSN SQLAlchemy.

    Neon et la plupart des hébergeurs distribuent des URL `postgres://` ou
    `postgresql://`, que SQLAlchemy attend sous la forme `postgresql+psycopg://`
    pour utiliser le pilote psycopg 3.
    """
    if brut.startswith('postgres://'):
        brut = 'postgresql://' + brut[len('postgres://') :]

    if brut.startswith('postgresql://'):
        return 'postgresql+psycopg://' + brut[len('postgresql://') :]

    return brut


def charger_config() -> Config:
    """Construit la configuration, en vérifiant ce qui est indispensable."""
    transport = _facultatif('EMAIL_TRANSPORT', 'resend').lower()
    if transport not in {'resend', 'fichier'}:
        raise ConfigurationInvalide(
            'EMAIL_TRANSPORT doit valoir « resend » ou « fichier » (mode test).'
        )

    hr = tuple(
        adresse.strip()
        for adresse in _facultatif('HR_EMAIL', 'rh@porteo-group.com').split(',')
        if adresse.strip()
    )
    if not hr:
        raise ConfigurationInvalide('HR_EMAIL doit contenir au moins une adresse.')

    app_url = _facultatif('APP_URL', 'http://localhost:5000').rstrip('/')

    return Config(
        database_url=_normaliser_database_url(_obligatoire('DATABASE_URL')),
        secret_key=_obligatoire('SECRET_KEY'),
        app_url=app_url,
        email_from=_facultatif('EMAIL_FROM', 'Ordres de mission Porteo <om@porteo-group.com>'),
        hr_emails=hr,
        resend_api_key=_facultatif('RESEND_API_KEY'),
        email_transport=transport,
        nom_application=_facultatif('APP_NAME', 'Ordres de mission — PORTEO GROUP'),
        debug=_facultatif('FLASK_DEBUG', '') in {'1', 'true', 'True'},
        entetes_securite=_entetes_securite(),
    )


def _entetes_securite() -> dict[str, str]:
    """En-têtes appliqués à chaque réponse.

    La CSP autorise `unsafe-inline` sur les styles : quelques largeurs sont
    calculées côté serveur et injectées en attribut `style`. Aucun script
    externe n'est chargé, et `frame-ancestors` interdit tout encadrement.
    """
    csp = '; '.join(
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            # L'aperçu du PDF est affiché depuis une URL blob: produite par
            # le navigateur à partir de la réponse du serveur.
            "frame-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            'upgrade-insecure-requests',
        ]
    )

    return {
        'Content-Security-Policy': csp,
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    }
