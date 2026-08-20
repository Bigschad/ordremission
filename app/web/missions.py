"""Écrans du collaborateur : tableau de bord, saisie, détail."""

from __future__ import annotations

from datetime import timedelta

from flask import (
    Blueprint,
    abort,
    current_app,
    flash,
    g,
    redirect,
    render_template,
    request,
    url_for,
)
from flask.typing import ResponseReturnValue

from app.config import Config
from app.domaine import audit, requetes, statuts
from app.domaine import missions as service
from app.domaine.dates import vers_saisie
from app.domaine.validations import Saisie
from app.emails.notifications import notifier_soumission_rh
from app.models import MissionOrder, MissionStatus, maintenant
from app.web.securite import connexion_requise, ip_client, utilisateur_courant

bp = Blueprint('missions', __name__)


def _config() -> Config:
    return current_app.config['PORTEO']  # type: ignore[no-any-return]


def _saisie_depuis_formulaire() -> Saisie:
    formulaire = request.form
    return Saisie(
        objet=formulaire.get('objet', ''),
        lieu=formulaire.get('lieu', ''),
        analytique=formulaire.get('analytique', ''),
        date_depart=formulaire.get('date_depart', ''),
        date_retour=formulaire.get('date_retour', ''),
        transport_type=formulaire.get('transport_type', ''),
        transport_detail=formulaire.get('transport_detail', ''),
        litres_gasoil=formulaire.get('litres_gasoil', ''),
    )


def _statut_demande() -> MissionStatus | None:
    brut = request.args.get('statut', '')
    try:
        return MissionStatus(brut) if brut else None
    except ValueError:
        return None


@bp.get('/')
@connexion_requise
def tableau_de_bord() -> str:
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    statut = _statut_demande()
    return render_template(
        'missions/tableau_de_bord.html',
        missions=requetes.mes_missions(g.db, utilisateur, statut),
        compteurs=requetes.compter_par_statut(g.db, utilisateur.id),
        statut_actif=statut,
        statuts_possibles=list(MissionStatus),
    )


def _valeurs_par_defaut() -> dict[str, str]:
    """Demain, de 8 h à 17 h — le cas le plus courant."""
    demain = maintenant() + timedelta(days=1)
    depart = demain.replace(hour=8, minute=0, second=0, microsecond=0)
    retour = demain.replace(hour=17, minute=0, second=0, microsecond=0)
    return {'date_depart': vers_saisie(depart), 'date_retour': vers_saisie(retour)}


@bp.get('/missions/nouveau')
@connexion_requise
def nouveau() -> str:
    return render_template(
        'missions/formulaire.html',
        mission=None,
        valeurs=_valeurs_par_defaut(),
        erreurs={},
    )


@bp.post('/missions/nouveau')
@connexion_requise
def creer() -> ResponseReturnValue:
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    saisie = _saisie_depuis_formulaire()
    issue = service.creer_brouillon(g.db, utilisateur, saisie, ip_client())
    assert issue.mission is not None

    if request.form.get('action') == 'soumettre':
        return _soumettre(issue.mission, saisie)

    flash(issue.message, 'succes')
    return redirect(url_for('missions.detail', mission_id=issue.mission.id))


def _charger(mission_id: str) -> MissionOrder:
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    mission = requetes.trouver(g.db, utilisateur, mission_id)
    if mission is None:
        abort(404)
    return mission


def _exiger_demandeur(mission: MissionOrder) -> None:
    """Modifier, soumettre ou annuler reste l'apanage du demandeur."""
    utilisateur = utilisateur_courant()
    assert utilisateur is not None
    if mission.demandeur_id != utilisateur.id:
        abort(403)


@bp.get('/missions/<mission_id>')
@connexion_requise
def detail(mission_id: str) -> str:
    mission = _charger(mission_id)
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    return render_template(
        'missions/detail.html',
        mission=mission,
        historique=audit.historique(g.db, mission.id),
        est_demandeur=mission.demandeur_id == utilisateur.id,
        relances_max=service.RELANCES_MAX,
    )


