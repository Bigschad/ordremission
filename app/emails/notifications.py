"""Notifications liées au cycle de vie d'un ordre de mission.

Aucune de ces fonctions ne lève : un échec d'envoi est journalisé dans le
journal d'audit et remonté à l'appelant, mais **ne remet jamais en cause
l'opération métier** — un ordre soumis reste soumis même si l'e-mail échoue,
charge au demandeur d'utiliser « Renvoyer aux RH ».
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.config import Config
from app.domaine import audit, jetons
from app.domaine.dates import format_datetime, format_jour_mois, format_long
from app.domaine.validations import LIBELLES_TRANSPORT, formater_litres
from app.emails.transport import Message, PieceJointe, Resultat, envoyer
from app.models import MissionOrder, MissionStatus
from app.pdf.rendu import nom_fichier, rendre_avec_cache

_GABARITS = Environment(
    loader=FileSystemLoader(Path(__file__).parent / 'templates'),
    autoescape=select_autoescape(['html']),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _rendre(gabarit: str, **contexte: object) -> str:
    return _GABARITS.get_template(gabarit).render(**contexte)


def _recapitulatif(mission: MissionOrder) -> list[tuple[str, str]]:
    """Lignes du tableau récapitulatif, dans l'ordre du formulaire papier."""
    lignes: list[tuple[str, str]] = [
        ('Numéro', mission.numero),
        ('Nom', mission.nom),
        ('Prénoms', mission.prenoms),
        ('Matricule', mission.matricule),
        ('Fonction', mission.fonction),
    ]

    if mission.analytique:
        lignes.append(('Analytique', mission.analytique))

    lignes += [
        ('Objet de la mission', mission.objet),
        ('Lieu de la mission', mission.lieu),
        ('Date de départ', format_long(mission.date_depart)),
        ('Date de retour', format_long(mission.date_retour)),
        ('Moyen de transport', LIBELLES_TRANSPORT[mission.transport_type]),
    ]

    if mission.transport_detail:
        lignes.append(('Détail du transport', mission.transport_detail))

    litres = formater_litres(mission.litres_gasoil)
    lignes.append(
        ('Carburant', f'{litres} litres de gasoil' if litres else 'Sans dotation de gasoil')
    )

    return lignes


@dataclass(frozen=True)
class Envoi(Resultat):
    destinataires: tuple[str, ...] = ()


def _journaliser(session: Session, mission_id: str, resultat: Resultat, **details: object) -> None:
    audit.journaliser(
        session,
        entite='MissionOrder',
        entite_id=mission_id,
        action='EMAIL_SENT' if resultat.ok else 'EMAIL_FAILED',
        acteur='SYSTEM',
        details={**details, 'erreur': resultat.erreur},
    )


def _pdf(mission: MissionOrder, config: Config) -> bytes | None:
    """Le PDF ne doit pas empêcher la notification : un échec est absorbé."""
    try:
        return rendre_avec_cache(mission, config.url_verification(mission.numero))
    except Exception as erreur:  # pragma: no cover - filet de sécurité
        print(f'Échec de génération du PDF joint : {erreur}')
        return None


def notifier_connexion(
    session: Session, config: Config, email: str, url: str, utilisateur_id: str
) -> Envoi:
    """Lien de connexion — l'application n'utilise aucun mot de passe."""
    duree = config.duree_lien_connexion_minutes
    objet = 'Votre lien de connexion — Ordres de mission Porteo'

    html = _rendre(
        'connexion.html',
        objet=objet,
        apercu='Votre lien de connexion aux ordres de mission Porteo',
        url=url,
        duree_minutes=duree,
    )
    texte = (
        'Votre lien de connexion aux ordres de mission PORTEO GROUP :\n\n'
        f'{url}\n\n'
        f"Ce lien est valable {duree} minutes et ne peut servir qu'une seule fois."
    )

    resultat = envoyer(
        Message(destinataires=[email], objet=objet, html=html, texte=texte),
        transport=config.email_transport,
        expediteur=config.email_from,
        cle_api=config.resend_api_key,
    )

    audit.journaliser(
        session,
        entite='Auth',
        entite_id=utilisateur_id,
        action='EMAIL_SENT' if resultat.ok else 'EMAIL_FAILED',
        acteur=email,
        details={'type': 'MAGIC_LINK', 'erreur': resultat.erreur},
    )

    return Envoi(resultat.ok, resultat.identifiant, resultat.erreur, (email,))


