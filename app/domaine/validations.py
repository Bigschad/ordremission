"""Règles métier de saisie d'un ordre de mission.

Chaque règle du cahier des charges est implémentée ici, indépendamment du web
et de la base : c'est ce qui la rend testable directement, et c'est le seul
endroit où elle est écrite. Les formulaires ne font que présenter les messages.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from app.domaine.dates import depuis_saisie
from app.models import TransportType

# Règle 2 — garde-fous de saisie rétroactive et d'anticipation.
RETROACTIVITE_MAX_JOURS = 30
ANTICIPATION_MAX_MOIS = 12

# Règle 8 — un refus exige un motif d'au moins 10 caractères.
MOTIF_REFUS_MIN = 10
MOTIF_REFUS_MAX = 1000

# Règle 3 — transports pour lesquels une quantité de gasoil est saisissable.
TRANSPORTS_AVEC_GASOIL: frozenset[TransportType] = frozenset(
    {
        TransportType.VEHICULE_ETABLISSEMENT,
        TransportType.VEHICULE_PERSONNEL,
        TransportType.VEHICULE_LOCATION,
    }
)

# Règle 4 — transports pour lesquels le détail est obligatoire.
TRANSPORTS_AVEC_DETAIL_OBLIGATOIRE: frozenset[TransportType] = frozenset(
    {TransportType.VEHICULE_LOCATION, TransportType.VEHICULE_PERSONNEL}
)

LIBELLES_TRANSPORT: dict[TransportType, str] = {
    TransportType.VEHICULE_ETABLISSEMENT: "Véhicule de l'établissement",
    TransportType.VEHICULE_PERSONNEL: 'Véhicule personnel',
    TransportType.VEHICULE_LOCATION: 'Véhicule de location',
    TransportType.TRANSPORT_EN_COMMUN: 'Transport en commun',
}

LIBELLES_DETAIL: dict[TransportType, str] = {
    TransportType.VEHICULE_ETABLISSEMENT: 'Immatriculation du véhicule',
    TransportType.VEHICULE_PERSONNEL: 'Immatriculation du véhicule',
    TransportType.VEHICULE_LOCATION: 'Nom du loueur',
    TransportType.TRANSPORT_EN_COMMUN: 'Ligne ou compagnie',
}

LITRES_MAX = Decimal('9999.99')


def transport_ou_defaut(brut: str) -> TransportType:
    """Moyen de transport saisi, ou valeur par défaut si la saisie est vide.

    Utilisé par le brouillon et l'aperçu, qui doivent accepter une saisie
    incomplète sans échouer.
    """
    try:
        return TransportType(brut)
    except ValueError:
        return TransportType.VEHICULE_ETABLISSEMENT


def accepte_gasoil(transport: TransportType) -> bool:
    return transport in TRANSPORTS_AVEC_GASOIL


def exige_detail(transport: TransportType) -> bool:
    return transport in TRANSPORTS_AVEC_DETAIL_OBLIGATOIRE


@dataclass
class Saisie:
    """Champs bruts du formulaire, tels qu'ils arrivent du navigateur."""

    objet: str = ''
    lieu: str = ''
    analytique: str = ''
    date_depart: str = ''
    date_retour: str = ''
    transport_type: str = ''
    transport_detail: str = ''
    litres_gasoil: str = ''


@dataclass
class Mission:
    """Saisie validée, prête à être enregistrée."""

    objet: str
    lieu: str
    analytique: str | None
    date_depart: datetime
    date_retour: datetime
    transport_type: TransportType
    transport_detail: str | None
    litres_gasoil: Decimal | None


@dataclass
class Resultat:
    """Issue d'une validation : les valeurs, ou les erreurs par champ."""

    valeurs: Mission | None = None
    erreurs: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.valeurs is not None and not self.erreurs


def _texte(valeur: str | None) -> str:
    return (valeur or '').strip()


def _analyser_litres(brut: str) -> tuple[Decimal | None, str | None]:
    """Accepte la virgule décimale, usage francophone. Vide ⇒ aucune dotation."""
    nettoye = _texte(brut).replace(',', '.').replace(' ', '')
    if not nettoye:
        return None, None

    try:
        valeur = Decimal(nettoye)
    except InvalidOperation:
        return None, 'Quantité de gasoil invalide'

    if valeur.is_nan() or valeur.is_infinite():
        return None, 'Quantité de gasoil invalide'
    if valeur < 0:
        return None, 'La quantité de gasoil ne peut pas être négative'
    if valeur > LITRES_MAX:
        return None, 'La quantité de gasoil ne peut pas dépasser 9 999,99 litres'
    exposant = valeur.as_tuple().exponent
    if isinstance(exposant, int) and -exposant > 2:
        return None, 'La quantité de gasoil admet au maximum deux décimales'

    return valeur, None


def _analyser_date(brut: str, champ: str, erreurs: dict[str, str]) -> datetime | None:
    texte = _texte(brut)
    if not texte:
        erreurs[champ] = 'Ce champ est obligatoire'
        return None
    try:
        return depuis_saisie(texte)
    except ValueError:
        erreurs[champ] = 'Date ou heure invalide'
        return None


