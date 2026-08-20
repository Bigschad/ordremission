"""Lectures des ordres de mission, contrôle d'accès inclus.

Règle 9 : un collaborateur ne voit que ses propres ordres ; seuls les rôles HR
et ADMIN disposent d'une vue globale. Le filtre est appliqué **ici**, jamais
dans les gabarits.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.db import est_sqlite
from app.models import MissionOrder, MissionStatus, Role, User

PAR_PAGE_DEFAUT = 20
EXPORT_MAX = 5000


def a_vue_globale(utilisateur: User) -> bool:
    return utilisateur.role in {Role.HR, Role.ADMIN}


def est_admin(utilisateur: User) -> bool:
    return utilisateur.role is Role.ADMIN


def _contient(colonne: InstrumentedAttribute[str], terme: str) -> ColumnElement[bool]:
    """Recherche insensible à la casse, portable entre les deux moteurs.

    PostgreSQL exige `ILIKE` ; SQLite compare déjà les caractères ASCII sans
    tenir compte de la casse — la différence ne porte que sur les accents, ce
    qui est acceptable pour une base de démonstration.
    """
    motif = f'%{terme}%'
    condition: ColumnElement[bool] = colonne.like(motif) if est_sqlite() else colonne.ilike(motif)
    return condition


def mes_missions(
    session: Session, utilisateur: User, statut: MissionStatus | None = None
) -> list[MissionOrder]:
    requete = select(MissionOrder).where(MissionOrder.demandeur_id == utilisateur.id)
    if statut is not None:
        requete = requete.where(MissionOrder.statut == statut)
    return list(session.scalars(requete.order_by(MissionOrder.cree_le.desc())))


def trouver(session: Session, utilisateur: User, mission_id: str) -> MissionOrder | None:
    """Lit un ordre de mission avec contrôle d'accès.

    Renvoie `None` si l'ordre n'existe pas **ou** si l'utilisateur n'y a pas
    droit : les deux cas sont indiscernables pour l'appelant.
    """
    requete = select(MissionOrder).where(MissionOrder.id == mission_id)
    if not a_vue_globale(utilisateur):
        requete = requete.where(MissionOrder.demandeur_id == utilisateur.id)
    return session.scalars(requete).one_or_none()


def trouver_par_numero(session: Session, numero: str) -> MissionOrder | None:
    """Lecture publique par numéro, pour la vérification d'authenticité."""
    return session.scalars(select(MissionOrder).where(MissionOrder.numero == numero)).one_or_none()


@dataclass
class Filtres:
    statut: MissionStatus | None = None
    demandeur_id: str | None = None
    lieu: str | None = None
    recherche: str | None = None
    du: datetime | None = None
    au: datetime | None = None
    tri: str = 'recent'
    page: int = 1
    par_page: int = PAR_PAGE_DEFAUT


TRIS_VALIDES = ('recent', 'ancien', 'depart', 'numero')


def _conditions(filtres: Filtres) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []

    if filtres.statut is not None:
        conditions.append(MissionOrder.statut == filtres.statut)
    if filtres.demandeur_id:
        conditions.append(MissionOrder.demandeur_id == filtres.demandeur_id)
    if filtres.lieu:
        conditions.append(_contient(MissionOrder.lieu, filtres.lieu))
    if filtres.du is not None:
        conditions.append(MissionOrder.date_depart >= filtres.du)
    if filtres.au is not None:
        conditions.append(MissionOrder.date_depart <= filtres.au)

    terme = (filtres.recherche or '').strip()
    if terme:
        conditions.append(
            or_(
                _contient(MissionOrder.numero, terme),
                _contient(MissionOrder.nom, terme),
                _contient(MissionOrder.prenoms, terme),
                _contient(MissionOrder.matricule, terme),
                _contient(MissionOrder.objet, terme),
                _contient(MissionOrder.lieu, terme),
            )
        )

    return conditions


def _ordonner(requete: Select[tuple[MissionOrder]], tri: str) -> Select[tuple[MissionOrder]]:
    if tri == 'ancien':
        return requete.order_by(MissionOrder.cree_le.asc())
    if tri == 'depart':
        return requete.order_by(MissionOrder.date_depart.asc())
    if tri == 'numero':
        return requete.order_by(MissionOrder.numero.asc())
    return requete.order_by(MissionOrder.cree_le.desc())


@dataclass
class Page:
    missions: list[MissionOrder] = field(default_factory=list)
    total: int = 0
    page: int = 1
    par_page: int = PAR_PAGE_DEFAUT

    @property
    def nb_pages(self) -> int:
        return max(1, -(-self.total // self.par_page))


def file_rh(session: Session, filtres: Filtres) -> Page:
    """File d'attente RH : filtres, recherche, tri et pagination."""
    conditions = _conditions(filtres)
    page = max(1, filtres.page)

    total = int(
        session.scalar(select(func.count()).select_from(MissionOrder).where(*conditions)) or 0
    )

    requete = _ordonner(select(MissionOrder).where(*conditions), filtres.tri)
    missions = list(
        session.scalars(requete.offset((page - 1) * filtres.par_page).limit(filtres.par_page))
    )

    return Page(missions=missions, total=total, page=page, par_page=filtres.par_page)


def pour_export(session: Session, filtres: Filtres) -> list[MissionOrder]:
    """Même filtrage que la file, sans pagination — pour l'export CSV."""
    requete = _ordonner(select(MissionOrder).where(*_conditions(filtres)), filtres.tri)
    return list(session.scalars(requete.limit(EXPORT_MAX)))


def compter_par_statut(
    session: Session, demandeur_id: str | None = None
) -> dict[MissionStatus, int]:
    """Compteurs par statut, pour les onglets de filtre."""
    requete = select(MissionOrder.statut, func.count()).group_by(MissionOrder.statut)
    if demandeur_id:
        requete = requete.where(MissionOrder.demandeur_id == demandeur_id)

    compteurs: dict[MissionStatus, int] = dict.fromkeys(MissionStatus, 0)
    for statut, nombre in session.execute(requete):
        compteurs[statut] = int(nombre)
    return compteurs


def demandeurs(session: Session) -> list[User]:
    """Collaborateurs ayant au moins un ordre de mission, pour le filtre RH."""
    return list(
        session.scalars(
            select(User).where(User.missions.any()).order_by(User.nom.asc(), User.prenoms.asc())
        )
    )
