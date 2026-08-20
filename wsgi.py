"""Point d'entrée WSGI pour un serveur classique (gunicorn, uWSGI).

gunicorn wsgi:app
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from app import creer_app  # noqa: E402  — l'environnement doit être chargé avant

app = creer_app()
