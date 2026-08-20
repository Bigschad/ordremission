"""Reproduction du formulaire papier « ORDRE DE MISSION EN COTE D'IVOIRE ».

Les libellés, leur ordre et la mise en page suivent la fiche pré-imprimée : le
PDF doit pouvoir être superposé à l'original. Seule la ligne « N° » est un
ajout, rendu nécessaire par la dématérialisation.

ReportLab est écrit en Python pur : aucune dépendance système, contrairement à
WeasyPrint (cairo/pango) ou à un navigateur sans interface — ce qui compte pour
tenir dans la limite de taille des fonctions serverless.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import segno
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from app.domaine.dates import format_date, format_datetime, format_heure
from app.domaine.numerotation import affichage as numero_affichage
from app.domaine.validations import LIBELLES_TRANSPORT, formater_litres
from app.models import MissionStatus, TransportType

MARINE = HexColor('#1B2A4A')
ORANGE = HexColor('#E8A33D')
NOIR = HexColor('#111111')
GRIS = HexColor('#666666')
GRIS_CLAIR = HexColor('#AAAAAA')
ROUGE = HexColor('#C0202A')
VERT = HexColor('#1E7A46')

LARGEUR, HAUTEUR = A4

MARGE = 38
HAUT = HAUTEUR - 26

CHEMIN_LOGO = Path(__file__).resolve().parents[2] / 'app' / 'static' / 'porteo-logo.png'

# Les polices intégrées de ReportLab couvrent Latin-1 : tous les accents
# français passent. Seuls les symboles hors Latin-1 sont à éviter — la croix
# des cases est donc tracée, pas écrite.
NORMALE = 'Helvetica'
GRASSE = 'Helvetica-Bold'
ITALIQUE = 'Helvetica-Oblique'


@dataclass(frozen=True)
class DonneesPdf:
    """Tout ce dont le rendu a besoin, sans dépendre de SQLAlchemy."""

    numero: str
    nom: str
    prenoms: str
    matricule: str
    fonction: str
    analytique: str | None
    objet: str
    lieu: str
    date_depart: datetime
    date_retour: datetime
    transport_type: TransportType
    transport_detail: str | None
    litres_gasoil: Decimal | None
    statut: MissionStatus
    motif_refus: str | None
    decide_le: datetime | None
    decide_par_nom: str | None
    cree_le: datetime
    url_verification: str


def _tronquer(texte: str, police: str, taille: float, largeur_max: float) -> str:
    """Coupe proprement une valeur trop longue pour son emplacement."""
    if stringWidth(texte, police, taille) <= largeur_max:
        return texte

    points = '...'
    while texte and stringWidth(texte + points, police, taille) > largeur_max:
        texte = texte[:-1]
    return texte + points


def _texte_espace(
    c: Canvas,
    x: float,
    y: float,
    texte: str,
    police: str,
    taille: float,
    espacement: float,
) -> float:
    """Écrit un texte interlettré.

    `Canvas` n'expose pas l'interlettrage : il faut passer par un objet texte.
    L'opérateur PDF correspondant persiste dans l'état graphique — sans
    `saveState`/`restoreState`, tout le reste de la page serait interlettré.
    Renvoie la largeur occupée.
    """
    c.saveState()
    objet = c.beginText(x, y)
    objet.setFont(police, taille)
    objet.setCharSpace(espacement)
    objet.textOut(texte)
    c.drawText(objet)
    c.restoreState()
    return float(stringWidth(texte, police, taille)) + espacement * len(texte)


def _ligne_pointillee(c: Canvas, x1: float, x2: float, y: float) -> None:
    c.saveState()
    c.setStrokeColor(GRIS)
    c.setLineWidth(0.5)
    c.setDash(1, 2)
    c.line(x1, y, x2, y)
    c.restoreState()


def _champ(c: Canvas, y: float, libelle: str, valeur: str) -> float:
    """Une ligne « LIBELLE : valeur » sur pointillés, comme sur le papier."""
    x_libelle = MARGE
    x_deux_points = MARGE + 132
    x_valeur = x_deux_points + 10
    x_fin = LARGEUR - MARGE

    c.setFont(GRASSE, 9.5)
    c.setFillColor(NOIR)
    c.drawString(x_libelle, y, libelle)
    c.drawString(x_deux_points, y, ':')

    c.setFont(NORMALE, 9.5)
    c.drawString(x_valeur, y, _tronquer(valeur, NORMALE, 9.5, x_fin - x_valeur - 4))

    _ligne_pointillee(c, x_valeur, x_fin, y - 3)
    return y - 21


def _case(c: Canvas, x: float, y: float, cochee: bool) -> None:
    """Case à cocher ; la croix est tracée pour ne dépendre d'aucune police."""
    cote = 9
    c.setStrokeColor(NOIR)
    c.setLineWidth(0.8)
    c.rect(x, y - 1, cote, cote)

    if cochee:
        c.setLineWidth(1.3)
        marge = 1.8
        c.line(x + marge, y - 1 + marge, x + cote - marge, y - 1 + cote - marge)
        c.line(x + cote - marge, y - 1 + marge, x + marge, y - 1 + cote - marge)


