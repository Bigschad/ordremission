"""Non-régression du PDF : une seule page, portant le numéro d'ordre."""

from __future__ import annotations

import io
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pypdf import PdfReader

from app.models import MissionStatus, TransportType
from app.pdf.document import DonneesPdf, rendre
from app.pdf.rendu import nom_fichier


def reference(**surcharges: object) -> DonneesPdf:
    """Reproduit la fiche d'origine : YEYE / Visite chantier / Assinie."""
    valeurs: dict[str, object] = {
        'numero': 'OM-2026-0001',
        'nom': 'YEYE',
        'prenoms': 'SCHADRACH GUY-ROLAND',
        'matricule': '4071',
        'fonction': 'Responsable Développement & Intégration IT',
        'analytique': 'IT-2026-001',
        'objet': 'Visite chantier',
        'lieu': 'Assinie',
        'date_depart': datetime(2026, 8, 19, 13, 0, tzinfo=UTC),
        'date_retour': datetime(2026, 8, 19, 17, 0, tzinfo=UTC),
        'transport_type': TransportType.VEHICULE_ETABLISSEMENT,
        'transport_detail': '1234 AB 01',
        'litres_gasoil': Decimal('40'),
        'statut': MissionStatus.APPROVED,
        'motif_refus': None,
        'decide_le': datetime(2026, 8, 18, 9, 30, tzinfo=UTC),
        'decide_par_nom': 'FATOUMATA DIALLO',
        'cree_le': datetime(2026, 8, 17, 8, 0, tzinfo=UTC),
        'url_verification': 'http://localhost:5000/verify/OM-2026-0001',
    }
    valeurs.update(surcharges)
    return DonneesPdf(**valeurs)  # type: ignore[arg-type]


def extraire(contenu: bytes) -> tuple[int, str]:
    lecteur = PdfReader(io.BytesIO(contenu))
    return len(lecteur.pages), lecteur.pages[0].extract_text()


def sans_espaces(texte: str) -> str:
    return ''.join(texte.split())


class TestNomFichier:
    def test_format_attendu(self) -> None:
        assert nom_fichier('OM-2026-0001', 'YEYE') == 'OM-2026-0001_YEYE.pdf'

    def test_nettoie_accents_et_caracteres_problematiques(self) -> None:
        assert nom_fichier('OM-2026-0007', "N'GUESSAN") == 'OM-2026-0007_N-GUESSAN.pdf'
        assert nom_fichier('OM-2026-0008', 'KOUAMÉ ADJÉ') == 'OM-2026-0008_KOUAME-ADJE.pdf'

    def test_remplace_un_numero_provisoire(self) -> None:
        assert nom_fichier('BROUILLON-ABC123', 'YEYE') == 'OM-BROUILLON_YEYE.pdf'

    def test_reste_utilisable_si_le_nom_est_vide(self) -> None:
        assert nom_fichier('OM-2026-0001', '   ') == 'OM-2026-0001_COLLABORATEUR.pdf'


class TestDocument:
    def test_une_seule_page_et_numero_present(self) -> None:
        pages, texte = extraire(rendre(reference()))
        assert pages == 1
        assert 'OM-2026-0001' in texte

    def test_libelles_du_formulaire_papier_dans_lordre(self) -> None:
        _, texte = extraire(rendre(reference()))

        libelles = [
            "ORDRE DE MISSION EN COTE D'IVOIRE",
            'NOM',
            'PRENOMS',
            'MATRICULE',
            'FONCTION',
            'ANALYTIQUE',
            'OBJET DE LA MISSION',
            'LIEU DE LA MISSION',
            'DATE DE DEPART',
            'DATE DE RETOUR',
            'Il utilisera les moyens de transport et la quantité de carburant suivants',
            "Véhicule de l'établissement",
            'Véhicule personnel',
            'Véhicule de location',
            'Transport en commun',
            'litres de gasoil',
            'Supérieur Hiérarchique',
            'Ressources Humaines',
            'Directeur',
            'Partie réservée à la sécurité',
            'Heure de départ',
            "Heure d'arrivée",
        ]

        position = -1
        for libelle in libelles:
            trouve = texte.find(libelle)
            assert trouve > -1, f'libellé absent : {libelle}'
            assert trouve > position, f'libellé mal placé : {libelle}'
            position = trouve

    def test_donnees_de_la_fiche_dorigine(self) -> None:
        _, texte = extraire(rendre(reference()))

        for valeur in (
            'YEYE',
            'SCHADRACH GUY-ROLAND',
            '4071',
            'Visite chantier',
            'Assinie',
            'le 19/08/2026 à 13h00',
            'le 19/08/2026 à 17h00',
            '1234 AB 01',
        ):
            assert valeur in texte, f'valeur absente : {valeur}'

    def test_mentions_legales_et_coordonnees(self) -> None:
        _, texte = extraire(rendre(reference()))

        assert 'contact@porteo-group.com' in texte
        assert '+225 27 21 54 03 03' in texte
        assert 'ABIDJAN-MARCORY IMMEUBLE PORTEO' in texte
        assert 'CI-ABJ-2017-B16427' in texte
        assert 'WWW.PORTEO-GROUP.COM' in sans_espaces(texte)

    def test_mention_de_validation_electronique(self) -> None:
        _, texte = extraire(rendre(reference()))

        assert 'Validé électroniquement par' in texte
        assert 'FATOUMATA DIALLO' in texte
        assert '18/08/2026' in texte

    def test_filigrane_refuse_et_motif(self) -> None:
        contenu = rendre(
            reference(
                statut=MissionStatus.REJECTED,
                motif_refus='Budget déplacement déjà consommé pour le mois en cours.',
            )
        )
        pages, texte = extraire(contenu)

        assert pages == 1
        assert 'REFUSÉ' in texte
        assert 'Budget' in texte

    def test_filigrane_dattente(self) -> None:
        pages, texte = extraire(
            rendre(reference(statut=MissionStatus.SUBMITTED, decide_le=None, decide_par_nom=None))
        )
        assert pages == 1
        assert 'ENATTENTEDEVALIDATION' in sans_espaces(texte)

    def test_brouillon_sans_numero(self) -> None:
        pages, texte = extraire(
            rendre(reference(numero='BROUILLON-XYZ123', statut=MissionStatus.DRAFT))
        )
        assert pages == 1
        assert 'Brouillon (non numéroté)' in texte
        assert 'BROUILLON-XYZ123' not in texte

    @pytest.mark.parametrize('statut', list(MissionStatus))
    def test_une_page_quel_que_soit_le_statut(self, statut: MissionStatus) -> None:
        pages, _ = extraire(rendre(reference(statut=statut)))
        assert pages == 1

    def test_reste_sur_une_page_avec_des_valeurs_longues(self) -> None:
        pages, _ = extraire(
            rendre(
                reference(
                    objet='Réception provisoire des travaux de terrassement, de drainage et de '
                    "revêtement de la voie d'accès à la base vie du chantier, en présence du "
                    "maître d'ouvrage délégué",
                    lieu='San-Pédro — zone industrialo-portuaire, secteur 4',
                    fonction='Responsable Développement & Intégration des Systèmes '
                    "d'Information et Réseaux",
                    statut=MissionStatus.REJECTED,
                    motif_refus='Motif volontairement très détaillé. ' * 12,
                )
            )
        )
        assert pages == 1
