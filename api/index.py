"""Point d'entrée serverless (Vercel).

Vercel détecte `api/index.py` et sert l'objet WSGI nommé `app`. Toutes les
routes y sont dirigées par la réécriture déclarée dans `vercel.json` : une
seule fonction, donc un seul démarrage à froid, ce qui tient dans les quotas
du plan Hobby.

Le module est importé une fois par instance et réutilisé d'une invocation à
l'autre tant que l'instance reste chaude ; la connexion à Neon, elle, n'est
jamais mise en pool (voir `app.db.creer_moteur`).
"""

from __future__ import annotations

import sys
from pathlib import Path

# La racine du dépôt n'est pas sur le chemin d'import lorsque la fonction est
# exécutée depuis api/.
RACINE = Path(__file__).resolve().parent.parent
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

from app import creer_app  # noqa: E402  — après l'ajustement de sys.path

app = creer_app()
