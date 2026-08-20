"""Jeu de données de démonstration.

    python -m scripts.seed

Idempotent : les ordres de mission et le journal sont vidés, puis réinsérés ;
les collaborateurs sont créés ou mis à jour.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from dotenv import load_dotenv
from sqlalchemy import delete, select

from app import db
from app.config import _normaliser_database_url
from app.domaine.dates import depuis_saisie
from app.models import (
    ApprovalToken,
    AuditLog,
    Counter,
    LoginToken,
    MissionOrder,
    MissionStatus,
    RateLimit,
    Role,
    TransportType,
    User,
    maintenant,
)


@dataclass(frozen=True)
class FicheSeed:
    nom: str
    prenoms: str
    matricule: str
    fonction: str
    email: str
    role: Role = Role.EMPLOYEE
    actif: bool = True


UTILISATEURS: tuple[FicheSeed, ...] = (
    FicheSeed(
        'KOUASSI', 'ADAMA', '1001', 'Administrateur Système', 'admin@porteo-group.com', Role.ADMIN
    ),
    FicheSeed(
        'DIALLO',
        'FATOUMATA',
        '2001',
        'Responsable Ressources Humaines',
        'rh@porteo-group.com',
        Role.HR,
    ),
    FicheSeed(
        'TRAORE',
        'IBRAHIM',
        '2002',
        'Gestionnaire Ressources Humaines',
        'rh2@porteo-group.com',
        Role.HR,
    ),
    # Collaborateur de référence — reprend la fiche papier d'origine.
    FicheSeed(
        'YEYE',
        'SCHADRACH GUY-ROLAND',
        '4071',
        'Responsable Développement & Intégration IT',
        'schadrach.yeye@porteo-group.com',
    ),
    FicheSeed('BAMBA', 'AWA', '4072', 'Conductrice de Travaux', 'awa.bamba@porteo-group.com'),
    FicheSeed('KONE', 'MAMADOU', '4073', 'Ingénieur Génie Civil', 'mamadou.kone@porteo-group.com'),
    FicheSeed(
        "N'GUESSAN", 'ARIANE', '4074', 'Chargée des Achats', 'ariane.nguessan@porteo-group.com'
    ),
    FicheSeed(
        'OUATTARA', 'SEYDOU', '4075', 'Chef de Parc Automobile', 'seydou.ouattara@porteo-group.com'
    ),
    FicheSeed(
        'ZADI',
        'CHRISTELLE',
        '4076',
        'Contrôleuse de Gestion',
        'christelle.zadi@porteo-group.com',
        actif=False,
    ),
)


@dataclass(frozen=True)
class MissionSeed:
    email: str
    objet: str
    lieu: str
    jours_depart: int
    heure_depart: str
    jours_retour: int
    heure_retour: str
    transport: TransportType
    statut: MissionStatus
    analytique: str | None = None
    detail: str | None = None
    litres: str | None = None
    motif: str | None = None
    date_fixe: tuple[str, str] | None = None


MISSIONS: tuple[MissionSeed, ...] = (
    # La fiche d'origine, reproduite fidèlement.
    MissionSeed(
        'schadrach.yeye@porteo-group.com',
        'Visite chantier',
        'Assinie',
        0,
        '',
        0,
        '',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.APPROVED,
        analytique='IT-2026-001',
        detail='1234 AB 01',
        litres='40',
        date_fixe=('2026-08-19T13:00', '2026-08-19T17:00'),
    ),
    MissionSeed(
        'awa.bamba@porteo-group.com',
        'Réception de travaux de voirie',
        'Yamoussoukro',
        -12,
        '06:30',
        -11,
        '19:00',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.APPROVED,
        analytique='BTP-2026-114',
        detail='5566 CD 01',
        litres='85.50',
    ),
    MissionSeed(
        'mamadou.kone@porteo-group.com',
        'Étude géotechnique préalable',
        'Bouaké',
        -8,
        '07:00',
        -6,
        '18:30',
        TransportType.VEHICULE_LOCATION,
        MissionStatus.APPROVED,
        detail='Loueur Ivoire Auto Services',
        litres='120',
    ),
    MissionSeed(
        'schadrach.yeye@porteo-group.com',
        'Déploiement du réseau de la base vie',
        'San-Pédro',
        6,
        '05:45',
        8,
        '20:00',
        TransportType.VEHICULE_PERSONNEL,
        MissionStatus.SUBMITTED,
        analytique='IT-2026-007',
        detail='9012 EF 01',
        litres='95',
    ),
    MissionSeed(
        'ariane.nguessan@porteo-group.com',
        'Audit fournisseur matériaux',
        'Abengourou',
        3,
        '08:00',
        3,
        '18:00',
        TransportType.TRANSPORT_EN_COMMUN,
        MissionStatus.SUBMITTED,
        analytique='ACH-2026-042',
        detail='Compagnie UTB — ligne Abidjan/Abengourou',
    ),
    MissionSeed(
        'seydou.ouattara@porteo-group.com',
        'Convoyage de deux engins de chantier',
        'Korhogo',
        10,
        '04:00',
        12,
        '21:00',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.SUBMITTED,
        detail='7788 GH 01',
        litres='210.75',
    ),
    MissionSeed(
        'mamadou.kone@porteo-group.com',
        'Salon professionnel du BTP',
        'Grand-Bassam',
        -4,
        '09:00',
        -4,
        '17:00',
        TransportType.VEHICULE_PERSONNEL,
        MissionStatus.REJECTED,
        detail='3344 IJ 01',
        litres='25',
        motif='Budget déplacement du service déjà consommé pour le mois. À représenter au '
        'mois prochain avec l’accord du contrôle de gestion.',
    ),
    MissionSeed(
        'awa.bamba@porteo-group.com',
        'Visite de courtoisie sur le site client',
        'Daloa',
        -2,
        '10:00',
        -2,
        '16:00',
        TransportType.VEHICULE_LOCATION,
        MissionStatus.REJECTED,
        detail='Loueur Sahel Location',
        litres='60',
        motif='Objet de la mission insuffisamment justifié. Merci de préciser les livrables '
        'attendus et l’interlocuteur rencontré.',
    ),
    MissionSeed(
        'schadrach.yeye@porteo-group.com',
        'Maintenance des serveurs de l’agence',
        'Man',
        20,
        '06:00',
        22,
        '19:00',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.DRAFT,
        analytique='IT-2026-011',
        detail='1234 AB 01',
        litres='150',
    ),
    MissionSeed(
        'ariane.nguessan@porteo-group.com',
        'Négociation cadre avec un transporteur',
        'Bondoukou',
        15,
        '07:30',
        16,
        '18:00',
        TransportType.TRANSPORT_EN_COMMUN,
        MissionStatus.DRAFT,
    ),
    MissionSeed(
        'seydou.ouattara@porteo-group.com',
        'Contrôle technique de la flotte',
        'Abidjan — Yopougon',
        5,
        '08:00',
        5,
        '12:00',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.DRAFT,
        detail='7788 GH 01',
        litres='15',
    ),
    MissionSeed(
        'mamadou.kone@porteo-group.com',
        'Réunion de coordination régionale',
        'Gagnoa',
        -1,
        '08:00',
        -1,
        '17:00',
        TransportType.VEHICULE_ETABLISSEMENT,
        MissionStatus.CANCELLED,
        detail='5566 CD 01',
        litres='55',
    ),
)


def _instant(jours: int, heure: str) -> datetime:
    base = maintenant() + timedelta(days=jours)
    return depuis_saisie(f'{base.strftime("%Y-%m-%d")}T{heure}')


def executer() -> None:
    load_dotenv()
    db.initialiser(_normaliser_database_url(os.environ['DATABASE_URL']))
    annee = maintenant().year

    with db.session_transaction() as session:
        print('→ Nettoyage des données de démonstration…')
        for modele in (ApprovalToken, LoginToken, AuditLog, MissionOrder, Counter, RateLimit):
            session.execute(delete(modele))

        print('→ Création des utilisateurs…')
        for fiche in UTILISATEURS:
            utilisateur = session.scalars(
                select(User).where(User.email == fiche.email)
            ).one_or_none()

            if utilisateur is None:
                utilisateur = User(id=str(uuid.uuid4()), email=fiche.email)
                session.add(utilisateur)

            utilisateur.nom = fiche.nom
            utilisateur.prenoms = fiche.prenoms
            utilisateur.matricule = fiche.matricule
            utilisateur.fonction = fiche.fonction
            utilisateur.role = fiche.role
            utilisateur.actif = fiche.actif
            utilisateur.email_verifie_le = maintenant()

        session.flush()
        print(f'   {len(UTILISATEURS)} utilisateurs (1 admin, 2 RH, 6 collaborateurs).')

        valideur = session.scalars(select(User).where(User.email == 'rh@porteo-group.com')).one()

        print('→ Création des ordres de mission…')
        sequence = 0

        for graine in MISSIONS:
            demandeur = session.scalars(select(User).where(User.email == graine.email)).one()

            if graine.date_fixe:
                depart, retour = (depuis_saisie(valeur) for valeur in graine.date_fixe)
            else:
                depart = _instant(graine.jours_depart, graine.heure_depart)
                retour = _instant(graine.jours_retour, graine.heure_retour)

            # Le numéro définitif n'est attribué qu'à partir de la soumission.
            soumis = graine.statut is not MissionStatus.DRAFT
            if soumis:
                sequence += 1
                numero = f'OM-{annee}-{sequence:04d}'
            else:
                numero = f'BROUILLON-SEED-{sequence:04d}-{uuid.uuid4().hex[:4].upper()}'

            soumis_le = depart - timedelta(days=5) if soumis else None
            a_decision = graine.statut in {MissionStatus.APPROVED, MissionStatus.REJECTED}
            decide_le = (soumis_le + timedelta(days=1)) if (a_decision and soumis_le) else None

            mission = MissionOrder(
                id=str(uuid.uuid4()),
                numero=numero,
                demandeur_id=demandeur.id,
                nom=demandeur.nom,
                prenoms=demandeur.prenoms,
                matricule=demandeur.matricule,
                fonction=demandeur.fonction,
                analytique=graine.analytique,
                objet=graine.objet,
                lieu=graine.lieu,
                date_depart=depart,
                date_retour=retour,
                transport_type=graine.transport,
                transport_detail=graine.detail,
                litres_gasoil=Decimal(graine.litres) if graine.litres else None,
                statut=graine.statut,
                motif_refus=graine.motif,
                soumis_le=soumis_le,
                decide_le=decide_le,
                decide_par_id=valideur.id if a_decision else None,
                decide_par_nom=valideur.nom_complet if a_decision else None,
                decide_par_email=valideur.email if a_decision else None,
            )
            session.add(mission)
            session.flush()

            entrees = [('CREATED', demandeur.email)]
            if soumis:
                entrees.append(('SUBMITTED', demandeur.email))
            if a_decision:
                entrees.append(
                    (
                        'APPROVED' if graine.statut is MissionStatus.APPROVED else 'REJECTED',
                        valideur.email,
                    )
                )
            if graine.statut is MissionStatus.CANCELLED:
                entrees.append(('CANCELLED', demandeur.email))

            for action, acteur in entrees:
                session.add(
                    AuditLog(
                        id=str(uuid.uuid4()),
                        entite='MissionOrder',
                        entite_id=mission.id,
                        action=action,
                        acteur=acteur,
                        details={'source': 'seed'},
                    )
                )

        session.add(Counter(annee=annee, sequence=sequence))
        print(f'   {len(MISSIONS)} ordres de mission, dont {sequence} numérotés.')

    print('✓ Jeu de données de démonstration installé.')
    print('  Connexion : schadrach.yeye@porteo-group.com (collaborateur)')
    print('              rh@porteo-group.com (Ressources Humaines)')
    print('              admin@porteo-group.com (administrateur)')


if __name__ == '__main__':
    executer()
