"""Tests de bout en bout : vrai navigateur, vrai serveur, vraie base.

Le serveur est démarré par la campagne elle-même sur une base SQLite
temporaire et un transport d'e-mails « fichier » : aucune infrastructure,
aucun envoi réel. Les liens de connexion et de décision sont relus dans la
boîte aux lettres de test, exactement comme les RH les recevraient.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from playwright.sync_api import Browser, Page, expect, sync_playwright

RACINE = Path(__file__).resolve().parent.parent
BOITE = RACINE / '.mailbox-e2e'


def _port_libre() -> int:
    with socket.socket() as prise:
        prise.bind(('127.0.0.1', 0))
        port: int = prise.getsockname()[1]
        return port


@pytest.fixture(scope='session')
def base_url(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    """Démarre le serveur Flask et l'arrête à la fin de la campagne."""
    deja_lance = os.environ.get('E2E_BASE_URL')
    if deja_lance:
        yield deja_lance.rstrip('/')
        return

    port = _port_libre()
    url = f'http://127.0.0.1:{port}'
    base = tmp_path_factory.mktemp('e2e') / 'e2e.db'

    environnement = {
        **os.environ,
        'DATABASE_URL': f'sqlite:///{base}',
        'SECRET_KEY': 'secret-e2e',
        'APP_URL': url,
        'EMAIL_TRANSPORT': 'fichier',
        'MAILBOX_DIR': str(BOITE),
        'HR_EMAIL': 'rh@porteo-group.com',
        'PYTHONPATH': str(RACINE),
        'PYTHONUNBUFFERED': '1',
    }

    shutil.rmtree(BOITE, ignore_errors=True)
    subprocess.run(
        [sys.executable, '-m', 'scripts.preparer_e2e'],
        cwd=RACINE,
        env=environnement,
        check=True,
        capture_output=True,
    )

    serveur = subprocess.Popen(
        [sys.executable, '-m', 'flask', '--app', 'wsgi:app', 'run', '--port', str(port)],
        cwd=RACINE,
        env=environnement,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    limite = time.monotonic() + 30
    while time.monotonic() < limite:
        if serveur.poll() is not None:
            sortie = serveur.stdout.read().decode('utf-8', 'replace') if serveur.stdout else ''
            raise RuntimeError(f"Le serveur de test s'est arrêté :\n{sortie}")
        try:
            httpx.get(f'{url}/login', timeout=1.0)
            break
        except httpx.HTTPError:
            time.sleep(0.2)
    else:
        serveur.kill()
        raise RuntimeError("Le serveur de test n'a pas répondu en 30 s.")

    try:
        yield url
    finally:
        serveur.terminate()
        serveur.wait(timeout=10)
        shutil.rmtree(BOITE, ignore_errors=True)


@pytest.fixture(scope='session')
def navigateur() -> Iterator[Browser]:
    # `PLAYWRIGHT_CHROMIUM_EXECUTABLE` sert aux environnements qui fournissent
    # déjà un Chromium (conteneurs de CI) : sans elle, Playwright utilise le
    # navigateur installé par `playwright install chromium`.
    binaire = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None

    with sync_playwright() as pilote:
        navigateur = pilote.chromium.launch(executable_path=binaire)
        yield navigateur
        navigateur.close()


DEMANDEUR = 'schadrach.yeye@porteo-group.com'
GESTIONNAIRE_RH = 'rh@porteo-group.com'


def _nouveau_contexte(navigateur: Browser, base_url: str, etat: Any | None = None) -> Any:
    return navigateur.new_context(
        base_url=base_url, locale='fr-FR', timezone_id='Africa/Abidjan', storage_state=etat
    )


def ouvrir_session(page: Page, email: str) -> None:
    """Parcourt le lien magique de bout en bout, comme un vrai collaborateur."""
    depuis = len(messages())
    page.goto('/login')
    page.get_by_label('Adresse e-mail professionnelle').fill(email)
    page.get_by_role('button', name='Recevoir mon lien de connexion').click()
    expect(page.get_by_text('Vérifiez votre boîte mail')).to_be_visible()

    # Le lien reçu est absolu et pointe sur le serveur de test : on le suit tel quel.
    page.goto(attendre_lien(r'/login/callback\?[^\s"\'<>]+', depuis))


def _etat_connecte(navigateur: Browser, base_url: str, email: str) -> Any:
    """Ouvre une session une seule fois et en conserve les cookies.

    L'envoi de liens de connexion est volontairement limité à cinq par quart
    d'heure et par adresse : rejouer la connexion à chaque test déclencherait
    cette protection.
    """
    contexte = _nouveau_contexte(navigateur, base_url)
    page = contexte.new_page()
    page.set_default_timeout(10_000)

    ouvrir_session(page, email)
    expect(page.get_by_role('heading', name='Mes ordres de mission')).to_be_visible()

    etat = contexte.storage_state()
    contexte.close()
    return etat


@pytest.fixture(scope='session')
def etat_demandeur(navigateur: Browser, base_url: str) -> Any:
    return _etat_connecte(navigateur, base_url, DEMANDEUR)


@pytest.fixture(scope='session')
def etat_rh(navigateur: Browser, base_url: str) -> Any:
    return _etat_connecte(navigateur, base_url, GESTIONNAIRE_RH)


@pytest.fixture
def page(navigateur: Browser, base_url: str, etat_demandeur: Any) -> Iterator[Page]:
    """Le collaborateur, déjà connecté."""
    contexte = _nouveau_contexte(navigateur, base_url, etat_demandeur)
    page = contexte.new_page()
    page.set_default_timeout(10_000)
    yield page
    contexte.close()


@pytest.fixture
def page_rh(navigateur: Browser, base_url: str, etat_rh: Any) -> Iterator[Page]:
    """La gestionnaire des Ressources Humaines, déjà connectée."""
    contexte = _nouveau_contexte(navigateur, base_url, etat_rh)
    page = contexte.new_page()
    page.set_default_timeout(10_000)
    yield page
    contexte.close()


@pytest.fixture
def anonyme(navigateur: Browser, base_url: str) -> Iterator[Page]:
    """Navigateur vierge : les RH décident depuis leur boîte mail, sans session."""
    contexte = _nouveau_contexte(navigateur, base_url)
    page = contexte.new_page()
    page.set_default_timeout(10_000)
    yield page
    contexte.close()


# ---------------------------------------------------------------------------
# Boîte aux lettres de test
# ---------------------------------------------------------------------------


def messages() -> list[dict[str, Any]]:
    if not BOITE.exists():
        return []
    return [
        json.loads(fichier.read_text(encoding='utf-8')) for fichier in sorted(BOITE.glob('*.json'))
    ]


def attendre_message(depuis: int, secondes: float = 10.0) -> dict[str, Any]:
    """Attend l'arrivée d'un e-mail au-delà du rang indiqué et le renvoie."""
    limite = time.monotonic() + secondes

    while time.monotonic() < limite:
        recus = messages()
        if len(recus) > depuis:
            return recus[-1]
        time.sleep(0.2)

    raise AssertionError(f'aucun e-mail reçu en {secondes:g} s')


def attendre_lien(motif: str, depuis: int = 0, secondes: float = 10.0) -> str:
    """Attend l'arrivée d'un e-mail contenant un lien et le renvoie.

    L'envoi est synchrone côté serveur, mais la réponse HTTP peut atteindre le
    navigateur avant que le fichier ne soit visible : on laisse un court délai.
    """
    limite = time.monotonic() + secondes

    while time.monotonic() < limite:
        for message in reversed(messages()[depuis:]):
            source = f'{message["texte"]}\n{message["html"]}'
            trouve = re.search(rf'https?://[^\s"\'<>]*{motif}', source)
            if trouve:
                return trouve.group(0).replace('&amp;', '&')
        time.sleep(0.2)

    raise AssertionError(f'aucun lien « {motif} » reçu en {secondes:g} s')
