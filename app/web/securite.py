"""Session, contrôle d'accès et helpers de requête.

L'autorisation est **toujours** revérifiée côté serveur, à chaque requête : le
profil est relu en base, si bien qu'un compte désactivé perd immédiatement
l'accès sans attendre l'expiration de sa session. Masquer un lien dans un
gabarit n'est jamais une mesure de sécurité.
"""

from __future__ import annotations

import random
from collections.abc import Callable
from datetime import timedelta
from functools import wraps
from typing import Any, ParamSpec, TypeVar

from flask import abort, g, redirect, request, session, url_for
from werkzeug.wrappers import Response

from app.domaine import connexion, limitation
from app.domaine.requetes import a_vue_globale, est_admin
from app.models import User, maintenant

CLEF_SESSION = 'utilisateur_id'

P = ParamSpec('P')
T = TypeVar('T')


def ouvrir_session(utilisateur: User) -> None:
    session.clear()
    session[CLEF_SESSION] = utilisateur.id
    session.permanent = True


def fermer_session() -> None:
    session.clear()


def utilisateur_courant() -> User | None:
    """Profil de l'utilisateur connecté, relu en base à chaque requête."""
    if 'utilisateur' in g:
        return g.utilisateur  # type: ignore[no-any-return]

    identifiant = session.get(CLEF_SESSION)
    utilisateur: User | None = None

    # `g.db` peut manquer dans un gestionnaire d'erreur déclenché après la
    # fermeture de la session : on dégrade alors sans planter.
    if identifiant and 'db' in g:
        utilisateur = g.db.get(User, identifiant)
        if utilisateur is not None and not utilisateur.actif:
            utilisateur = None

    g.utilisateur = utilisateur
    return utilisateur


def connexion_requise(vue: Callable[P, T]) -> Callable[P, T | Response]:
    @wraps(vue)
    def enveloppe(*args: P.args, **kwargs: P.kwargs) -> T | Response:
        if utilisateur_courant() is None:
            return redirect(
                url_for('auth.connexion_formulaire', suite=request.full_path.rstrip('?'))
            )
        return vue(*args, **kwargs)

    return enveloppe


def rh_requis(vue: Callable[P, T]) -> Callable[P, T | Response]:
    """Réservé aux rôles HR et ADMIN (règle 9)."""

    @wraps(vue)
    def enveloppe(*args: P.args, **kwargs: P.kwargs) -> T | Response:
        utilisateur = utilisateur_courant()
        if utilisateur is None:
            return redirect(url_for('auth.connexion_formulaire', suite=request.path))
        if not a_vue_globale(utilisateur):
            abort(403)
        return vue(*args, **kwargs)

    return enveloppe


def admin_requis(vue: Callable[P, T]) -> Callable[P, T | Response]:
    @wraps(vue)
    def enveloppe(*args: P.args, **kwargs: P.kwargs) -> T | Response:
        utilisateur = utilisateur_courant()
        if utilisateur is None:
            return redirect(url_for('auth.connexion_formulaire', suite=request.path))
        if not est_admin(utilisateur):
            abort(403)
        return vue(*args, **kwargs)

    return enveloppe


def ip_client() -> str:
    """Adresse IP de l'appelant.

    Derrière le proxy Vercel, `X-Forwarded-For` est renseigné ; la première
    adresse de la liste est celle du client.
    """
    transmise = request.headers.get('X-Forwarded-For', '')
    if transmise:
        premiere = transmise.split(',')[0].strip()
        if premiere:
            return premiere

    return request.headers.get('X-Real-IP') or request.remote_addr or 'inconnue'


def verifier_debit(cle: str, politique_nom: str) -> limitation.Resultat:
    """Consomme un jeton de débit et purge occasionnellement les fenêtres mortes.

    La purge est déclenchée une fois sur vingt plutôt que par un cron :
    l'offre gratuite n'autorise qu'une exécution planifiée par jour.
    """
    resultat = limitation.consommer(g.db, cle, limitation.POLITIQUES[politique_nom])

    if random.randint(1, 20) == 1:
        limitation.purger(g.db, maintenant() - timedelta(days=1))
        connexion.purger(g.db, maintenant() - timedelta(days=1))

    return resultat


def chemin_interne(suite: str | None, defaut: str = '/') -> str:
    """N'accepte qu'un chemin interne — évite toute redirection ouverte."""
    if not suite or not suite.startswith('/') or suite.startswith('//'):
        return defaut
    return suite


def contexte_gabarit() -> dict[str, Any]:
    """Variables disponibles dans tous les gabarits."""
    utilisateur = utilisateur_courant()
    return {
        'utilisateur': utilisateur,
        'est_rh': utilisateur is not None and a_vue_globale(utilisateur),
        'est_admin': utilisateur is not None and est_admin(utilisateur),
    }
