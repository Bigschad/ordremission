"""Démonstration sans aucune infrastructure.

    python -m scripts.demo            prépare puis démarre le serveur
    python -m scripts.demo --preparer prépare seulement (.env, base, données)
    python -m scripts.demo --env      rafraîchit seulement APP_URL dans .env

Écrit un `.env` pointant sur une base SQLite locale et sur le transport
d'e-mails « fichier » : ni PostgreSQL, ni Resend, ni compte à créer.
Un `.env` existant n'est jamais écrasé ; seule `APP_URL` est réalignée, car
le nom d'hôte d'un Codespace n'est connu qu'au rattachement.
"""

from __future__ import annotations

import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIER_ENV = RACINE / '.env'
PORT = int(os.environ.get('PORT', '5000'))


def url_publique() -> str:
    """URL par laquelle l'application sera jointe.

    Dans un Codespace, le port est publié sur un domaine dédié : c'est cette
    adresse qui doit figurer dans les liens des e-mails et dans le QR code.
    """
    nom = os.environ.get('CODESPACE_NAME')
    domaine = os.environ.get('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN')

    if nom and domaine:
        return f'https://{nom}-{PORT}.{domaine}'
    return f'http://localhost:{PORT}'


def _contenu(app_url: str) -> str:
    return f"""# Démonstration — généré par « python -m scripts.demo ».
# Ce fichier ne contient aucun secret réel et n'est pas versionné.
DATABASE_URL="sqlite:///{RACINE / 'demo.db'}"
SECRET_KEY="{secrets.token_urlsafe(32)}"
APP_URL="{app_url}"
APP_NAME="Ordres de mission — PORTEO GROUP"

# Les e-mails sont écrits dans .mailbox/ au lieu d'être envoyés.
EMAIL_TRANSPORT="fichier"
EMAIL_FROM="Ordres de mission Porteo <om@porteo-group.com>"
HR_EMAIL="rh@porteo-group.com"
RESEND_API_KEY=""

FLASK_DEBUG="1"
"""


def preparer_env() -> str:
    app_url = url_publique()

    if not FICHIER_ENV.exists():
        FICHIER_ENV.write_text(_contenu(app_url), encoding='utf-8')
        print(f'→ .env créé — APP_URL={app_url}')
        return app_url

    ancien = FICHIER_ENV.read_text(encoding='utf-8')
    nouveau = re.sub(r'^APP_URL=.*$', f'APP_URL="{app_url}"', ancien, flags=re.MULTILINE)

    if nouveau != ancien:
        FICHIER_ENV.write_text(nouveau, encoding='utf-8')
        print(f'→ .env mis à jour — APP_URL={app_url}')
    else:
        print(f'→ .env inchangé — APP_URL={app_url}')

    return app_url


def preparer_base() -> None:
    from dotenv import load_dotenv

    load_dotenv(FICHIER_ENV, override=True)

    from app import db
    from app.config import _normaliser_database_url
    from app.models import Base

    moteur = db.initialiser(_normaliser_database_url(os.environ['DATABASE_URL']))
    Base.metadata.create_all(moteur)
    db.reinitialiser()

    from scripts import seed

    seed.executer()


def demarrer(app_url: str) -> None:
    print(f'\n→ Application disponible sur {app_url}')
    print('  Connectez-vous avec schadrach.yeye@porteo-group.com,')
    print('  puis récupérez le lien reçu avec : python -m scripts.lien connexion\n')

    subprocess.run(
        [sys.executable, '-m', 'flask', '--app', 'wsgi:app', 'run', '--port', str(PORT)],
        cwd=RACINE,
        check=False,
    )


def main() -> None:
    options = set(sys.argv[1:])

    app_url = preparer_env()
    if '--env' in options:
        return

    preparer_base()
    if '--preparer' in options:
        return

    demarrer(app_url)


if __name__ == '__main__':
    main()
