"""Fabrique de l'application Flask."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from flask import Flask, g, render_template
from flask_wtf.csrf import CSRFError, CSRFProtect
from werkzeug.exceptions import HTTPException

from app import db
from app.config import Config, charger_config
from app.domaine import audit, numerotation, statuts
from app.domaine.dates import format_date, format_datetime, format_heure, vers_saisie
from app.domaine.validations import LIBELLES_TRANSPORT, formater_litres
from app.web import securite

csrf = CSRFProtect()


def creer_app(config: Config | None = None) -> Flask:
    """Construit l'application. `config` permet aux tests d'injecter la leur."""
    app = Flask(__name__, static_folder='static', template_folder='templates')
    parametres = config or charger_config()

    app.config.update(
        SECRET_KEY=parametres.secret_key,
        PORTEO=parametres,
        # La session est un cookie signé : `HttpOnly` et `SameSite=Lax`
        # protègent du vol par script et du CSRF sur navigation.
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=parametres.app_url.startswith('https://'),
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        WTF_CSRF_TIME_LIMIT=None,
        TEMPLATES_AUTO_RELOAD=parametres.debug,
    )

    csrf.init_app(app)
    db.initialiser(parametres.database_url)

    _brancher_session(app)
    _brancher_entetes(app, parametres)
    _brancher_gabarits(app, parametres)
    _brancher_erreurs(app)
    _brancher_routes(app)

    return app


def _brancher_session(app: Flask) -> None:
    """Une session de base par requête, validée si tout s'est bien passé."""

    @app.before_request
    def ouvrir() -> None:
        g.db = db.nouvelle_session()

    @app.teardown_request
    def fermer(erreur: BaseException | None) -> None:
        session = g.pop('db', None)
        if session is None:
            return
        try:
            if erreur is None:
                session.commit()
            else:
                session.rollback()
        finally:
            session.close()


def _brancher_entetes(app: Flask, config: Config) -> None:
    @app.after_request
    def entetes(reponse: Any) -> Any:
        for nom, valeur in config.entetes_securite.items():
            reponse.headers.setdefault(nom, valeur)
        return reponse


def _brancher_gabarits(app: Flask, config: Config) -> None:
    app.jinja_env.filters.update(
        date=format_date,
        datetime=format_datetime,
        heure=format_heure,
        saisie=vers_saisie,
        litres=formater_litres,
    )

    @app.context_processor
    def variables() -> dict[str, Any]:
        return {
            **securite.contexte_gabarit(),
            'nom_application': config.nom_application,
            'libelle_statut': statuts.libelle,
            'variante_statut': statuts.variante,
            'libelle_transport': LIBELLES_TRANSPORT,
            'libelle_action': audit.libelle,
            'numero_affiche': numerotation.affichage,
            'est_modifiable': statuts.est_modifiable,
            'est_annulable': statuts.est_annulable,
        }


def _brancher_erreurs(app: Flask) -> None:
    @app.errorhandler(CSRFError)
    def csrf_invalide(_erreur: CSRFError) -> tuple[str, int]:
        return (
            render_template(
                'erreur.html',
                code=400,
                titre='Formulaire expiré',
                message='Votre session a expiré. Revenez en arrière et renvoyez le formulaire.',
            ),
            400,
        )

    @app.errorhandler(403)
    def interdit(_erreur: HTTPException) -> tuple[str, int]:
        return (
            render_template(
                'erreur.html',
                code=403,
                titre='Accès refusé',
                message="Vous n'êtes pas autorisé à consulter cette page.",
            ),
            403,
        )

    @app.errorhandler(404)
    def introuvable(_erreur: HTTPException) -> tuple[str, int]:
        return (
            render_template(
                'erreur.html',
                code=404,
                titre='Page introuvable',
                message="La page demandée n'existe pas ou n'est plus accessible.",
            ),
            404,
        )

    @app.errorhandler(500)
    def interne(_erreur: Exception) -> tuple[str, int]:  # pragma: no cover
        return (
            render_template(
                'erreur.html',
                code=500,
                titre='Erreur inattendue',
                message="Une erreur est survenue. L'opération n'a pas été enregistrée.",
            ),
            500,
        )


def _brancher_routes(app: Flask) -> None:
    from app.web import admin, auth, missions, pdf_routes, public, rh

    app.register_blueprint(auth.bp)
    app.register_blueprint(missions.bp)
    app.register_blueprint(rh.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(public.bp)
    app.register_blueprint(pdf_routes.bp)
