"""Parcours de bout en bout, à travers les vraies routes HTTP.

Ces tests couvrent les scénarios du cahier des charges : connexion par lien
magique, brouillon → modification → soumission → e-mail RH, décision depuis la
boîte mail sans connexion, refus sans puis avec motif, et rejeu d'un lien.
"""

from __future__ import annotations

import html
import json
import re
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from flask.testing import FlaskClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.emails.transport import BOITE
from app.models import MissionOrder, MissionStatus, Role, User, maintenant
from tests.conftest import connecter, creer_utilisateur, rafraichir


def messages() -> list[dict[str, Any]]:
    if not Path(BOITE).exists():
        return []
    return [
        json.loads(fichier.read_text(encoding='utf-8'))
        for fichier in sorted(Path(BOITE).glob('*.json'))
    ]


def lien(motif: str) -> str:
    for message in reversed(messages()):
        source = f'{message["texte"]}\n{message["html"]}'
        trouve = re.search(rf'https?://[^\s"\'<>]*{motif}', source)
        if trouve:
            return trouve.group(0).replace('&amp;', '&')
    raise AssertionError(f'aucun lien « {motif} » dans {len(messages())} message(s)')


def texte(reponse: Any) -> str:
    """Corps de la réponse, entités résolues et apostrophes normalisées.

    Jinja échappe l'apostrophe droite en `&#39;` et les gabarits emploient
    l'apostrophe typographique : les assertions porteraient sinon sur la forme
    encodée plutôt que sur la phrase lue par l'utilisateur.
    """
    corps: str = reponse.get_data(as_text=True)
    return html.unescape(corps).replace('\u2019', "'")


def chemin(url: str) -> str:
    """Ramène une URL absolue au chemin utilisable par le client de test."""
    return url.split('://', 1)[1].split('/', 1)[1].join(('/', ''))


def formulaire_valide(**surcharges: str) -> dict[str, str]:
    depart = maintenant() + timedelta(days=7)
    valeurs = {
        'objet': 'Visite chantier',
        'lieu': 'Assinie',
        'analytique': 'IT-2026-001',
        'date_depart': depart.strftime('%Y-%m-%dT08:00'),
        'date_retour': depart.strftime('%Y-%m-%dT17:00'),
        'transport_type': 'VEHICULE_ETABLISSEMENT',
        'transport_detail': '1234 AB 01',
        'litres_gasoil': '40',
    }
    valeurs.update(surcharges)
    return valeurs


@pytest.fixture
def collaborateur(session: Session) -> User:
    return creer_utilisateur(session, email='schadrach.yeye@porteo-group.com')


@pytest.fixture
def rh(session: Session) -> User:
    return creer_utilisateur(
        session, nom='DIALLO', prenoms='FATOUMATA', role=Role.HR, email='rh@porteo-group.com'
    )


# ---------------------------------------------------------------------------
# Scénario 1 — connexion par lien magique
# ---------------------------------------------------------------------------


def test_1_connexion_par_lien_magique(
    client: FlaskClient, session: Session, collaborateur: User
) -> None:
    reponse = client.post('/login', data={'email': collaborateur.email, 'suite': '/'})
    assert reponse.status_code == 200
    assert 'Vérifiez votre boîte mail' in texte(reponse)

    url = lien(r'/login/callback\?[^\s"\'<>]+')
    suite = client.get(chemin(url), follow_redirects=True)

    corps = texte(suite)
    assert 'Mes ordres de mission' in corps
    assert collaborateur.prenoms in corps


def test_1bis_une_adresse_inconnue_ne_revele_rien(client: FlaskClient, session: Session) -> None:
    """Réponse identique à celle d'une adresse connue : aucune énumération possible."""
    reponse = client.post('/login', data={'email': 'intrus@exemple.com', 'suite': '/'})

    assert reponse.status_code == 200
    assert 'Vérifiez votre boîte mail' in texte(reponse)
    assert messages() == []
    assert session.scalars(select(User).where(User.email == 'intrus@exemple.com')).all() == []


def test_1ter_un_lien_de_connexion_ne_sert_quune_fois(
    client: FlaskClient, session: Session, collaborateur: User
) -> None:
    client.post('/login', data={'email': collaborateur.email, 'suite': '/'})
    url = chemin(lien(r'/login/callback\?[^\s"\'<>]+'))

    assert client.get(url).status_code == 302

    client.post('/logout')
    rejeu = client.get(url)
    assert rejeu.status_code == 400
    assert "n'est plus valable" in texte(rejeu)


def test_1quater_un_compte_desactive_ne_recoit_rien(client: FlaskClient, session: Session) -> None:
    inactif = creer_utilisateur(session, actif=False)
    reponse = client.post('/login', data={'email': inactif.email, 'suite': '/'})

    assert reponse.status_code == 200
    assert messages() == []


# ---------------------------------------------------------------------------
# Scénario 2 — brouillon, modification, soumission
# ---------------------------------------------------------------------------


