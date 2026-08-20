"""Transport des e-mails : Resend en production, fichier en test.

`envoyer` ne lève jamais : un échec est renvoyé sous forme de résultat, afin
que l'appelant puisse le journaliser sans compromettre l'opération métier.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx

from app.models import maintenant

#: Répertoire du transport « fichier », lu par les tests. `MAILBOX_DIR` permet
#: aux tests de bout en bout d'isoler leur boîte de celle de la campagne unitaire.
BOITE = Path(os.environ.get('MAILBOX_DIR') or '.mailbox')

RESEND_URL = 'https://api.resend.com/emails'
DELAI_SECONDES = 8.0


@dataclass(frozen=True)
class PieceJointe:
    nom: str
    contenu: bytes


@dataclass(frozen=True)
class Message:
    destinataires: list[str]
    objet: str
    html: str
    texte: str = ''
    pieces_jointes: list[PieceJointe] = field(default_factory=list)


@dataclass(frozen=True)
class Resultat:
    ok: bool
    identifiant: str | None = None
    erreur: str | None = None


def _envoyer_vers_fichier(message: Message, quand: datetime) -> Resultat:
    """Écrit le message en JSON au lieu de l'envoyer. Jamais utilisé en production."""
    BOITE.mkdir(parents=True, exist_ok=True)
    identifiant = f'{int(quand.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}'

    (BOITE / f'{identifiant}.json').write_text(
        json.dumps(
            {
                'id': identifiant,
                'destinataires': message.destinataires,
                'objet': message.objet,
                'html': message.html,
                'texte': message.texte,
                'pieces_jointes': [
                    {'nom': piece.nom, 'taille': len(piece.contenu)}
                    for piece in message.pieces_jointes
                ],
                'envoye_le': quand.isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf-8',
    )

    return Resultat(ok=True, identifiant=identifiant)


def _envoyer_via_resend(message: Message, expediteur: str, cle_api: str) -> Resultat:
    if not cle_api:
        return Resultat(False, erreur="RESEND_API_KEY n'est pas configuré.")

    corps: dict[str, object] = {
        'from': expediteur,
        'to': message.destinataires,
        'subject': message.objet,
        'html': message.html,
    }
    if message.texte:
        corps['text'] = message.texte
    if message.pieces_jointes:
        corps['attachments'] = [
            {'filename': piece.nom, 'content': base64.b64encode(piece.contenu).decode('ascii')}
            for piece in message.pieces_jointes
        ]

    try:
        reponse = httpx.post(
            RESEND_URL,
            json=corps,
            headers={'Authorization': f'Bearer {cle_api}'},
            timeout=DELAI_SECONDES,
        )
    except httpx.HTTPError as erreur:
        return Resultat(False, erreur=f'Resend injoignable : {erreur}')

    if reponse.status_code >= 400:
        return Resultat(
            False, erreur=f'Resend a répondu {reponse.status_code} : {reponse.text[:200]}'
        )

    try:
        identifiant = str(reponse.json().get('id', ''))
    except ValueError:
        identifiant = ''

    return Resultat(ok=True, identifiant=identifiant or None)


def envoyer(message: Message, *, transport: str, expediteur: str, cle_api: str) -> Resultat:
    """Envoie un message. Ne lève jamais."""
    try:
        if transport == 'fichier':
            return _envoyer_vers_fichier(message, maintenant())
        return _envoyer_via_resend(message, expediteur, cle_api)
    except Exception as erreur:  # pragma: no cover - filet de sécurité
        return Resultat(False, erreur=f"Erreur inattendue lors de l'envoi : {erreur}")