def _analyser_transport(brut: str, erreurs: dict[str, str]) -> TransportType | None:
    texte = _texte(brut)
    if not texte:
        erreurs['transport_type'] = 'Le moyen de transport est obligatoire'
        return None
    try:
        return TransportType(texte)
    except ValueError:
        erreurs['transport_type'] = 'Moyen de transport inconnu'
        return None


def _borne_haute(reference: datetime) -> datetime:
    """Même jour, `ANTICIPATION_MAX_MOIS` plus tard."""
    mois = reference.month - 1 + ANTICIPATION_MAX_MOIS
    annee = reference.year + mois // 12
    mois = mois % 12 + 1
    jour = min(reference.day, [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1])
    return reference.replace(year=annee, month=mois, day=jour)


def valider(saisie: Saisie, aujourdhui: datetime | None = None) -> Resultat:
    """Applique l'ensemble des règles. `aujourdhui` rend les tests déterministes."""
    maintenant = aujourdhui or datetime.now(UTC)
    erreurs: dict[str, str] = {}

    objet = _texte(saisie.objet)
    if not objet:
        erreurs['objet'] = "L'objet de la mission est obligatoire"
    elif len(objet) > 300:
        erreurs['objet'] = "L'objet de la mission ne peut pas dépasser 300 caractères"

    lieu = _texte(saisie.lieu)
    if not lieu:
        erreurs['lieu'] = 'Le lieu de la mission est obligatoire'
    elif len(lieu) > 200:
        erreurs['lieu'] = 'Le lieu de la mission ne peut pas dépasser 200 caractères'

    analytique = _texte(saisie.analytique) or None
    if analytique and len(analytique) > 50:
        erreurs['analytique'] = 'Le code analytique ne peut pas dépasser 50 caractères'

    depart = _analyser_date(saisie.date_depart, 'date_depart', erreurs)
    retour = _analyser_date(saisie.date_retour, 'date_retour', erreurs)
    transport = _analyser_transport(saisie.transport_type, erreurs)

    detail = _texte(saisie.transport_detail) or None
    if detail and len(detail) > 200:
        erreurs['transport_detail'] = 'Le détail du transport ne peut pas dépasser 200 caractères'

    litres, erreur_litres = _analyser_litres(saisie.litres_gasoil)
    if erreur_litres:
        erreurs['litres_gasoil'] = erreur_litres

    # Règle 1 — la date de retour suit strictement la date de départ.
    if depart and retour and retour <= depart:
        erreurs['date_retour'] = 'La date de retour doit être postérieure à la date de départ'

    # Règle 2 — bornes de rétroactivité et d'anticipation.
    if depart:
        if depart < maintenant - timedelta(days=RETROACTIVITE_MAX_JOURS):
            erreurs['date_depart'] = (
                f'La date de départ ne peut pas précéder de plus de '
                f'{RETROACTIVITE_MAX_JOURS} jours la date du jour'
            )
        elif depart > _borne_haute(maintenant):
            erreurs['date_depart'] = (
                f'La date de départ ne peut pas dépasser {ANTICIPATION_MAX_MOIS} mois dans le futur'
            )

    if transport is not None:
        # Règle 3 — gasoil interdit pour le transport en commun.
        if litres is not None and not accepte_gasoil(transport):
            erreurs['litres_gasoil'] = (
                'Aucune quantité de gasoil ne peut être saisie pour un déplacement '
                'en transport en commun'
            )

        # Règle 4 — détail obligatoire pour véhicule personnel et de location.
        if exige_detail(transport) and not detail:
            erreurs['transport_detail'] = (
                'Le nom du loueur est obligatoire'
                if transport is TransportType.VEHICULE_LOCATION
                else "L'immatriculation du véhicule est obligatoire"
            )

    if erreurs:
        return Resultat(erreurs=erreurs)

    assert depart is not None and retour is not None and transport is not None
    return Resultat(
        valeurs=Mission(
            objet=objet,
            lieu=lieu,
            analytique=analytique,
            date_depart=depart,
            date_retour=retour,
            transport_type=transport,
            transport_detail=detail,
            litres_gasoil=litres,
        )
    )


def valider_motif_refus(brut: str) -> tuple[str | None, str | None]:
    """Règle 8 — motif de refus obligatoire, 10 caractères minimum."""
    motif = _texte(brut)

    if not motif:
        return None, 'Le motif du refus est obligatoire'
    if len(motif) < MOTIF_REFUS_MIN:
        return None, f'Le motif du refus doit comporter au moins {MOTIF_REFUS_MIN} caractères'
    if len(motif) > MOTIF_REFUS_MAX:
        return None, f'Le motif du refus ne peut pas dépasser {MOTIF_REFUS_MAX} caractères'

    return motif, None


def formater_litres(valeur: Decimal | float | None) -> str | None:
    """`40` ou `85,5` — les décimales inutiles ne sont pas imprimées."""
    if valeur is None:
        return None

    nombre = Decimal(str(valeur)).normalize()
    if nombre == nombre.to_integral_value():
        nombre = nombre.to_integral_value()

    return format(nombre, 'f').replace('.', ',')
