"""Règles métier de saisie — chaque règle du cahier des charges a son test."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domaine.validations import (
    ANTICIPATION_MAX_MOIS,
    MOTIF_REFUS_MIN,
    RETROACTIVITE_MAX_JOURS,
    Saisie,
    accepte_gasoil,
    exige_detail,
    formater_litres,
    transport_ou_defaut,
    valider,
    valider_motif_refus,
)
from app.models import TransportType

# Horloge figée : les bornes de dates doivent être déterministes.
MAINTENANT = datetime(2026, 8, 20, 12, 0, tzinfo=UTC)


def saisie(**surcharges: str) -> Saisie:
    """Saisie de référence — la fiche papier d'origine."""
    valeurs = {
        'objet': 'Visite chantier',
        'lieu': 'Assinie',
        'analytique': 'IT-2026-001',
        'date_depart': '2026-08-25T13:00',
        'date_retour': '2026-08-25T17:00',
        'transport_type': 'VEHICULE_ETABLISSEMENT',
        'transport_detail': '1234 AB 01',
        'litres_gasoil': '40',
    }
    valeurs.update(surcharges)
    return Saisie(**valeurs)


class TestSaisieDeReference:
    def test_accepte_la_fiche_dorigine(self) -> None:
        assert valider(saisie(), MAINTENANT).ok

    def test_convertit_les_dates_en_utc(self) -> None:
        resultat = valider(saisie(), MAINTENANT)
        assert resultat.valeurs is not None
        # Africa/Abidjan est en UTC+0 : 13h00 local = 13h00 UTC.
        assert resultat.valeurs.date_depart.isoformat() == '2026-08-25T13:00:00+00:00'
        assert resultat.valeurs.date_retour.isoformat() == '2026-08-25T17:00:00+00:00'

    def test_normalise_les_champs_facultatifs_vides(self) -> None:
        resultat = valider(
            saisie(analytique='   ', transport_detail='', litres_gasoil=''), MAINTENANT
        )
        assert resultat.valeurs is not None
        assert resultat.valeurs.analytique is None
        assert resultat.valeurs.transport_detail is None
        assert resultat.valeurs.litres_gasoil is None


class TestRegle1Chronologie:
    def test_refuse_un_retour_anterieur(self) -> None:
        resultat = valider(
            saisie(date_depart='2026-08-25T17:00', date_retour='2026-08-25T13:00'), MAINTENANT
        )
        assert resultat.erreurs['date_retour'] == (
            'La date de retour doit être postérieure à la date de départ'
        )

    def test_refuse_un_retour_egal_au_depart(self) -> None:
        resultat = valider(
            saisie(date_depart='2026-08-25T13:00', date_retour='2026-08-25T13:00'), MAINTENANT
        )
        assert 'date_retour' in resultat.erreurs

    def test_accepte_un_ecart_dune_minute(self) -> None:
        assert valider(
            saisie(date_depart='2026-08-25T13:00', date_retour='2026-08-25T13:01'), MAINTENANT
        ).ok


class TestRegle2Bornes:
    def test_accepte_la_borne_de_retroactivite(self) -> None:
        assert valider(
            saisie(date_depart='2026-07-25T13:00', date_retour='2026-07-25T17:00'), MAINTENANT
        ).ok

    def test_refuse_au_dela_de_la_retroactivite(self) -> None:
        resultat = valider(
            saisie(date_depart='2026-06-01T13:00', date_retour='2026-06-01T17:00'), MAINTENANT
        )
        assert f'{RETROACTIVITE_MAX_JOURS} jours' in resultat.erreurs['date_depart']

    def test_accepte_a_moins_de_douze_mois(self) -> None:
        assert valider(
            saisie(date_depart='2027-06-01T08:00', date_retour='2027-06-01T18:00'), MAINTENANT
        ).ok

    def test_refuse_au_dela_de_douze_mois(self) -> None:
        resultat = valider(
            saisie(date_depart='2028-01-01T08:00', date_retour='2028-01-01T18:00'), MAINTENANT
        )
        assert f'{ANTICIPATION_MAX_MOIS} mois' in resultat.erreurs['date_depart']


