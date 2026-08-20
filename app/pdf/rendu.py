"""Rendu du PDF à la demande, avec cache mémoire court.

Le PDF n'est **jamais stocké** : l'offre gratuite ne comporte pas de service de
stockage, et Vercel n'a pas de disque persistant. Il est donc régénéré à chaque
demande, un cache de 60 secondes absorbant les rafales — aperçu, téléchargement
et pièce jointe d'e-mail portent souvent sur le même document.
"""

from __future__ import annotations

import time
import unicodedata
from collections import OrderedDict
from dataclasses import dataclass

from app.domaine.numerotation import est_provisoire
from app.models import MissionOrder
from app.pdf.document import DonneesPdf, rendre

DUREE_CACHE_SECONDES = 60
TAILLE_MAX_CACHE = 32


def depuis_mission(mission: MissionOrder, url_verification: str) -> DonneesPdf:
    """Projette un ordre de mission vers les données de rendu."""
    return DonneesPdf(
        numero=mission.numero,
        nom=mission.nom,
        prenoms=mission.prenoms,
        matricule=mission.matricule,
        fonction=mission.fonction,
        analytique=mission.analytique,
        objet=mission.objet,
        lieu=mission.lieu,
        date_depart=mission.date_depart,
        date_retour=mission.date_retour,
        transport_type=mission.transport_type,
        transport_detail=mission.transport_detail,
        litres_gasoil=mission.litres_gasoil,
        statut=mission.statut,
        motif_refus=mission.motif_refus,
        decide_le=mission.decide_le,
        decide_par_nom=mission.decide_par_nom,
        cree_le=mission.cree_le,
        url_verification=url_verification,
    )


def nom_fichier(numero: str, nom: str) -> str:
    """`OM-2026-0001_YEYE.pdf`, utilisable sur tout système et en en-tête HTTP."""
    sans_accents = unicodedata.normalize('NFD', nom)
    sans_accents = ''.join(c for c in sans_accents if unicodedata.category(c) != 'Mn')

    propre = ''.join(c if c.isalnum() else '-' for c in sans_accents)
    propre = '-'.join(part for part in propre.split('-') if part).upper() or 'COLLABORATEUR'

    numero_propre = (
        'OM-BROUILLON'
        if est_provisoire(numero)
        else ''.join(c for c in numero if c.isalnum() or c == '-')
    )

    return f'{numero_propre}_{propre}.pdf'


@dataclass
class _Entree:
    contenu: bytes
    expire_a: float


# Cache local à l'instance : sur Vercel chaque fonction a le sien, ce qui est
# sans conséquence puisque le rendu est déterministe.
_cache: OrderedDict[str, _Entree] = OrderedDict()


def clef_cache(mission: MissionOrder) -> str:
    """La clef intègre `modifie_le` : toute modification invalide l'entrée."""
    return f'{mission.numero}:{mission.modifie_le.timestamp()}'


def _purger(maintenant: float) -> None:
    for clef in [c for c, entree in _cache.items() if entree.expire_a <= maintenant]:
        _cache.pop(clef, None)

    while len(_cache) > TAILLE_MAX_CACHE:
        _cache.popitem(last=False)


def rendre_mission(mission: MissionOrder, url_verification: str) -> bytes:
    """Rendu sans cache — utilisé par l'aperçu, dont les données changent sans cesse."""
    return rendre(depuis_mission(mission, url_verification))


def rendre_avec_cache(mission: MissionOrder, url_verification: str) -> bytes:
    maintenant = time.monotonic()
    _purger(maintenant)

    clef = clef_cache(mission)
    entree = _cache.get(clef)
    if entree is not None and entree.expire_a > maintenant:
        return entree.contenu

    contenu = rendre_mission(mission, url_verification)
    _cache[clef] = _Entree(contenu=contenu, expire_a=maintenant + DUREE_CACHE_SECONDES)
    return contenu


def vider_cache() -> None:
    """Utilisé par les tests."""
    _cache.clear()
