"""Régénère les exemples de PDF et leurs aperçus PNG pour la documentation.

    python -m scripts.exemples_pdf

Les fichiers produits (`docs/pdf-exemples/`, `docs/apercu-pdf*.png`) servent la
revue visuelle : ils ne sont utilisés ni par l'application, ni par les tests.
La conversion en image demande `pypdfium2`, présent dans requirements-dev.txt.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from app.domaine.dates import depuis_saisie
from app.models import MissionStatus, TransportType, maintenant
from app.pdf.document import DonneesPdf, rendre

SORTIE = Path('docs')
EXEMPLES = SORTIE / 'pdf-exemples'
APP_URL = 'https://ordres-mission-porteo.vercel.app'


def _donnees(
    *,
    numero: str,
    statut: MissionStatus,
    nom: str = 'YEYE',
    prenoms: str = 'SCHADRACH GUY-ROLAND',
    matricule: str = 'P0117',
    fonction: str = 'Responsable Développement & Intégration IT',
    objet: str = 'Réception des travaux de câblage du site de production',
    lieu: str = 'Assinie',
    transport_type: TransportType = TransportType.VEHICULE_ETABLISSEMENT,
    transport_detail: str | None = '4587 EG 01',
    litres_gasoil: Decimal | None = Decimal('40'),
    motif_refus: str | None = None,
    decide_par_nom: str | None = None,
) -> DonneesPdf:
    depart = depuis_saisie('2026-03-12T07:30')
    assert depart is not None
    decide = statut in {MissionStatus.APPROVED, MissionStatus.REJECTED}

    return DonneesPdf(
        numero=numero,
        nom=nom,
        prenoms=prenoms,
        matricule=matricule,
        fonction=fonction,
        analytique='IT-2026-014',
        objet=objet,
        lieu=lieu,
        date_depart=depart,
        date_retour=depart + timedelta(hours=11),
        transport_type=transport_type,
        transport_detail=transport_detail,
        litres_gasoil=litres_gasoil,
        statut=statut,
        motif_refus=motif_refus,
        decide_le=depart - timedelta(days=3) if decide else None,
        decide_par_nom=decide_par_nom if decide else None,
        cree_le=depart - timedelta(days=5),
        url_verification=f'{APP_URL}/verify/{numero}',
    )


CAS = (
    (
        'SUBMITTED_OM-2026-0004_YEYE.pdf',
        _donnees(numero='OM-2026-0004', statut=MissionStatus.SUBMITTED),
    ),
    (
        'APPROVED_OM-2026-0001_YEYE.pdf',
        _donnees(
            numero='OM-2026-0001',
            statut=MissionStatus.APPROVED,
            decide_par_nom='FATOUMATA DIALLO',
        ),
    ),
    (
        'REJECTED_OM-2026-0007_KONE.pdf',
        _donnees(
            numero='OM-2026-0007',
            statut=MissionStatus.REJECTED,
            nom='KONE',
            prenoms='AMINATA',
            matricule='P0231',
            fonction='Chargée des achats',
            objet='Consultation de fournisseurs pour le lot climatisation',
            lieu='Bouaké',
            transport_type=TransportType.VEHICULE_LOCATION,
            transport_detail='Ivoire Location',
            litres_gasoil=None,
            motif_refus='Budget déplacement du service déjà consommé pour le mois en cours.',
            decide_par_nom='FATOUMATA DIALLO',
        ),
    ),
    (
        'CANCELLED_OM-2026-0009_KONE.pdf',
        _donnees(
            numero='OM-2026-0009',
            statut=MissionStatus.CANCELLED,
            nom='KONE',
            prenoms='AMINATA',
            matricule='P0231',
            fonction='Chargée des achats',
            objet='Réunion fournisseur reportée',
            lieu='Yamoussoukro',
            transport_type=TransportType.TRANSPORT_EN_COMMUN,
            transport_detail='Compagnie UTB',
            litres_gasoil=None,
        ),
    ),
    (
        'DRAFT_OM-BROUILLON_YEYE.pdf',
        _donnees(numero='BROUILLON-2026-XYZ1', statut=MissionStatus.DRAFT),
    ),
)

#: Aperçus PNG affichés dans le README.
APERCUS = {
    'SUBMITTED_OM-2026-0004_YEYE.pdf': 'apercu-pdf.png',
    'REJECTED_OM-2026-0007_KONE.pdf': 'apercu-pdf-refuse.png',
}


def _en_png(source: Path, destination: Path) -> None:
    import pypdfium2

    document = pypdfium2.PdfDocument(source)
    try:
        # 150 ppp : lisible à l'écran sans alourdir le dépôt.
        image = document[0].render(scale=150 / 72).to_pil()
        image.save(destination, optimize=True)
    finally:
        document.close()


def executer() -> None:
    EXEMPLES.mkdir(parents=True, exist_ok=True)

    for nom, donnees in CAS:
        chemin = EXEMPLES / nom
        chemin.write_bytes(rendre(donnees))
        print(f'→ {chemin}')

        apercu = APERCUS.get(nom)
        if apercu:
            _en_png(chemin, SORTIE / apercu)
            print(f'   {SORTIE / apercu}')

    print(f'\nGénéré le {maintenant():%d/%m/%Y}.')


if __name__ == '__main__':
    executer()