@bp.get('/missions/<mission_id>/modifier')
@connexion_requise
def modifier_formulaire(mission_id: str) -> ResponseReturnValue:
    mission = _charger(mission_id)
    _exiger_demandeur(mission)

    if not statuts.est_modifiable(mission.statut):
        flash('Seul un brouillon peut être modifié.', 'erreur')
        return redirect(url_for('missions.detail', mission_id=mission.id))

    return render_template(
        'missions/formulaire.html',
        mission=mission,
        valeurs={
            'objet': mission.objet,
            'lieu': mission.lieu,
            'analytique': mission.analytique or '',
            'date_depart': vers_saisie(mission.date_depart),
            'date_retour': vers_saisie(mission.date_retour),
            'transport_type': mission.transport_type.value,
            'transport_detail': mission.transport_detail or '',
            'litres_gasoil': str(mission.litres_gasoil) if mission.litres_gasoil else '',
        },
        erreurs={},
    )


@bp.post('/missions/<mission_id>/modifier')
@connexion_requise
def modifier(mission_id: str) -> ResponseReturnValue:
    mission = _charger(mission_id)
    _exiger_demandeur(mission)

    saisie = _saisie_depuis_formulaire()
    issue = service.modifier_brouillon(g.db, mission, saisie, utilisateur_courant(), ip_client())  # type: ignore[arg-type]

    if not issue.ok:
        flash(issue.erreur, 'erreur')
        return redirect(url_for('missions.detail', mission_id=mission.id))

    if request.form.get('action') == 'soumettre':
        return _soumettre(mission, saisie)

    flash(issue.message, 'succes')
    return redirect(url_for('missions.detail', mission_id=mission.id))


def _soumettre(mission: MissionOrder, saisie: Saisie) -> ResponseReturnValue:
    """Soumission, puis notification des RH.

    L'e-mail part après l'enregistrement : un échec d'envoi ne doit pas annuler
    la soumission. L'ordre reste SUBMITTED et le demandeur peut le renvoyer.
    """
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    issue = service.soumettre(g.db, mission, saisie, utilisateur, ip_client())

    if not issue.ok:
        return render_template(
            'missions/formulaire.html',
            mission=mission,
            valeurs=request.form.to_dict(),
            erreurs=issue.erreurs_champs,
            erreur_globale=issue.erreur,
        ), 400

    assert issue.mission is not None and issue.jetons is not None
    envoi = notifier_soumission_rh(g.db, _config(), issue.mission, issue.jetons)

    if envoi.ok:
        flash(issue.message, 'succes')
    else:
        flash(
            f'Ordre de mission {issue.mission.numero} enregistré, mais l’e-mail aux Ressources '
            'Humaines n’a pas pu être envoyé. Utilisez « Renvoyer aux RH » ci-dessous.',
            'attention',
        )

    return redirect(url_for('missions.detail', mission_id=issue.mission.id))


@bp.post('/missions/<mission_id>/annuler')
@connexion_requise
def annuler(mission_id: str) -> ResponseReturnValue:
    mission = _charger(mission_id)
    _exiger_demandeur(mission)

    issue = service.annuler(g.db, mission, utilisateur_courant(), ip_client())  # type: ignore[arg-type]
    flash(issue.message or issue.erreur, 'succes' if issue.ok else 'erreur')
    return redirect(url_for('missions.detail', mission_id=mission.id))


@bp.post('/missions/<mission_id>/supprimer')
@connexion_requise
def supprimer(mission_id: str) -> ResponseReturnValue:
    mission = _charger(mission_id)
    _exiger_demandeur(mission)

    issue = service.supprimer_brouillon(g.db, mission, utilisateur_courant(), ip_client())  # type: ignore[arg-type]

    if not issue.ok:
        flash(issue.erreur, 'erreur')
        return redirect(url_for('missions.detail', mission_id=mission_id))

    flash(issue.message, 'succes')
    return redirect(url_for('missions.tableau_de_bord'))


@bp.post('/missions/<mission_id>/relancer')
@connexion_requise
def relancer(mission_id: str) -> ResponseReturnValue:
    mission = _charger(mission_id)
    _exiger_demandeur(mission)

    issue = service.relancer(g.db, mission, utilisateur_courant(), ip_client())  # type: ignore[arg-type]

    if not issue.ok:
        flash(issue.erreur, 'erreur')
        return redirect(url_for('missions.detail', mission_id=mission.id))

    assert issue.mission is not None and issue.jetons is not None
    envoi = notifier_soumission_rh(g.db, _config(), issue.mission, issue.jetons, relance=True)

    if envoi.ok:
        flash(issue.message, 'succes')
    else:
        flash(
            'L’e-mail n’a pas pu être envoyé aux Ressources Humaines. '
            'Réessayez dans quelques minutes.',
            'erreur',
        )

    return redirect(url_for('missions.detail', mission_id=mission.id))