def _filigrane(c: Canvas, statut: MissionStatus) -> None:
    """Filigrane diagonal, tracé avant le contenu pour rester en arrière-plan."""
    textes = {
        MissionStatus.REJECTED: ('REFUSÉ', ROUGE, 74, 0.16),
        MissionStatus.SUBMITTED: ('EN ATTENTE DE VALIDATION', GRIS, 30, 0.20),
        MissionStatus.CANCELLED: ('ANNULÉ', GRIS, 74, 0.20),
    }
    if statut not in textes:
        return

    texte, couleur, taille, opacite = textes[statut]

    c.saveState()
    c.translate(LARGEUR / 2, HAUTEUR / 2)
    c.rotate(28)
    c.setFont(GRASSE, taille)
    c.setFillColor(Color(couleur.red, couleur.green, couleur.blue, alpha=opacite))
    c.drawCentredString(0, 0, texte)
    c.restoreState()


def _entete(c: Canvas, y: float) -> float:
    """Logo officiel, ou bloc typographique de remplacement."""
    if CHEMIN_LOGO.exists():
        c.drawImage(
            ImageReader(str(CHEMIN_LOGO)),
            MARGE,
            y - 44,
            width=122,
            height=44,
            preserveAspectRatio=True,
            anchor='sw',
            mask='auto',
        )
        return y - 56

    c.setFillColor(MARINE)
    _texte_espace(c, MARGE, y - 16, 'PORTEO', GRASSE, 17, 2.4)
    c.setFillColor(ORANGE)
    _texte_espace(c, MARGE, y - 27, 'GROUP', GRASSE, 8, 4.6)
    return y - 44


def _titre(c: Canvas, y: float) -> float:
    texte = "ORDRE DE MISSION EN COTE D'IVOIRE"
    c.setFont(GRASSE, 13)
    c.setFillColor(NOIR)
    c.drawCentredString(LARGEUR / 2, y, texte)

    largeur = stringWidth(texte, GRASSE, 13)
    c.setLineWidth(0.9)
    c.setStrokeColor(NOIR)
    c.line((LARGEUR - largeur) / 2, y - 2.5, (LARGEUR + largeur) / 2, y - 2.5)

    return y - 24


def _tableau(
    c: Canvas, y: float, hauteur: float, colonnes: list[str], hauteur_entete: float = 16
) -> tuple[float, list[tuple[float, float]]]:
    """Trace un tableau à colonnes égales ; renvoie les bornes de chaque colonne."""
    x_debut, x_fin = MARGE, LARGEUR - MARGE
    largeur_colonne = (x_fin - x_debut) / len(colonnes)

    c.setStrokeColor(NOIR)
    c.setLineWidth(0.8)
    c.rect(x_debut, y - hauteur, x_fin - x_debut, hauteur)
    c.line(x_debut, y - hauteur_entete, x_fin, y - hauteur_entete)

    bornes: list[tuple[float, float]] = []
    for index, titre in enumerate(colonnes):
        gauche = x_debut + index * largeur_colonne
        droite = gauche + largeur_colonne
        bornes.append((gauche, droite))

        if index > 0:
            c.line(gauche, y - hauteur, gauche, y)

        c.setFont(GRASSE, 8.5)
        c.setFillColor(NOIR)
        c.drawCentredString((gauche + droite) / 2, y - hauteur_entete + 5, titre)

    return y - hauteur, bornes