def test_2_brouillon_modification_soumission(
    client: FlaskClient, session: Session, collaborateur: User, rh: User
) -> None:
    connecter(client, collaborateur)

    # -- Brouillon --------------------------------------------------------
    reponse = client.post('/missions/nouveau', data={**formulaire_valide(), 'action': 'brouillon'})
    assert reponse.status_code == 302

    rafraichir(session)
    mission = session.scalars(select(MissionOrder)).one()
    assert mission.statut is MissionStatus.DRAFT
    assert mission.objet == 'Visite chantier'

    # -- Modification ------------------------------------------------------
    client.post(
        f'/missions/{mission.id}/modifier',
        data={**formulaire_valide(lieu='Grand-Bassam'), 'action': 'brouillon'},
    )
    rafraichir(session)
    assert session.get(MissionOrder, mission.id).lieu == 'Grand-Bassam'  # type: ignore[union-attr]

    # -- Soumission --------------------------------------------------------
    client.post(
        f'/missions/{mission.id}/modifier',
        data={**formulaire_valide(lieu='Grand-Bassam'), 'action': 'soumettre'},
    )

    rafraichir(session)
    soumise = session.get(MissionOrder, mission.id)
    assert soumise is not None
    assert soumise.statut is MissionStatus.SUBMITTED
    assert re.match(r'^OM-\d{4}-0001$', soumise.numero)
    assert soumise.soumis_le is not None

    # -- E-mail reçu par les Ressources Humaines ----------------------------
    courriel = messages()[-1]
    assert courriel['destinataires'] == ['rh@porteo-group.com']
    assert f'[Ordre de mission {soumise.numero}]' in courriel['objet']
    assert 'Grand-Bassam' in courriel['objet']
    assert courriel['pieces_jointes'][0]['nom'] == f'{soumise.numero}_YEYE.pdf'
    assert re.search(r'/approve/[A-Za-z0-9_-]{20,}', courriel['html'])
    assert re.search(r'/reject/[A-Za-z0-9_-]{20,}', courriel['html'])


def test_2bis_une_saisie_invalide_est_refusee(
    client: FlaskClient, session: Session, collaborateur: User
) -> None:
    connecter(client, collaborateur)

    reponse = client.post(
        '/missions/nouveau',
        data={
            **formulaire_valide(transport_type='VEHICULE_LOCATION', transport_detail=''),
            'action': 'soumettre',
        },
    )

    assert reponse.status_code == 400
    assert 'Le nom du loueur est obligatoire' in texte(reponse)

    rafraichir(session)
    mission = session.scalars(select(MissionOrder)).one()
    assert mission.statut is MissionStatus.DRAFT


# ---------------------------------------------------------------------------
# Scénario 3 — validation RH depuis l'e-mail, sans connexion
# ---------------------------------------------------------------------------


def _soumettre(client: FlaskClient, session: Session, collaborateur: User) -> MissionOrder:
    connecter(client, collaborateur)
    client.post('/missions/nouveau', data={**formulaire_valide(), 'action': 'soumettre'})
    rafraichir(session)
    return session.scalars(select(MissionOrder)).one()


def test_3_validation_depuis_la_boite_mail(
    client: FlaskClient, app: Any, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)
    url = chemin(lien(r'/approve/[A-Za-z0-9_-]+'))

    # Les RH ouvrent le lien sans session applicative.
    anonyme = app.test_client()

    apercu = anonyme.get(url)
    assert apercu.status_code == 200
    assert mission.numero in texte(apercu)

    # Le simple affichage ne doit produire aucun effet.
    rafraichir(session)
    assert session.get(MissionOrder, mission.id).statut is MissionStatus.SUBMITTED  # type: ignore[union-attr]

    confirmation = anonyme.post(url)
    assert confirmation.status_code == 200
    assert 'validé' in texte(confirmation)

    rafraichir(session)
    validee = session.get(MissionOrder, mission.id)
    assert validee is not None
    assert validee.statut is MissionStatus.APPROVED
    assert validee.decide_le is not None
    assert validee.decide_par_nom

    # Le demandeur est informé, PDF validé à l'appui.
    courriel = messages()[-1]
    assert courriel['destinataires'] == [collaborateur.email]
    assert courriel['objet'] == f'Ordre de mission {validee.numero} — validé'
    assert len(courriel['pieces_jointes']) == 1


# ---------------------------------------------------------------------------
# Scénario 4 — refus : motif obligatoire
# ---------------------------------------------------------------------------


def test_4_refus_sans_puis_avec_motif(
    client: FlaskClient, app: Any, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)
    url = chemin(lien(r'/reject/[A-Za-z0-9_-]+'))
    anonyme = app.test_client()

    # -- Motif trop court : le refus est bloqué ----------------------------
    refus = anonyme.post(url, data={'motif': 'Non'})
    assert refus.status_code == 400
    assert 'au moins 10 caractères' in texte(refus)

    rafraichir(session)
    assert session.get(MissionOrder, mission.id).statut is MissionStatus.SUBMITTED  # type: ignore[union-attr]

    # -- Motif suffisant : le refus est enregistré -------------------------
    motif = 'Budget déplacement du service déjà consommé pour le mois en cours.'
    confirme = anonyme.post(url, data={'motif': motif})
    assert confirme.status_code == 200
    assert 'refusé' in texte(confirme)

    rafraichir(session)
    refusee = session.get(MissionOrder, mission.id)
    assert refusee is not None
    assert refusee.statut is MissionStatus.REJECTED
    assert refusee.motif_refus == motif

    courriel = messages()[-1]
    assert 'refusé' in courriel['objet']
    assert 'Budget' in courriel['html']
    assert courriel['pieces_jointes'] == []