class TestRegle3Gasoil:
    @pytest.mark.parametrize(
        'transport',
        [
            TransportType.VEHICULE_ETABLISSEMENT,
            TransportType.VEHICULE_PERSONNEL,
            TransportType.VEHICULE_LOCATION,
        ],
    )
    def test_accepte_le_gasoil_en_vehicule(self, transport: TransportType) -> None:
        resultat = valider(
            saisie(
                transport_type=transport.value,
                transport_detail='Détail obligatoire',
                litres_gasoil='85.5',
            ),
            MAINTENANT,
        )
        assert resultat.ok
        assert accepte_gasoil(transport)

    def test_refuse_le_gasoil_en_transport_en_commun(self) -> None:
        resultat = valider(
            saisie(
                transport_type='TRANSPORT_EN_COMMUN',
                transport_detail='Compagnie UTB',
                litres_gasoil='20',
            ),
            MAINTENANT,
        )
        assert 'transport en commun' in resultat.erreurs['litres_gasoil']
        assert not accepte_gasoil(TransportType.TRANSPORT_EN_COMMUN)

    def test_accepte_le_transport_en_commun_sans_gasoil(self) -> None:
        assert valider(
            saisie(transport_type='TRANSPORT_EN_COMMUN', litres_gasoil=''), MAINTENANT
        ).ok

    @pytest.mark.parametrize('valeur', ['-5', 'abc', '10000', '40.123'])
    def test_refuse_les_quantites_invalides(self, valeur: str) -> None:
        assert not valider(saisie(litres_gasoil=valeur), MAINTENANT).ok

    def test_accepte_la_virgule_decimale(self) -> None:
        resultat = valider(saisie(litres_gasoil='85,5'), MAINTENANT)
        assert resultat.valeurs is not None
        assert str(resultat.valeurs.litres_gasoil) == '85.5'


class TestRegle4DetailTransport:
    def test_exige_le_nom_du_loueur(self) -> None:
        resultat = valider(
            saisie(transport_type='VEHICULE_LOCATION', transport_detail=''), MAINTENANT
        )
        assert resultat.erreurs['transport_detail'] == 'Le nom du loueur est obligatoire'
        assert exige_detail(TransportType.VEHICULE_LOCATION)

    def test_exige_limmatriculation(self) -> None:
        resultat = valider(
            saisie(transport_type='VEHICULE_PERSONNEL', transport_detail='  '), MAINTENANT
        )
        assert resultat.erreurs['transport_detail'] == (
            "L'immatriculation du véhicule est obligatoire"
        )

    def test_naxige_rien_pour_le_vehicule_detablissement(self) -> None:
        assert valider(
            saisie(transport_type='VEHICULE_ETABLISSEMENT', transport_detail=''), MAINTENANT
        ).ok
        assert not exige_detail(TransportType.VEHICULE_ETABLISSEMENT)

    def test_naxige_rien_pour_le_transport_en_commun(self) -> None:
        assert valider(
            saisie(transport_type='TRANSPORT_EN_COMMUN', transport_detail='', litres_gasoil=''),
            MAINTENANT,
        ).ok


class TestChampsObligatoires:
    def test_refuse_objet_et_lieu_vides(self) -> None:
        resultat = valider(saisie(objet='   ', lieu=''), MAINTENANT)
        assert resultat.erreurs['objet'] == "L'objet de la mission est obligatoire"
        assert resultat.erreurs['lieu'] == 'Le lieu de la mission est obligatoire'

    def test_refuse_un_transport_inconnu(self) -> None:
        assert not valider(saisie(transport_type='HELICOPTERE'), MAINTENANT).ok

    def test_refuse_une_date_mal_formee(self) -> None:
        resultat = valider(saisie(date_depart='25/08/2026 13:00'), MAINTENANT)
        assert resultat.erreurs['date_depart'] == 'Date ou heure invalide'

    def test_transport_par_defaut(self) -> None:
        assert transport_ou_defaut('') is TransportType.VEHICULE_ETABLISSEMENT
        assert transport_ou_defaut('VEHICULE_LOCATION') is TransportType.VEHICULE_LOCATION


class TestRegle8MotifRefus:
    def test_refuse_un_motif_trop_court(self) -> None:
        _, erreur = valider_motif_refus('Non')
        assert erreur is not None
        assert f'au moins {MOTIF_REFUS_MIN} caractères' in erreur

    @pytest.mark.parametrize('valeur', ['', '           '])
    def test_refuse_un_motif_vide(self, valeur: str) -> None:
        motif, erreur = valider_motif_refus(valeur)
        assert motif is None
        assert erreur == 'Le motif du refus est obligatoire'

    def test_accepte_un_motif_detaille(self) -> None:
        motif, erreur = valider_motif_refus('Budget déplacement déjà consommé pour le mois.')
        assert erreur is None
        assert motif is not None

    def test_refuse_un_motif_trop_long(self) -> None:
        _, erreur = valider_motif_refus('a' * 1001)
        assert erreur is not None


class TestMiseEnFormeLitres:
    def test_supprime_les_decimales_inutiles(self) -> None:
        assert formater_litres(40) == '40'
        assert formater_litres(85.5) == '85,5'
        assert formater_litres(None) is None