def notifier_soumission_rh(
    session: Session,
    config: Config,
    mission: MissionOrder,
    paire: jetons.Paire,
    relance: bool = False,
) -> Envoi:
    """Prévient les RH qu'un ordre de mission attend leur décision."""
    destinataires = list(config.hr_emails)
    nom_piece = nom_fichier(mission.numero, mission.nom)
    lignes = _recapitulatif(mission)

    objet = (
        f'[Ordre de mission {mission.numero}] {mission.prenoms} {mission.nom} — '
        f'{mission.lieu}, du {format_jour_mois(mission.date_depart)} '
        f'au {format_jour_mois(mission.date_retour)}'
    )

    url_valider = f'{config.app_url}/approve/{paire.approuver}'
    url_refuser = f'{config.app_url}/reject/{paire.refuser}'

    html = _rendre(
        'soumission_rh.html',
        objet=objet,
        apercu=f'{mission.prenoms} {mission.nom} — {mission.objet} à {mission.lieu}',
        mission=mission,
        lignes=lignes,
        url_valider=url_valider,
        url_refuser=url_refuser,
        validite_jours=config.duree_jeton_approbation_jours,
        nom_piece_jointe=nom_piece,
        relance=relance,
    )

    texte = '\n'.join(
        [
            f'Ordre de mission {mission.numero} — {mission.prenoms} {mission.nom}',
            *(f'{libelle} : {valeur}' for libelle, valeur in lignes),
            '',
            f'Valider : {url_valider}',
            f'Refuser : {url_refuser}',
            '',
            "Ces liens sont valables 7 jours et ne peuvent servir qu'une seule fois.",
        ]
    )

    contenu_pdf = _pdf(mission, config)
    resultat = envoyer(
        Message(
            destinataires=destinataires,
            objet=objet,
            html=html,
            texte=texte,
            pieces_jointes=[PieceJointe(nom_piece, contenu_pdf)] if contenu_pdf else [],
        ),
        transport=config.email_transport,
        expediteur=config.email_from,
        cle_api=config.resend_api_key,
    )

    _journaliser(
        session,
        mission.id,
        resultat,
        type='MISSION_SUBMITTED_HR',
        destinataires=destinataires,
        relance=relance,
        piece_jointe=contenu_pdf is not None,
    )

    return Envoi(resultat.ok, resultat.identifiant, resultat.erreur, tuple(destinataires))


def notifier_decision(
    session: Session, config: Config, mission: MissionOrder, email_demandeur: str
) -> Envoi:
    """Informe le demandeur de la décision prise sur son ordre de mission."""
    approuve = mission.statut is MissionStatus.APPROVED
    etat = 'validé' if approuve else 'refusé'
    objet = f'Ordre de mission {mission.numero} — {etat}'
    nom_piece = nom_fichier(mission.numero, mission.nom)

    html = _rendre(
        'decision.html',
        objet=objet,
        apercu=objet,
        mission=mission,
        lignes=_recapitulatif(mission),
        approuve=approuve,
        etat=etat,
        decide_le=format_datetime(mission.decide_le) if mission.decide_le else '',
        url_mission=f'{config.app_url}/missions/{mission.id}',
        nom_piece_jointe=nom_piece,
    )

    texte = '\n'.join(
        partie
        for partie in [
            f'Votre ordre de mission {mission.numero} a été {etat}.',
            f'Décision du {format_datetime(mission.decide_le)}.' if mission.decide_le else '',
            f'Motif du refus : {mission.motif_refus}'
            if not approuve and mission.motif_refus
            else '',
            '',
            f'Consulter : {config.app_url}/missions/{mission.id}',
        ]
        if partie
    )

    # Seul un ordre validé mérite une pièce jointe : un refus n'a pas de document.
    contenu_pdf = _pdf(mission, config) if approuve else None

    resultat = envoyer(
        Message(
            destinataires=[email_demandeur],
            objet=objet,
            html=html,
            texte=texte,
            pieces_jointes=[PieceJointe(nom_piece, contenu_pdf)] if contenu_pdf else [],
        ),
        transport=config.email_transport,
        expediteur=config.email_from,
        cle_api=config.resend_api_key,
    )

    _journaliser(
        session,
        mission.id,
        resultat,
        type='MISSION_DECISION',
        destinataires=[email_demandeur],
        decision=mission.statut.value,
    )

    return Envoi(resultat.ok, resultat.identifiant, resultat.erreur, (email_demandeur,))