# ---------------------------------------------------------------------------
# Scénario 5 — rejeu d'un lien déjà consommé
# ---------------------------------------------------------------------------


def test_5_un_lien_deja_utilise_na_plus_aucun_effet(
    client: FlaskClient, app: Any, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)
    url_valider = chemin(lien(r'/approve/[A-Za-z0-9_-]+'))
    url_refuser = chemin(lien(r'/reject/[A-Za-z0-9_-]+'))

    anonyme = app.test_client()
    anonyme.post(url_valider)

    rafraichir(session)
    apres = session.get(MissionOrder, mission.id)
    assert apres is not None
    decision_initiale = apres.decide_le

    # -- Rejeu du lien de validation ---------------------------------------
    rejeu = anonyme.post(url_valider)
    assert rejeu.status_code == 410
    corps = texte(rejeu)
    assert 'Lien inutilisable' in corps
    assert 'décision a déjà été prise' in corps

    # -- Le lien de refus, jamais utilisé, est caduc lui aussi (règle 7) ----
    caduc = anonyme.get(url_refuser)
    assert caduc.status_code == 410
    assert 'Lien inutilisable' in texte(caduc)

    # -- Aucun changement d'état -------------------------------------------
    rafraichir(session)
    finale = session.get(MissionOrder, mission.id)
    assert finale is not None
    assert finale.statut is MissionStatus.APPROVED
    assert finale.decide_le == decision_initiale
    assert finale.motif_refus is None


# ---------------------------------------------------------------------------
# Cloisonnement (règle 9) et pages publiques
# ---------------------------------------------------------------------------


def test_un_collaborateur_ne_voit_pas_lordre_dun_autre(
    client: FlaskClient, session: Session, collaborateur: User
) -> None:
    autre = creer_utilisateur(session)
    mission = _soumettre(client, session, autre)

    connecter(client, collaborateur)
    assert client.get(f'/missions/{mission.id}').status_code == 404
    assert client.get(f'/missions/{mission.id}/pdf').status_code == 404


def test_un_collaborateur_na_acces_ni_a_la_file_rh_ni_a_ladministration(
    client: FlaskClient, session: Session, collaborateur: User
) -> None:
    connecter(client, collaborateur)
    assert client.get('/rh/').status_code == 403
    assert client.get('/admin/utilisateurs').status_code == 403
    assert client.get('/rh/export.csv').status_code == 403


def test_les_pages_protegees_redirigent_vers_la_connexion(client: FlaskClient) -> None:
    for chemin_protege in ('/', '/missions/nouveau'):
        reponse = client.get(chemin_protege)
        assert reponse.status_code == 302
        assert '/login' in reponse.headers['Location']


def test_verification_publique(
    client: FlaskClient, app: Any, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)

    anonyme = app.test_client()
    reponse = anonyme.get(f'/verify/{mission.numero}')
    corps = texte(reponse)

    assert reponse.status_code == 200
    assert mission.numero in corps
    assert mission.lieu in corps
    # Aucune donnée personnelle sensible.
    assert mission.matricule not in corps
    assert "n'est pas validé" in corps

    inconnu = anonyme.get('/verify/OM-1999-9999')
    assert 'Ordre de mission inconnu' in texte(inconnu)


def test_entetes_de_securite(client: FlaskClient) -> None:
    entetes = client.get('/login').headers

    assert entetes['X-Frame-Options'] == 'DENY'
    assert entetes['X-Content-Type-Options'] == 'nosniff'
    assert 'Content-Security-Policy' in entetes
    assert 'Strict-Transport-Security' in entetes
    assert entetes['Referrer-Policy'] == 'strict-origin-when-cross-origin'


def test_telechargement_du_pdf(
    client: FlaskClient, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)

    reponse = client.get(f'/missions/{mission.id}/pdf')
    assert reponse.status_code == 200
    assert reponse.mimetype == 'application/pdf'
    assert reponse.data.startswith(b'%PDF-')
    assert f'{mission.numero}_YEYE.pdf' in reponse.headers['Content-Disposition']


def test_export_csv_pour_les_rh(
    client: FlaskClient, session: Session, collaborateur: User, rh: User
) -> None:
    mission = _soumettre(client, session, collaborateur)

    connecter(client, rh)
    reponse = client.get('/rh/export.csv')
    corps = texte(reponse)

    assert reponse.status_code == 200
    # BOM UTF-8 et séparateur point-virgule : lisible par Excel francophone.
    assert corps.startswith('﻿')
    assert 'Numéro;Statut;Nom;Prénoms' in corps
    assert mission.numero in corps
