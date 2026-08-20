"""Modèle de données — reprend exactement les champs du formulaire papier."""

from __future__ import annotations

import enum
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, ClassVar

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, TypeDecorator


def maintenant() -> datetime:
    """Instant courant en UTC. Tout est stocké en UTC, affiché à Abidjan."""
    return datetime.now(UTC)


class UtcDateTime(TypeDecorator[datetime]):
    """Horodatage toujours conscient du fuseau, en UTC.

    PostgreSQL conserve le fuseau, SQLite non : sans ce type, une date relue
    depuis SQLite serait naïve et toute comparaison avec `datetime.now(UTC)`
    lèverait `TypeError`. On normalise donc à l'écriture comme à la lecture.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            # Une valeur naïve est réputée déjà exprimée en UTC.
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    """Base déclarative, avec le JSON portable entre PostgreSQL et SQLite."""

    type_annotation_map: ClassVar[dict[object, object]] = {dict: JSON}


# ---------------------------------------------------------------------------
# Énumérations métier
# ---------------------------------------------------------------------------


class Role(enum.StrEnum):
    EMPLOYEE = 'EMPLOYEE'
    HR = 'HR'
    ADMIN = 'ADMIN'


class MissionStatus(enum.StrEnum):
    DRAFT = 'DRAFT'  # brouillon, non soumis
    SUBMITTED = 'SUBMITTED'  # envoyé aux RH, en attente
    APPROVED = 'APPROVED'  # validé RH
    REJECTED = 'REJECTED'  # refusé RH
    CANCELLED = 'CANCELLED'  # annulé par le demandeur avant décision


class TransportType(enum.StrEnum):
    VEHICULE_ETABLISSEMENT = 'VEHICULE_ETABLISSEMENT'
    VEHICULE_PERSONNEL = 'VEHICULE_PERSONNEL'
    VEHICULE_LOCATION = 'VEHICULE_LOCATION'
    TRANSPORT_EN_COMMUN = 'TRANSPORT_EN_COMMUN'


# Les énumérations sont stockées par leur nom, identique sur les deux moteurs.
def _enum(colonne: type[enum.Enum], nom: str) -> Enum:
    return Enum(colonne, name=nom, native_enum=False, length=32, validate_strings=True)


# ---------------------------------------------------------------------------
# Utilisateurs
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = 'utilisateur'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    nom: Mapped[str] = mapped_column(String(100))  # ex. YEYE
    prenoms: Mapped[str] = mapped_column(String(150))  # ex. SCHADRACH GUY-ROLAND
    matricule: Mapped[str] = mapped_column(String(20), unique=True)  # ex. 4071
    fonction: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    email_verifie_le: Mapped[datetime | None] = mapped_column(UtcDateTime)
    role: Mapped[Role] = mapped_column(_enum(Role, 'role'), default=Role.EMPLOYEE)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)

    cree_le: Mapped[datetime] = mapped_column(UtcDateTime, default=maintenant)
    modifie_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=maintenant, onupdate=maintenant
    )

    missions: Mapped[list[MissionOrder]] = relationship(back_populates='demandeur')

    @property
    def nom_complet(self) -> str:
        return f'{self.prenoms} {self.nom}'


# ---------------------------------------------------------------------------
# Ordres de mission
# ---------------------------------------------------------------------------


class MissionOrder(Base):
    __tablename__ = 'ordre_mission'
    __table_args__ = (
        Index('ix_ordre_demandeur_statut', 'demandeur_id', 'statut'),
        Index('ix_ordre_statut_soumis', 'statut', 'soumis_le'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    numero: Mapped[str] = mapped_column(String(40), unique=True)  # OM-2026-0001
    demandeur_id: Mapped[str] = mapped_column(ForeignKey('utilisateur.id'))
    demandeur: Mapped[User] = relationship(back_populates='missions')

    # Identité figée à la soumission : le poste peut changer ensuite.
    nom: Mapped[str] = mapped_column(String(100))
    prenoms: Mapped[str] = mapped_column(String(150))
    matricule: Mapped[str] = mapped_column(String(20))
    fonction: Mapped[str] = mapped_column(String(150))
    analytique: Mapped[str | None] = mapped_column(String(50))

    objet: Mapped[str] = mapped_column(String(300))
    lieu: Mapped[str] = mapped_column(String(200))
    date_depart: Mapped[datetime] = mapped_column(UtcDateTime)
    date_retour: Mapped[datetime] = mapped_column(UtcDateTime)

    transport_type: Mapped[TransportType] = mapped_column(_enum(TransportType, 'transport'))
    transport_detail: Mapped[str | None] = mapped_column(String(200))
    litres_gasoil: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    statut: Mapped[MissionStatus] = mapped_column(
        _enum(MissionStatus, 'statut_mission'), default=MissionStatus.DRAFT
    )
    motif_refus: Mapped[str | None] = mapped_column(Text)

    soumis_le: Mapped[datetime | None] = mapped_column(UtcDateTime)
    decide_le: Mapped[datetime | None] = mapped_column(UtcDateTime)
    decide_par_id: Mapped[str | None] = mapped_column(String(36))
    decide_par_nom: Mapped[str | None] = mapped_column(String(200))
    decide_par_email: Mapped[str | None] = mapped_column(String(255))

    # Compteur de relances « Renvoyer aux RH ».
    relances: Mapped[int] = mapped_column(Integer, default=0)

    cree_le: Mapped[datetime] = mapped_column(UtcDateTime, default=maintenant)
    modifie_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=maintenant, onupdate=maintenant
    )

    jetons: Mapped[list[ApprovalToken]] = relationship(
        back_populates='mission', cascade='all, delete-orphan'
    )


class ApprovalToken(Base):
    """Jeton transmis aux RH par e-mail. Seule l'empreinte SHA-256 est stockée."""

    __tablename__ = 'jeton_approbation'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    empreinte: Mapped[str] = mapped_column(String(64), unique=True)
    mission_id: Mapped[str] = mapped_column(
        ForeignKey('ordre_mission.id', ondelete='CASCADE'), index=True
    )
    mission: Mapped[MissionOrder] = relationship(back_populates='jetons')

    action: Mapped[str] = mapped_column(String(10))  # APPROVE | REJECT
    expire_le: Mapped[datetime] = mapped_column(UtcDateTime)
    utilise_le: Mapped[datetime | None] = mapped_column(UtcDateTime)
    cree_le: Mapped[datetime] = mapped_column(UtcDateTime, default=maintenant)


