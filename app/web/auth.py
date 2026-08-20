"""Connexion par lien magique."""

from __future__ import annotations

from flask import Blueprint, current_app, g, redirect, render_template, request, url_for
from flask.typing import ResponseReturnValue

from app.config import Config
from app.domaine import audit, connexion
from app.emails.notifications import notifier_connexion
from app.web.securite import (
    chemin_interne,
    fermer_session,
    ip_client,
    ouvrir_session,
    utilisateur_courant,
    verifier_debit,
)

bp = Blueprint('auth', __name__)


def _config() -> Config:
    return current_app.config['PORTEO']  # type: ignore[no-any-return]


@bp.get('/login')
def connexion_formulaire() -> ResponseReturnValue:
    if utilisateur_courant() is not None:
        return redirect(url_for('missions.tableau_de_bord'))
    return render_template('auth/connexion.html', suite=request.args.get('suite', '/'))


@bp.post('/login')
def connexion_envoi() -> ResponseReturnValue:
    """Demande d'envoi d'un lien de connexion.

    La réponse est volontairement identique que l'adresse existe ou non :
    l'écran de connexion ne doit pas permettre d'énumérer les collaborateurs.
    """
    email = (request.form.get('email') or '').strip().lower()
    suite = chemin_interne(request.form.get('suite'))
    config = _config()

    if '@' not in email or len(email) < 5:
        return render_template(
            'auth/connexion.html',
            suite=suite,
            email=email,
            erreur='Adresse e-mail invalide',
        ), 400

    ip = ip_client()
    par_email = verifier_debit(f'connexion:email:{email}', 'connexion_email')
    par_ip = verifier_debit(f'connexion:ip:{ip}', 'connexion_ip')

    if not (par_email.autorise and par_ip.autorise):
        audit.journaliser(
            g.db, entite='Auth', entite_id=email, action='RATE_LIMITED', acteur=email, ip=ip
        )
        return render_template(
            'auth/connexion.html',
            suite=suite,
            email=email,
            erreur='Trop de demandes de connexion. Merci de patienter quelques minutes '
            'avant de réessayer.',
        ), 429

    # Aucun e-mail n'est envoyé à une adresse inconnue ou désactivée.
    utilisateur = connexion.trouver_actif(g.db, email)
    if utilisateur is not None:
        jeton = connexion.emettre(g.db, email, config.duree_lien_connexion_minutes)
        url = f'{config.app_url}{url_for("auth.connexion_callback")}?jeton={jeton}&suite={suite}'
        notifier_connexion(g.db, config, email, url, utilisateur.id)
    else:
        audit.journaliser(
            g.db,
            entite='Auth',
            entite_id=email,
            action='RATE_LIMITED',
            acteur=email,
            ip=ip,
            details={'raison': 'adresse inconnue ou compte désactivé'},
        )

    return render_template('auth/verification.html', email=email)


@bp.get('/login/callback')
def connexion_callback() -> ResponseReturnValue:
    """Ouverture du lien reçu par e-mail. Usage unique."""
    verification = connexion.consommer(g.db, request.args.get('jeton', ''))

    if not verification.ok:
        return render_template('auth/erreur.html', message=verification.message), 400

    utilisateur = verification.utilisateur
    assert utilisateur is not None

    ouvrir_session(utilisateur)
    audit.journaliser(
        g.db,
        entite='Auth',
        entite_id=utilisateur.id,
        action='LOGIN',
        acteur=utilisateur.email,
        ip=ip_client(),
    )

    return redirect(chemin_interne(request.args.get('suite')))


@bp.post('/logout')
def deconnexion() -> ResponseReturnValue:
    fermer_session()
    return redirect(url_for('auth.connexion_formulaire'))
