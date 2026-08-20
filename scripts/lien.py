"""Affiche les liens contenus dans les e-mails du transport de test.

    python -m scripts.lien             dernier message
    python -m scripts.lien connexion   dernier lien de connexion
    python -m scripts.lien approve     dernier lien de validation RH
    python -m scripts.lien reject      dernier lien de refus RH

Évite d'ouvrir une vraie boîte mail pour tester en local.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from app.emails.transport import BOITE

MOTIFS: dict[str, str] = {
    'connexion': r'/login/callback\?[^\s"\'<>]+',
    'approve': r'/approve/[A-Za-z0-9_-]+',
    'reject': r'/reject/[A-Za-z0-9_-]+',
}


def _messages() -> list[dict[str, Any]]:
    if not BOITE.exists():
        print(
            f"Aucun message : le dossier {BOITE} n'existe pas.\n"
            'Vérifiez que EMAIL_TRANSPORT="fichier" figure dans votre .env, '
            'puis refaites une action qui déclenche un e-mail.',
            file=sys.stderr,
        )
        raise SystemExit(1)

    fichiers = sorted(Path(BOITE).glob('*.json'))
    return [json.loads(fichier.read_text(encoding='utf-8')) for fichier in fichiers]


def _extraire(message: dict[str, Any], motif: str) -> str | None:
    # La version texte est prioritaire : elle ne contient aucune entité HTML.
    source = f'{message.get("texte", "")}\n{message.get("html", "")}'
    trouve = re.search(rf'https?://[^\s"\'<>]*{motif}', source)
    return trouve.group(0).replace('&amp;', '&') if trouve else None


def main() -> None:
    messages = _messages()

    if not messages:
        print(f'Aucun message dans {BOITE}.', file=sys.stderr)
        raise SystemExit(1)

    demande = sys.argv[1] if len(sys.argv) > 1 else None

    if demande in MOTIFS:
        for message in reversed(messages):
            lien = _extraire(message, MOTIFS[demande])
            if lien:
                print(lien)
                return

        print(f'Aucun lien « {demande} » dans les {len(messages)} message(s).', file=sys.stderr)
        raise SystemExit(1)

    dernier = messages[-1]
    print(f'À        : {", ".join(dernier["destinataires"])}')
    print(f'Objet    : {dernier["objet"]}')

    pieces = dernier.get('pieces_jointes') or []
    if pieces:
        print(f'Pièces   : {", ".join(p["nom"] for p in pieces)}')

    print('Liens    :')
    trouve = False
    for nom, motif in MOTIFS.items():
        lien = _extraire(dernier, motif)
        if lien:
            print(f'  {nom:<10} {lien}')
            trouve = True

    if not trouve:
        print('  (aucun)')


if __name__ == '__main__':
    main()
