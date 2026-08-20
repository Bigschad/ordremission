"""File d'attente des Ressources Humaines et export CSV."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from typing import Any

from flask import (
    Blueprint,
    Response,
    current_app,
    flash,
    g,
    redirect,
    render_template,
    request,
    url_for,
)
from werkzeug.wrappers import Response as ReponseWerkzeug

from app.config import Config
from app.domaine import decision, requetes, statuts
from app.domaine.dates import format_datetime
from app.domaine.validations import LIBELLES_TRANSPORT, formater_litres, valider_motif_refus
from app.emails.notifications import notifier_decision
from app.models import MissionOrder, MissionStatus
from app.web.securite import ip_client, rh_requis, utilisateur_courant

bp = Blueprint('rh', __name__, url_prefix='/rh')

ENTETES_CSV = (
    'Numéro',
    'Statut',
    'Nom',
    'Prénoms',
    'Matricule',
    'Fonction',
    'Analytique',
    'Objet',
    'Lieu',
    'Départ',
    'Retour',
    'Transport',
    'Détail transport',
    'Litres de gasoil',
    'Soumis le',
    'Décidé le',
    'Décidé par',
    'Motif du refus',
)


def _config() -> Config:
    return current_app.config['PORTEO']  # type: ignore[no-any-return]


def _date(brut: str | None, fin_de_journee: bool = False) -> datetime | None:
    """Date `AAAA-MM-JJ` ; `fin_de_journee` cadre la borne supérieure."""
    if not brut:
        return None
    try:
        jour = datetime.strptime(brut, '%Y-%m-%d').replace(tzinfo=UTC)
    except ValueError:
        return None
    return jour.replace(hour=23, minute=59, second=59) if fin_de_journee else jour


def _filtres() -> requetes.Filtres:
    """Convertit les paramètres d'URL en filtres, en ignorant ce qui est invalide."""
    brut_statut = request.args.get('statut', '')
    try:
        statut = MissionStatus(brut_statut) if brut_statut else None
    except ValueError:
        statut = None

    tri = request.args.get('tri', 'recent')
    if tri not in requetes.TRIS_VALIDES:
        tri = 'recent'

    try:
        page = max(1, int(request.args.get('page', '1')))
    except ValueError:
        page = 1

    return requetes.Filtres(
        statut=statut,
        demandeur_id=request.args.get('demandeur') or None,
        lieu=request.args.get('lieu') or None,
        recherche=request.args.get('q') or None,
        du=_date(request.args.get('du')),
        au=_date(request.args.get('au'), fin_de_journee=True),
        tri=tri,
        page=page,
    )


@bp.get('/')
@rh_requis
def file() -> str:
    filtres = _filtres()
    return render_template(
        'rh/file.html',
        page=requetes.file_rh(g.db, filtres),
        filtres=filtres,
        compteurs=requetes.compter_par_statut(g.db),
        demandeurs=requetes.demandeurs(g.db),
        statuts_possibles=list(MissionStatus),
        tris=requetes.TRIS_VALIDES,
        args=request.args,
    )


def _retour_file() -> ReponseWerkzeug:
    """Renvoie à la file RH en conservant filtres, tri et pagination courants."""
    parametres: dict[str, Any] = dict(request.args)
    return redirect(url_for('rh.file', **parametres))


def _decider(mission_id: str, sens: str, motif: str | None = None) -> ReponseWerkzeug:
    """Décision prise depuis la file, par un utilisateur authentifié."""
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    resultat = decision.appliquer(
        g.db,
        mission_id=mission_id,
        sens=sens,
        valideur=decision.Valideur(
            id=utilisateur.id, nom=utilisateur.nom_complet, email=utilisateur.email
        ),
        motif_refus=motif,
        ip=ip_client(),
    )

    if not resultat.ok:
        flash(resultat.message, 'erreur')
        return _retour_file()

    assert resultat.mission is not None
    notifier_decision(g.db, _config(), resultat.mission, resultat.mission.demandeur.email)

    etat = 'validé' if sens == statuts.APPROVE else 'refusé'
    flash(
        f'Ordre de mission {resultat.mission.numero} {etat}. Le collaborateur en est informé.',
        'succes',
    )
    return _retour_file()


@bp.post('/<mission_id>/valider')
@rh_requis
def valider(mission_id: str) -> ReponseWerkzeug:
    return _decider(mission_id, statuts.APPROVE)


@bp.post('/<mission_id>/refuser')
@rh_requis
def refuser(mission_id: str) -> ReponseWerkzeug:
    motif, erreur = valider_motif_refus(request.form.get('motif', ''))

    if erreur:
        flash(erreur, 'erreur')
        return _retour_file()

    return _decider(mission_id, statuts.REJECT, motif)


def _ligne_csv(mission: MissionOrder) -> list[str]:
    litres = formater_litres(mission.litres_gasoil)
    return [
        mission.numero,
        statuts.libelle(mission.statut),
        mission.nom,
        mission.prenoms,
        mission.matricule,
        mission.fonction,
        mission.analytique or '',
        mission.objet,
        mission.lieu,
        format_datetime(mission.date_depart),
        format_datetime(mission.date_retour),
        LIBELLES_TRANSPORT[mission.transport_type],
        mission.transport_detail or '',
        litres or '',
        format_datetime(mission.soumis_le) if mission.soumis_le else '',
        format_datetime(mission.decide_le) if mission.decide_le else '',
        mission.decide_par_nom or '',
        mission.motif_refus or '',
    ]


@bp.get('/export.csv')
@rh_requis
def export() -> Response:
    """Export CSV, avec les mêmes filtres que l'écran.

    Séparateur `;` et BOM UTF-8 : c'est ce qu'attend Excel en configuration
    francophone, sans quoi les accents et les colonnes sont illisibles.
    """
    tampon = io.StringIO()
    tampon.write('﻿')

    redacteur = csv.writer(tampon, delimiter=';', lineterminator='\r\n', quoting=csv.QUOTE_MINIMAL)
    redacteur.writerow(ENTETES_CSV)
    for mission in requetes.pour_export(g.db, _filtres()):
        redacteur.writerow(_ligne_csv(mission))

    nom = f'ordres-de-mission-{datetime.now(UTC).strftime("%Y-%m-%d")}.csv'

    return Response(
        tampon.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{nom}"',
            'Cache-Control': 'private, no-store',
        },
    )
