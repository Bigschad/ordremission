"""Lecture de la configuration : rien en dur, échec explicite si l'essentiel manque."""

from __future__ import annotations

import pytest

from app.config import (
    ConfigurationInvalide,
    _entetes_securite,
    _normaliser_database_url,
    charger_config,
)

MINIMUM = {
    'DATABASE_URL': 'postgres://user:secret@ep-neon.eu-central-1.aws.neon.tech/om',
    'SECRET_KEY': 'clef-de-test',
}


@pytest.fixture
def environnement(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """Part d'un environnement vierge : aucune fuite depuis la machine de test."""
    for nom in (
        'DATABASE_URL',
        'SECRET_KEY',
        'APP_URL',
        'EMAIL_FROM',
        'HR_EMAIL',
        'RESEND_API_KEY',
        'EMAIL_TRANSPORT',
        'APP_NAME',
        'FLASK_DEBUG',
    ):
        monkeypatch.delenv(nom, raising=False)
    for nom, valeur in MINIMUM.items():
        monkeypatch.setenv(nom, valeur)
    return monkeypatch


# ---------------------------------------------------------------------------
# Normalisation du DSN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ('brut', 'attendu'),
    [
        # Forme distribuée par Neon et la plupart des hébergeurs.
        ('postgres://u:p@hote/base', 'postgresql+psycopg://u:p@hote/base'),
        ('postgresql://u:p@hote/base', 'postgresql+psycopg://u:p@hote/base'),
        # Déjà explicite : laissé tel quel.
        ('postgresql+psycopg://u:p@hote/base', 'postgresql+psycopg://u:p@hote/base'),
        # SQLite (démonstration, tests) n'est pas concerné.
        ('sqlite:///./om.db', 'sqlite:///./om.db'),
    ],
)
def test_le_dsn_est_ramene_au_pilote_psycopg(brut: str, attendu: str) -> None:
    assert _normaliser_database_url(brut) == attendu


def test_les_parametres_de_connexion_sont_preserves() -> None:
    """Neon impose `sslmode=require` : la chaîne ne doit pas être tronquée."""
    normalise = _normaliser_database_url('postgres://u:p@hote/base?sslmode=require')

    assert normalise.endswith('/base?sslmode=require')


# ---------------------------------------------------------------------------
# Chargement
# ---------------------------------------------------------------------------


def test_les_valeurs_par_defaut_suffisent_a_demarrer(environnement: pytest.MonkeyPatch) -> None:
    config = charger_config()

    assert config.database_url.startswith('postgresql+psycopg://')
    assert config.secret_key == 'clef-de-test'
    assert config.app_url == 'http://localhost:5000'
    assert config.hr_emails == ('rh@porteo-group.com',)
    assert config.email_transport == 'resend'
    assert config.debug is False
    assert config.est_sqlite is False


def test_database_url_est_obligatoire(environnement: pytest.MonkeyPatch) -> None:
    environnement.delenv('DATABASE_URL')

    with pytest.raises(ConfigurationInvalide, match='DATABASE_URL'):
        charger_config()


def test_secret_key_est_obligatoire(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('SECRET_KEY', '   ')

    with pytest.raises(ConfigurationInvalide, match='SECRET_KEY'):
        charger_config()


def test_un_transport_inconnu_est_refuse(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('EMAIL_TRANSPORT', 'sendmail')

    with pytest.raises(ConfigurationInvalide, match='EMAIL_TRANSPORT'):
        charger_config()


def test_le_transport_est_insensible_a_la_casse(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('EMAIL_TRANSPORT', 'Fichier')

    assert charger_config().email_transport == 'fichier'


def test_hr_email_accepte_plusieurs_adresses(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('HR_EMAIL', 'rh@porteo-group.com, drh@porteo-group.com ,')

    assert charger_config().hr_emails == ('rh@porteo-group.com', 'drh@porteo-group.com')


def test_hr_email_vide_est_refuse(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('HR_EMAIL', ' , ')

    with pytest.raises(ConfigurationInvalide, match='HR_EMAIL'):
        charger_config()


def test_la_barre_finale_de_app_url_est_retiree(environnement: pytest.MonkeyPatch) -> None:
    """Sans quoi les liens des e-mails contiendraient un double `//`."""
    environnement.setenv('APP_URL', 'https://om.porteo-group.com/')

    config = charger_config()

    assert config.app_url == 'https://om.porteo-group.com'
    assert config.url_verification('OM-2026-0001') == (
        'https://om.porteo-group.com/verify/OM-2026-0001'
    )


@pytest.mark.parametrize(('valeur', 'attendu'), [('1', True), ('true', True), ('0', False)])
def test_flask_debug(environnement: pytest.MonkeyPatch, valeur: str, attendu: bool) -> None:
    environnement.setenv('FLASK_DEBUG', valeur)

    assert charger_config().debug is attendu


def test_sqlite_est_reconnu(environnement: pytest.MonkeyPatch) -> None:
    environnement.setenv('DATABASE_URL', 'sqlite:///./demo.db')

    assert charger_config().est_sqlite is True


# ---------------------------------------------------------------------------
# En-têtes de sécurité
# ---------------------------------------------------------------------------


def test_les_entetes_de_securite_couvrent_les_exigences() -> None:
    entetes = _entetes_securite()

    assert entetes['X-Frame-Options'] == 'DENY'
    assert entetes['X-Content-Type-Options'] == 'nosniff'
    assert entetes['Referrer-Policy'] == 'strict-origin-when-cross-origin'
    assert 'max-age=63072000' in entetes['Strict-Transport-Security']


def test_la_politique_de_contenu_ninterdit_aucun_usage_necessaire() -> None:
    csp = _entetes_securite()['Content-Security-Policy']

    # Aucun script tiers, aucun encadrement de la page.
    assert "script-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    # L'aperçu du PDF est servi depuis une URL blob: construite par le navigateur.
    assert "frame-src 'self' blob:" in csp
