"""Administration des collaborateurs : validation, unicité, import CSV."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domaine import utilisateurs
from app.models import AuditLog, Role, User
from tests.conftest import creer_utilisateur

ACTEUR = 'admin@porteo-group.com'

ENTETE = 'nom,prenoms,matricule,fonction,email,role'


def fiche(**surcharges: str) -> dict[str, str]:
    donnees = {
        'nom': 'kouadio',
        'prenoms': 'aya marie',
        'matricule': 'P0142',
        'fonction': 'Chargée de clientèle',
        'email': 'Aya.KOUADIO@porteo-group.com',
        'role': 'EMPLOYEE',
    }
    donnees.update(surcharges)
    return donnees


# ---------------------------------------------------------------------------
# Validation d'une fiche
# ---------------------------------------------------------------------------


def test_le_nom_et_les_prenoms_sont_mis_en_majuscules() -> None:
    """Le formulaire papier est rempli en capitales : la saisie est normalisée."""
    resultat = utilisateurs.valider(fiche())

    assert resultat.ok
    assert resultat.fiche is not None
    assert resultat.fiche.nom == 'KOUADIO'
    assert resultat.fiche.prenoms == 'AYA MARIE'
    # La fonction, elle, garde sa casse d'origine.
    assert resultat.fiche.fonction == 'Chargée de clientèle'


def test_ladresse_est_normalisee_en_minuscules() -> None:
    resultat = utilisateurs.valider(fiche())

    assert resultat.fiche is not None
    assert resultat.fiche.email == 'aya.kouadio@porteo-group.com'


def test_les_champs_obligatoires_sont_signales() -> None:
    resultat = utilisateurs.valider(
        {'nom': '', 'prenoms': '  ', 'matricule': '', 'fonction': '', 'email': ''}
    )

    assert not resultat.ok
    assert set(resultat.erreurs) == {'nom', 'prenoms', 'matricule', 'fonction', 'email'}
    assert resultat.erreurs['nom'] == 'Le nom est obligatoire'


def test_un_champ_trop_long_est_refuse() -> None:
    resultat = utilisateurs.valider(fiche(nom='X' * 101))

    assert resultat.erreurs['nom'] == 'Le nom ne peut pas dépasser 100 caractères'


def test_une_adresse_sans_domaine_est_refusee() -> None:
    for invalide in ('sans-arobase', 'a@b', 'a@sansdomaine'):
        resultat = utilisateurs.valider(fiche(email=invalide))
        assert resultat.erreurs.get('email') == 'Adresse e-mail invalide', invalide


def test_un_role_inconnu_est_refuse() -> None:
    resultat = utilisateurs.valider(fiche(role='DIRECTEUR'))

    assert resultat.erreurs['role'] == 'Rôle inconnu'


def test_le_role_est_optionnel_et_vaut_collaborateur() -> None:
    donnees = fiche()
    del donnees['role']

    resultat = utilisateurs.valider(donnees)

    assert resultat.fiche is not None
    assert resultat.fiche.role is Role.EMPLOYEE


def test_le_role_est_accepte_en_minuscules() -> None:
    resultat = utilisateurs.valider(fiche(role='hr'))

    assert resultat.fiche is not None
    assert resultat.fiche.role is Role.HR


# ---------------------------------------------------------------------------
# Création, modification, activation
# ---------------------------------------------------------------------------


def test_creer_enregistre_la_fiche_et_journalise(session: Session) -> None:
    resultat = utilisateurs.valider(fiche())
    assert resultat.fiche is not None

    utilisateur, message = utilisateurs.creer(session, resultat.fiche, ACTEUR)
    session.commit()

    assert message == ''
    assert utilisateur is not None
    assert utilisateur.email == 'aya.kouadio@porteo-group.com'

    trace = session.scalars(select(AuditLog).where(AuditLog.entite_id == utilisateur.id)).one()
    assert trace.action == 'CREATED'
    assert trace.acteur == ACTEUR


def test_une_adresse_deja_prise_est_refusee_avec_un_message_clair(session: Session) -> None:
    creer_utilisateur(session, email='aya.kouadio@porteo-group.com')

    resultat = utilisateurs.valider(fiche())
    assert resultat.fiche is not None
    utilisateur, message = utilisateurs.creer(session, resultat.fiche, ACTEUR)

    assert utilisateur is None
    assert message == 'Cette adresse e-mail est déjà utilisée par un autre collaborateur.'


def test_un_matricule_deja_pris_est_refuse_avec_un_message_clair(session: Session) -> None:
    existant = creer_utilisateur(session)

    resultat = utilisateurs.valider(fiche(matricule=existant.matricule))
    assert resultat.fiche is not None
    utilisateur, message = utilisateurs.creer(session, resultat.fiche, ACTEUR)

    assert utilisateur is None
    assert message == 'Ce matricule est déjà attribué à un autre collaborateur.'


def test_modifier_met_a_jour_et_journalise(session: Session) -> None:
    utilisateur = creer_utilisateur(session)

    resultat = utilisateurs.valider(fiche(role='ADMIN'))
    assert resultat.fiche is not None
    ok, message = utilisateurs.modifier(session, utilisateur, resultat.fiche, ACTEUR)
    session.commit()

    assert (ok, message) == (True, '')
    assert utilisateur.role is Role.ADMIN
    assert utilisateur.nom == 'KOUADIO'

    trace = session.scalars(select(AuditLog).where(AuditLog.entite_id == utilisateur.id)).one()
    assert trace.action == 'UPDATED'


def test_modifier_vers_une_adresse_deja_prise_est_refuse(session: Session) -> None:
    creer_utilisateur(session, email='aya.kouadio@porteo-group.com')
    autre = creer_utilisateur(session)

    resultat = utilisateurs.valider(fiche(matricule=autre.matricule))
    assert resultat.fiche is not None
    ok, message = utilisateurs.modifier(session, autre, resultat.fiche, ACTEUR)

    assert ok is False
    assert 'adresse e-mail' in message


def test_un_collaborateur_est_desactive_puis_reactive(session: Session) -> None:
    """Jamais de suppression : les ordres déjà émis gardent leur demandeur."""
    utilisateur = creer_utilisateur(session)

    assert utilisateurs.basculer_activation(session, utilisateur, False, ACTEUR) == (
        'Collaborateur désactivé.'
    )
    assert utilisateur.actif is False

    assert utilisateurs.basculer_activation(session, utilisateur, True, ACTEUR) == (
        'Collaborateur réactivé.'
    )
    assert utilisateur.actif is True


def test_lister_place_les_actifs_devant_puis_trie_par_nom(session: Session) -> None:
    creer_utilisateur(session, nom='ZAHUI', prenoms='PAUL')
    creer_utilisateur(session, nom='ABOA', prenoms='SYLVIE')
    creer_utilisateur(session, nom='BAMBA', prenoms='ISSA', actif=False)

    assert [(u.nom, u.actif) for u in utilisateurs.lister(session)] == [
        ('ABOA', True),
        ('ZAHUI', True),
        ('BAMBA', False),
    ]


# ---------------------------------------------------------------------------
# Analyse du CSV
# ---------------------------------------------------------------------------


def test_un_fichier_vide_est_signale() -> None:
    analyse = utilisateurs.analyser_csv('   \n\n')

    assert [erreur.message for erreur in analyse.erreurs] == ['Le fichier est vide.']


def test_les_colonnes_manquantes_sont_enumerees() -> None:
    analyse = utilisateurs.analyser_csv('nom,prenoms\nKOUADIO,AYA')

    assert analyse.valides == []
    assert 'matricule, fonction, email, role' in analyse.erreurs[0].message


def test_le_point_virgule_dexcel_francophone_est_accepte() -> None:
    contenu = (
        '﻿nom;prenoms;matricule;fonction;email;role\n'
        'kouadio;aya;P0142;Chargée;aya@porteo-group.com;HR\n'
    )

    analyse = utilisateurs.analyser_csv(contenu)

    assert analyse.erreurs == []
    assert analyse.valides[0].fiche.nom == 'KOUADIO'
    assert analyse.valides[0].fiche.role is Role.HR


def test_lordre_des_colonnes_est_libre() -> None:
    contenu = (
        'email,role,nom,matricule,prenoms,fonction\naya@porteo-group.com,,KOUADIO,P1,AYA,Chargée\n'
    )

    analyse = utilisateurs.analyser_csv(contenu)

    assert analyse.erreurs == []
    assert analyse.valides[0].fiche.matricule == 'P1'


def test_une_ligne_invalide_nempeche_pas_les_autres() -> None:
    contenu = (
        f'{ENTETE}\n'
        'KOUADIO,AYA,P1,Chargée,aya@porteo-group.com,EMPLOYEE\n'
        'BAMBA,ISSA,P2,Chauffeur,adresse-invalide,EMPLOYEE\n'
        'ZAHUI,PAUL,P3,Technicien,paul@porteo-group.com,HR\n'
    )

    analyse = utilisateurs.analyser_csv(contenu)

    assert [ligne.fiche.matricule for ligne in analyse.valides] == ['P1', 'P3']
    assert len(analyse.erreurs) == 1
    # Le numéro de ligne renvoyé est celui du tableur, en-tête comprise.
    assert analyse.erreurs[0].ligne == 3
    assert 'email' in analyse.erreurs[0].message


def test_une_ligne_incomplete_est_signalee_sans_planter() -> None:
    analyse = utilisateurs.analyser_csv(f'{ENTETE}\nKOUADIO,AYA\n')

    assert analyse.valides == []
    assert 'matricule' in analyse.erreurs[0].message


# ---------------------------------------------------------------------------
# Import CSV
# ---------------------------------------------------------------------------


def test_limport_cree_les_collaborateurs_inconnus(session: Session) -> None:
    contenu = (
        f'{ENTETE}\n'
        'KOUADIO,AYA,P1,Chargée,aya@porteo-group.com,EMPLOYEE\n'
        'ZAHUI,PAUL,P3,Technicien,paul@porteo-group.com,HR\n'
    )

    resultat = utilisateurs.importer_csv(session, contenu, ACTEUR)
    session.commit()

    assert (resultat.crees, resultat.mis_a_jour, resultat.erreurs) == (2, 0, [])
    assert len(session.scalars(select(User)).all()) == 2


def test_limport_met_a_jour_un_collaborateur_deja_connu(session: Session) -> None:
    """L'adresse e-mail sert de clef : réimporter ne crée pas de doublon."""
    existant = creer_utilisateur(session, email='aya@porteo-group.com', nom='ANCIEN')

    contenu = f'{ENTETE}\nKOUADIO,AYA,P1,Chargée,aya@porteo-group.com,HR\n'
    resultat = utilisateurs.importer_csv(session, contenu, ACTEUR)
    session.commit()

    assert (resultat.crees, resultat.mis_a_jour) == (0, 1)
    assert existant.nom == 'KOUADIO'
    assert existant.role is Role.HR
    assert len(session.scalars(select(User)).all()) == 1


def test_limport_signale_les_lignes_en_conflit_de_matricule(session: Session) -> None:
    occupant = creer_utilisateur(session, email='deja@porteo-group.com')

    contenu = f'{ENTETE}\nKOUADIO,AYA,{occupant.matricule},Chargée,aya@porteo-group.com,EMPLOYEE\n'
    resultat = utilisateurs.importer_csv(session, contenu, ACTEUR)

    assert resultat.crees == 0
    assert 'matricule' in resultat.erreurs[0].message


def test_limport_journalise_son_bilan(session: Session) -> None:
    contenu = (
        f'{ENTETE}\n'
        'KOUADIO,AYA,P1,Chargée,aya@porteo-group.com,EMPLOYEE\n'
        'BAMBA,ISSA,P2,Chauffeur,invalide,EMPLOYEE\n'
    )

    utilisateurs.importer_csv(session, contenu, ACTEUR)
    session.commit()

    trace = session.scalars(select(AuditLog).where(AuditLog.entite_id == 'import-csv')).one()
    assert trace.details == {'crees': 1, 'mis_a_jour': 0, 'erreurs': 1}
