"""Notifications : objets, pièces jointes, liens et motifs."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Config
from app.domaine import jetons
from app.emails.notifications import notifier_connexion, notifier_decision, notifier_soumission_rh
from app.emails.transport import BOITE, Message, PieceJointe, envoyer
from app.models import AuditLog, MissionOrder, MissionStatus, maintenant
from tests.conftest import creer_mission, creer_utilisateur


def messages() -> list[dict[str, Any]]:
    if not Path(BOITE).exists():
        return []
    return [
        json.loads(fichier.read_text(encoding='utf-8'))
        for fichier in sorted(Path(BOITE).glob('*.json'))
    ]


@pytest.fixture
def mission(session: Session) -> MissionOrder:
    demandeur = creer_utilisateur(session)
    mission = creer_mission(session, demandeur, numero='OM-2026-0001')
    mission.analytique = 'IT-2026-001'
    session.flush()
    return mission


@pytest.mark.usefixtures('boite_vide')
class TestTransportDeTest:
    def test_ecrit_le_message_sur_disque(self, config: Config) -> None:
        resultat = envoyer(
            Message(destinataires=['rh@porteo-group.com'], objet='Essai', html='<p>Bonjour</p>'),
            transport='fichier',
            expediteur=config.email_from,
            cle_api='',
        )

        assert resultat.ok
        assert len(messages()) == 1
        assert messages()[0]['objet'] == 'Essai'


@pytest.mark.usefixtures('boite_vide')
class TestNotificationRH:
    def test_objet_conforme_au_cahier_des_charges(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)
        envoi = notifier_soumission_rh(session, config, mission, paire)

        assert envoi.ok
        assert envoi.destinataires == ('rh@porteo-group.com',)

        objet = messages()[0]['objet']
        assert objet.startswith(
            '[Ordre de mission OM-2026-0001] SCHADRACH GUY-ROLAND YEYE — Assinie'
        )
        assert ' du ' in objet and ' au ' in objet

    def test_joint_le_pdf_sous_le_nom_attendu(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        notifier_soumission_rh(session, config, mission, jetons.emettre(session, mission.id))

        pieces = messages()[0]['pieces_jointes']
        assert len(pieces) == 1
        assert pieces[0]['nom'] == 'OM-2026-0001_YEYE.pdf'
        assert pieces[0]['taille'] > 1000

    def test_insere_les_deux_liens_de_decision(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        paire = jetons.emettre(session, mission.id)
        notifier_soumission_rh(session, config, mission, paire)

        message = messages()[0]
        assert f'/approve/{paire.approuver}' in message['html']
        assert f'/reject/{paire.refuser}' in message['html']
        assert f'/approve/{paire.approuver}' in message['texte']

    def test_recapitulatif_complet(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        notifier_soumission_rh(session, config, mission, jetons.emettre(session, mission.id))
        html = messages()[0]['html']

        for valeur in (
            'OM-2026-0001',
            'YEYE',
            'IT-2026-001',
            'Visite chantier',
            'Assinie',
            '40 litres de gasoil',
        ):
            assert valeur in html, f'valeur absente : {valeur}'

    def test_signale_la_relance(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        notifier_soumission_rh(
            session, config, mission, jetons.emettre(session, mission.id), relance=True
        )
        assert 'Rappel' in messages()[0]['html']

    def test_journalise_lenvoi(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        notifier_soumission_rh(session, config, mission, jetons.emettre(session, mission.id))

        actions = [
            entree.action
            for entree in session.scalars(select(AuditLog).where(AuditLog.entite_id == mission.id))
        ]
        assert 'EMAIL_SENT' in actions


@pytest.mark.usefixtures('boite_vide')
class TestNotificationDecision:
    def test_valide_joint_le_pdf(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        mission.statut = MissionStatus.APPROVED
        mission.decide_le = maintenant()
        mission.decide_par_nom = 'FATOUMATA DIALLO'
        session.flush()

        envoi = notifier_decision(session, config, mission, mission.demandeur.email)
        assert envoi.ok

        message = messages()[0]
        assert message['objet'] == 'Ordre de mission OM-2026-0001 — validé'
        assert len(message['pieces_jointes']) == 1
        assert 'FATOUMATA DIALLO' in message['html']

    def test_refus_met_le_motif_en_evidence_sans_piece_jointe(
        self, session: Session, config: Config, mission: MissionOrder
    ) -> None:
        mission.statut = MissionStatus.REJECTED
        mission.decide_le = maintenant()
        mission.motif_refus = 'Budget déplacement déjà consommé pour le mois en cours.'
        session.flush()

        notifier_decision(session, config, mission, mission.demandeur.email)

        message = messages()[0]
        assert message['objet'] == 'Ordre de mission OM-2026-0001 — refusé'
        assert message['pieces_jointes'] == []
        assert 'Motif du refus' in message['html']
        assert 'Budget' in message['html']
        assert 'Budget' in message['texte']


@pytest.mark.usefixtures('boite_vide')
class TestNotificationConnexion:
    def test_lien_de_connexion(self, session: Session, config: Config) -> None:
        utilisateur = creer_utilisateur(session)
        envoi = notifier_connexion(
            session,
            config,
            utilisateur.email,
            'http://localhost:5000/login/callback?jeton=abc',
            utilisateur.id,
        )

        assert envoi.ok
        message = messages()[0]
        assert message['objet'] == 'Votre lien de connexion — Ordres de mission Porteo'
        assert 'jeton=abc' in message['html']
        assert '15 minutes' in message['html']


class TestTransportResend:
    """Le transport de production, isolé du réseau.

    Aucune de ces situations ne doit lever : un e-mail perdu ne doit jamais
    annuler la soumission ou la décision qui vient d'être enregistrée.
    """

    message = Message(
        destinataires=['rh@porteo-group.com'],
        objet='Ordre de mission OM-2026-0001',
        html='<p>Bonjour</p>',
        texte='Bonjour',
    )

    def test_la_cle_absente_est_signalee_sans_appel_reseau(self) -> None:
        resultat = envoyer(self.message, transport='resend', expediteur='om@porteo', cle_api='')

        assert resultat.ok is False
        assert resultat.erreur == "RESEND_API_KEY n'est pas configuré."

    def test_envoi_reussi(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.emails import transport

        captures: dict[str, Any] = {}

        def faux_post(url: str, **options: Any) -> Any:
            captures['url'] = url
            captures.update(options)
            return httpx.Response(200, json={'id': 'msg_42'})

        monkeypatch.setattr(httpx, 'post', faux_post)

        piece = PieceJointe(nom='OM-2026-0001_YEYE.pdf', contenu=b'%PDF-1.4 ...')
        message = Message(
            destinataires=['rh@porteo-group.com'],
            objet='Ordre de mission',
            html='<p>Bonjour</p>',
            texte='Bonjour',
            pieces_jointes=[piece],
        )

        resultat = envoyer(
            message, transport='resend', expediteur='om@porteo-group.com', cle_api='re_secret'
        )

        assert resultat.ok
        assert resultat.identifiant == 'msg_42'
        assert captures['url'] == transport.RESEND_URL
        assert captures['headers'] == {'Authorization': 'Bearer re_secret'}

        corps = captures['json']
        assert corps['from'] == 'om@porteo-group.com'
        assert corps['to'] == ['rh@porteo-group.com']
        assert corps['text'] == 'Bonjour'
        # La pièce jointe voyage en base64.
        assert corps['attachments'][0]['filename'] == piece.nom
        assert base64.b64decode(corps['attachments'][0]['content']) == piece.contenu

    def test_une_erreur_http_est_rendue_lisible(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            httpx,
            'post',
            lambda *a, **k: httpx.Response(422, text='domaine non vérifié'),
        )

        resultat = envoyer(
            self.message, transport='resend', expediteur='om@porteo', cle_api='re_secret'
        )

        assert resultat.ok is False
        assert resultat.erreur is not None
        assert '422' in resultat.erreur
        assert 'domaine non vérifié' in resultat.erreur

    def test_un_service_injoignable_ne_leve_pas(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def coupure(*_args: Any, **_options: Any) -> Any:
            raise httpx.ConnectTimeout('délai dépassé')

        monkeypatch.setattr(httpx, 'post', coupure)

        resultat = envoyer(
            self.message, transport='resend', expediteur='om@porteo', cle_api='re_secret'
        )

        assert resultat.ok is False
        assert resultat.erreur is not None
        assert 'injoignable' in resultat.erreur

    def test_une_reponse_sans_json_reste_un_succes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Le message est parti : l'absence d'identifiant n'est pas un échec."""

        monkeypatch.setattr(httpx, 'post', lambda *a, **k: httpx.Response(200, text='ok'))

        resultat = envoyer(
            self.message, transport='resend', expediteur='om@porteo', cle_api='re_secret'
        )

        assert resultat.ok
        assert resultat.identifiant is None