def _colonne_rh(
    c: Canvas, donnees: DonneesPdf, gauche: float, droite: float, bas: float, haut: float
) -> None:
    """Contenu de la colonne « Ressources Humaines »."""
    if donnees.decide_le is None:
        return

    centre = (gauche + droite) / 2
    y = (bas + haut) / 2 + 14

    if donnees.statut is MissionStatus.APPROVED:
        c.setFillColor(VERT)
        c.setFont(GRASSE, 7.5)
        for ligne in (
            'Validé électroniquement par',
            donnees.decide_par_nom or 'Ressources Humaines',
            f'le {format_datetime(donnees.decide_le)}',
        ):
            c.drawCentredString(centre, y, _tronquer(ligne, GRASSE, 7.5, droite - gauche - 8))
            y -= 10

        c.setFillColor(GRIS)
        c.setFont(NORMALE, 6.5)
        c.drawCentredString(centre, y - 2, donnees.numero)
        return

    if donnees.statut is MissionStatus.REJECTED:
        c.setFillColor(ROUGE)
        c.setFont(GRASSE, 8)
        c.drawCentredString(centre, y, 'REFUSÉ')
        c.drawCentredString(centre, y - 10, f'le {format_datetime(donnees.decide_le)}')

        if donnees.motif_refus:
            c.setFont(NORMALE, 6.5)
            y -= 22
            for ligne in _decouper(donnees.motif_refus, NORMALE, 6.5, droite - gauche - 10)[:3]:
                c.drawCentredString(centre, y, ligne)
                y -= 8


def _decouper(texte: str, police: str, taille: float, largeur: float) -> list[str]:
    """Découpe un texte en lignes tenant dans la largeur donnée."""
    lignes: list[str] = []
    courante = ''

    for mot in texte.split():
        essai = f'{courante} {mot}'.strip()
        if stringWidth(essai, police, taille) <= largeur:
            courante = essai
        else:
            if courante:
                lignes.append(courante)
            courante = mot

    if courante:
        lignes.append(courante)
    return lignes


def _pied_de_page(c: Canvas, donnees: DonneesPdf) -> None:
    """Coordonnées, mention légale, QR code et bandeau bleu marine."""
    bandeau_hauteur = 16
    y_bandeau = 0

    c.setFillColor(MARINE)
    c.rect(0, y_bandeau, LARGEUR, bandeau_hauteur, stroke=0, fill=1)
    adresse = 'WWW.PORTEO-GROUP.COM'
    largeur_adresse = stringWidth(adresse, GRASSE, 7.5) + 1.6 * len(adresse)
    c.setFillColor(HexColor('#FFFFFF'))
    _texte_espace(c, (LARGEUR - largeur_adresse) / 2, y_bandeau + 5, adresse, GRASSE, 7.5, 1.6)

    # QR code de vérification d'authenticité, en bas à droite.
    qr = segno.make(donnees.url_verification, error='m')
    tampon = io.BytesIO()
    qr.save(tampon, kind='png', scale=6, border=0, dark='#1B2A4A', light='#FFFFFF')
    tampon.seek(0)

    cote = 50
    x_qr = LARGEUR - MARGE - cote
    y_qr = bandeau_hauteur + 12
    c.drawImage(ImageReader(tampon), x_qr, y_qr, width=cote, height=cote)

    c.setFillColor(GRIS_CLAIR)
    c.setFont(NORMALE, 4.6)
    c.drawCentredString(x_qr + cote / 2, y_qr - 6, 'Vérifier')

    c.setFillColor(GRIS)
    c.setFont(NORMALE, 6.8)
    y = bandeau_hauteur + 48
    c.drawString(MARGE, y, 'contact@porteo-group.com  -  +225 27 21 54 03 03')
    c.drawString(
        MARGE,
        y - 9,
        "ABIDJAN-MARCORY IMMEUBLE PORTEO, Boulevard Valery Giscard D'Estaing; 08 BP 2212 Abidjan 09",
    )

    c.setFillColor(GRIS_CLAIR)
    c.setFont(NORMALE, 6.2)
    c.drawString(
        MARGE, y - 19, 'Capital 2 000 000 000 F CFA - N° RC: CI-ABJ-2017-B16427 / N° CC: 172923 G'
    )


