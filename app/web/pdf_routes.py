"""Téléchargement et aperçu du PDF.

Le document est généré à la demande et n'est **jamais stocké** : l'offre
gratuite ne comporte pas de service de stockage, et Vercel n'a pas de disque
persistant.
"""

from __future__ import annotations

from flask import Blueprint, Response, abort, current_app, g, request

from app.config import Config
from app.domaine import audit, numerotation, requetes
from app.domaine.validations import Saisie, transport_ou_defaut, valider
from app.models import MissionOrder, MissionStatus, maintenant
from app.pdf.rendu import nom_fichier, rendre_avec_cache, rendre_mission
from app.web.securite import connexion_requise, utilisateur_courant

bp = Blueprint('pdf', __name__)


def _config() -> Config:
    return current_app.config['PORTEO']  # type: ignore[no-any-return]


def _reponse_pdf(contenu: bytes, nom: str) -> Response:
    return Response(
        contenu,
        mimetype='application/pdf',
        headers={
            'Content-Disposition': f'inline; filename="{nom}"',
            'Content-Length': str(len(contenu)),
            # Document nominatif : jamais mis en cache par un intermédiaire.
            'Cache-Control': 'private, no-store',
        },
    )


@bp.get('/missions/<mission_id>/pdf')
@connexion_requise
def telecharger(mission_id: str) -> Response:
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    # Règle 9 : un collaborateur n'accède qu'à ses propres ordres de mission.
    mission = requetes.trouver(g.db, utilisateur, mission_id)
    if mission is None:
        abort(404)

    config = _config()
    contenu = rendre_avec_cache(mission, config.url_verification(mission.numero))

    audit.journaliser(
        g.db,
        entite='MissionOrder',
        entite_id=mission.id,
        action='PDF_GENERATED',
        acteur=utilisateur.email,
        details={'numero': mission.numero},
    )

    return _reponse_pdf(contenu, nom_fichier(mission.numero, mission.nom))


@bp.post('/missions/apercu.pdf')
@connexion_requise
def apercu() -> Response:
    """Aperçu pendant la saisie, sans rien enregistrer.

    Le rendu s'appuie sur le **même code** que le PDF définitif : aperçu et
    document final ne peuvent pas diverger.
    """
    utilisateur = utilisateur_courant()
    assert utilisateur is not None

    formulaire = request.form
    resultat = valider(
        Saisie(
            objet=formulaire.get('objet', ''),
            lieu=formulaire.get('lieu', ''),
            analytique=formulaire.get('analytique', ''),
            date_depart=formulaire.get('date_depart', ''),
            date_retour=formulaire.get('date_retour', ''),
            transport_type=formulaire.get('transport_type', ''),
            transport_detail=formulaire.get('transport_detail', ''),
            litres_gasoil=formulaire.get('litres_gasoil', ''),
        )
    )
    valeurs = resultat.valeurs
    instant = maintenant()

    # Les champs invalides ou encore vides sont rendus en blanc, comme sur un
    # formulaire papier : l'aperçu ne doit jamais bloquer la saisie.
    provisoire = MissionOrder(
        id='apercu',
        numero=numerotation.numero_provisoire(),
        demandeur_id=utilisateur.id,
        nom=utilisateur.nom,
        prenoms=utilisateur.prenoms,
        matricule=utilisateur.matricule,
        fonction=utilisateur.fonction,
        analytique=valeurs.analytique if valeurs else (formulaire.get('analytique') or None),
        objet=valeurs.objet if valeurs else formulaire.get('objet', ''),
        lieu=valeurs.lieu if valeurs else formulaire.get('lieu', ''),
        date_depart=valeurs.date_depart if valeurs else instant,
        date_retour=valeurs.date_retour if valeurs else instant,
        transport_type=valeurs.transport_type
        if valeurs
        else transport_ou_defaut(formulaire.get('transport_type', '')),
        transport_detail=valeurs.transport_detail
        if valeurs
        else (formulaire.get('transport_detail') or None),
        litres_gasoil=valeurs.litres_gasoil if valeurs else None,
        statut=MissionStatus.DRAFT,
        motif_refus=None,
        decide_le=None,
        decide_par_nom=None,
        cree_le=instant,
        modifie_le=instant,
    )

    contenu = rendre_mission(provisoire, _config().url_verification('apercu'))
    return _reponse_pdf(contenu, 'apercu-ordre-de-mission.pdf')
