"""Pages publiques : décision RH depuis l'e-mail, vérification d'authenticité."""

from __future__ import annotations

from flask import Blueprint, current_app, g, render_template, request

from app.config import Config
from app.domaine import audit, decision, jetons, requetes, statuts
from app.domaine.validations import valider_motif_refus
from app.emails.notifications import notifier_decision
from app.models import MissionOrder, MissionStatus
from app.web.securite import ip_client, utilisateur_courant, verifier_debit

bp = Blueprint('public', __name__)


def _config() -> Config:
    return current_app.config['PORTEO']  # type: ignore[no-any-return]


def _valideur() -> decision.Valideur:
    """Identité du valideur.

    Les RH décident depuis leur boîte mail, sans se connecter : l'application
    enregistre alors le service comme valideur. Si la personne est malgré tout
    authentifiée, son identité nominative est retenue et imprimée sur le PDF.
    """
    utilisateur = utilisateur_courant()

    if utilisateur is not None and requetes.a_vue_globale(utilisateur):
        return decision.Valideur(
            id=utilisateur.id, nom=utilisateur.nom_complet, email=utilisateur.email
        )

    config = _config()
    return decision.Valideur(id=None, nom=decision.VALIDEUR_SERVICE_RH, email=config.hr_emails[0])


def _preparer(jeton: str, action_attendue: str) -> tuple[MissionOrder | None, str]:
    """Résout un jeton **sans le consommer**.

    Les scanners d'e-mails préchargent les liens : afficher la page ne doit
    produire aucun effet de bord.
    """
    resolution = jetons.resoudre(g.db, jeton)

    if not resolution.valide:
        return None, resolution.message

    if resolution.action != action_attendue:
        return None, "Ce lien ne correspond pas à l'action demandée."

    assert resolution.mission_id is not None
    mission = g.db.get(MissionOrder, resolution.mission_id)

    if mission is None:
        return None, jetons.MOTIFS['INTROUVABLE']

    return mission, ''


def _tracer_rejeu(motif: str, sens: str) -> None:
    """Un lien rejoué est tracé : c'est un signal de sécurité."""
    audit.journaliser(
        g.db,
        entite='ApprovalToken',
        entite_id='inconnu',
        action='TOKEN_REPLAYED',
        acteur='ANONYME',
        ip=ip_client(),
        details={'motif': motif, 'sens': sens},
    )


@bp.get('/approve/<jeton>')
def approuver_formulaire(jeton: str) -> tuple[str, int] | str:
    mission, message = _preparer(jeton, jetons.APPROVE)

    if mission is None:
        return render_template('public/decision.html', sens='approve', message=message), 410

    return render_template('public/decision.html', sens='approve', mission=mission, jeton=jeton)


@bp.post('/approve/<jeton>')
def approuver(jeton: str) -> tuple[str, int] | str:
    return _decider(jeton, jetons.APPROVE, 'approve')


@bp.get('/reject/<jeton>')
def refuser_formulaire(jeton: str) -> tuple[str, int] | str:
    mission, message = _preparer(jeton, jetons.REJECT)

    if mission is None:
        return render_template('public/decision.html', sens='reject', message=message), 410

    return render_template('public/decision.html', sens='reject', mission=mission, jeton=jeton)


@bp.post('/reject/<jeton>')
def refuser(jeton: str) -> tuple[str, int] | str:
    return _decider(jeton, jetons.REJECT, 'reject')


def _decider(jeton: str, action: str, sens_url: str) -> tuple[str, int] | str:
    """Décision effective : réservée au POST, jamais déclenchée par un GET."""
    ip = ip_client()

    quota = verifier_debit(f'approbation:ip:{ip}', 'approbation_ip')
    if not quota.autorise:
        return render_template(
            'public/decision.html',
            sens=sens_url,
            message='Trop de tentatives. Merci de réessayer dans quelques minutes.',
        ), 429

    motif: str | None = None
    if action == jetons.REJECT:
        motif, erreur = valider_motif_refus(request.form.get('motif', ''))
        if erreur:
            mission, message = _preparer(jeton, action)
            if mission is None:
                return render_template('public/decision.html', sens=sens_url, message=message), 410
            return render_template(
                'public/decision.html',
                sens=sens_url,
                mission=mission,
                jeton=jeton,
                erreur=erreur,
                motif=request.form.get('motif', ''),
            ), 400

    mission, message = _preparer(jeton, action)
    if mission is None:
        _tracer_rejeu(message, sens_url)
        return render_template('public/decision.html', sens=sens_url, message=message), 410

    resultat = decision.appliquer(
        g.db,
        mission_id=mission.id,
        sens=action,
        valideur=_valideur(),
        motif_refus=motif,
        ip=ip,
    )

    if not resultat.ok:
        return render_template('public/decision.html', sens=sens_url, message=resultat.message), 410

    assert resultat.mission is not None
    notifier_decision(g.db, _config(), resultat.mission, resultat.mission.demandeur.email)

    return render_template(
        'public/decision.html',
        sens=sens_url,
        mission=resultat.mission,
        confirme=True,
        etat='validé' if action == jetons.APPROVE else 'refusé',
    )


@bp.get('/verify/<numero>')
def verifier(numero: str) -> str:
    """Vérification publique d'authenticité, cible du QR code du PDF.

    Volontairement minimale : statut, lieu, dates, décision et valideur. Ni
    matricule, ni identité du demandeur, ni détail du déplacement.
    """
    quota = verifier_debit(f'verification:ip:{ip_client()}', 'verification_ip')

    if not quota.autorise:
        return render_template('public/verification.html', numero=numero, trop_de_requetes=True)

    mission = requetes.trouver_par_numero(g.db, numero)

    return render_template(
        'public/verification.html',
        numero=numero,
        mission=mission,
        valide=mission is not None and mission.statut is MissionStatus.APPROVED,
        libelle=statuts.libelle(mission.statut) if mission else '',
    )