def rendre(donnees: DonneesPdf) -> bytes:
    """Produit le PDF, sur une page A4 portrait unique."""
    tampon = io.BytesIO()
    c = Canvas(tampon, pagesize=A4)

    numero = numero_affichage(donnees.numero)
    c.setTitle(f'Ordre de mission {numero}')
    c.setAuthor('PORTEO GROUP')
    c.setSubject(f'{donnees.objet} — {donnees.lieu}')
    c.setCreator('Ordres de mission — PORTEO GROUP')

    _filigrane(c, donnees.statut)

    y = _entete(c, HAUT)
    y = _titre(c, y)

    # Bandeau numéro / date.
    c.setFont(GRASSE, 9.5)
    c.setFillColor(NOIR)
    c.drawString(MARGE, y, 'N° : ')
    c.setFont(NORMALE, 9.5)
    c.drawString(MARGE + stringWidth('N° : ', GRASSE, 9.5), y, numero)

    date_creation = f'Date : {format_date(donnees.cree_le)}'
    c.setFont(GRASSE, 9.5)
    c.drawRightString(LARGEUR - MARGE, y, date_creation)
    y -= 22

    # Champs, dans l'ordre exact du formulaire papier.
    y = _champ(c, y, 'NOM', donnees.nom)
    y = _champ(c, y, 'PRENOMS', donnees.prenoms)
    y = _champ(c, y, 'MATRICULE', donnees.matricule)
    y = _champ(c, y, 'FONCTION', donnees.fonction)
    y = _champ(c, y, 'ANALYTIQUE', donnees.analytique or '')
    y = _champ(c, y, 'OBJET DE LA MISSION', donnees.objet)
    y = _champ(c, y, 'LIEU DE LA MISSION', donnees.lieu)
    y = _champ(
        c,
        y,
        'DATE DE DEPART',
        f'le {format_date(donnees.date_depart)} à {format_heure(donnees.date_depart)}',
    )
    y = _champ(
        c,
        y,
        'DATE DE RETOUR',
        f'le {format_date(donnees.date_retour)} à {format_heure(donnees.date_retour)}',
    )

    # Trait de séparation.
    y -= 2
    c.setStrokeColor(NOIR)
    c.setLineWidth(1)
    c.line(MARGE, y, LARGEUR - MARGE, y)
    y -= 16

    c.setFont(ITALIQUE, 9.5)
    c.setFillColor(NOIR)
    c.drawString(
        MARGE, y, 'Il utilisera les moyens de transport et la quantité de carburant suivants :'
    )
    y -= 18

    # Quatre cases à cocher, avec le détail en regard.
    x_libelle = MARGE + 16
    x_detail = MARGE + 170
    for transport in TransportType:
        retenu = donnees.transport_type is transport
        _case(c, MARGE, y, retenu)

        c.setFont(NORMALE, 9.5)
        c.setFillColor(NOIR)
        c.drawString(x_libelle, y, LIBELLES_TRANSPORT[transport])

        detail = donnees.transport_detail if retenu else None
        if detail:
            c.setFont(NORMALE, 9)
            c.drawString(x_detail, y, _tronquer(detail, NORMALE, 9, LARGEUR - MARGE - x_detail - 4))
        _ligne_pointillee(c, x_detail, LARGEUR - MARGE, y - 3)
        y -= 17

    # Ligne « ……… litres de gasoil ».
    y -= 4
    litres = formater_litres(donnees.litres_gasoil) or ''
    c.setFont(GRASSE, 9.5)
    c.drawCentredString(MARGE + 37, y, litres)
    _ligne_pointillee(c, MARGE, MARGE + 74, y - 3)
    c.setFont(NORMALE, 9.5)
    c.drawString(MARGE + 81, y, 'litres de gasoil')
    y -= 20

    # Tableau des signatures.
    bas, bornes = _tableau(c, y, 92, ['Supérieur Hiérarchique', 'Ressources Humaines', 'Directeur'])
    _colonne_rh(c, donnees, bornes[1][0], bornes[1][1], bas, y - 16)
    y = bas - 26

    # Partie réservée à la sécurité, laissée vierge.
    c.setFont(GRASSE, 9.5)
    c.setFillColor(NOIR)
    c.drawString(MARGE, y, 'Partie réservée à la sécurité')
    y -= 12
    c.setFont(ITALIQUE, 8)
    c.setFillColor(GRIS)
    c.drawString(MARGE, y, "Suivi de l'identité & de la signature de l'agent")
    y -= 10

    _tableau(c, y, 56, ['Heure de départ', "Heure d'arrivée"])

    _pied_de_page(c, donnees)

    c.showPage()
    c.save()
    return tampon.getvalue()