# ---------------------------------------------------------------------------
# Authentification par lien magique
# ---------------------------------------------------------------------------


class LoginToken(Base):
    """Lien de connexion à usage unique. Là encore, seule l'empreinte est stockée."""

    __tablename__ = 'jeton_connexion'

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    empreinte: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    expire_le: Mapped[datetime] = mapped_column(UtcDateTime)
    utilise_le: Mapped[datetime | None] = mapped_column(UtcDateTime)
    cree_le: Mapped[datetime] = mapped_column(UtcDateTime, default=maintenant)


# ---------------------------------------------------------------------------
# Journal d'audit
# ---------------------------------------------------------------------------


class AuditLog(Base):
    __tablename__ = 'journal_audit'
    __table_args__ = (Index('ix_journal_entite', 'entite', 'entite_id'),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    entite: Mapped[str] = mapped_column(String(40))
    entite_id: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(40))
    acteur: Mapped[str] = mapped_column(String(255))  # e-mail ou « SYSTEM »
    ip: Mapped[str | None] = mapped_column(String(60))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    cree_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=maintenant, index=True
    )


# ---------------------------------------------------------------------------
# Infrastructure : numérotation et limitation de débit
# ---------------------------------------------------------------------------


class Counter(Base):
    """Séquence annuelle des numéros d'ordre de mission.

    Verrouillée en transaction (`SELECT … FOR UPDATE` sur PostgreSQL) pour
    garantir l'unicité du numéro sous concurrence.
    """

    __tablename__ = 'compteur'

    annee: Mapped[int] = mapped_column(Integer, primary_key=True)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    modifie_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=maintenant, onupdate=maintenant
    )


class RateLimit(Base):
    """Fenêtre glissante de limitation de débit, stockée en base.

    L'offre gratuite exclut Redis : PostgreSQL fait l'affaire, à raison d'une
    écriture par requête protégée.
    """

    __tablename__ = 'limite_debit'
    __table_args__ = (
        UniqueConstraint('cle', 'fenetre_debut', name='uq_limite_cle_fenetre'),
        Index('ix_limite_fenetre', 'fenetre_debut'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cle: Mapped[str] = mapped_column(String(200))
    fenetre_debut: Mapped[datetime] = mapped_column(UtcDateTime)
    compteur: Mapped[int] = mapped_column(Integer, default=0)
    modifie_le: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=maintenant, onupdate=maintenant
    )
