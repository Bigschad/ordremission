"""Les cinq scénarios du cahier des charges, joués dans un vrai navigateur.

1. Connexion par lien magique.
2. Brouillon → modification → soumission → e-mail RH.
3. Validation par les RH depuis la boîte mail, sans connexion.
4. Refus sans motif, puis avec motif.
5. Rejeu d'un lien déjà utilisé.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from playwright.sync_api import Page, expect

from app.models import maintenant
from e2e.conftest import DEMANDEUR, attendre_lien, attendre_message, messages, ouvrir_session


def remplir(page: Page, *, lieu: str = 'Assinie', objet: str = 'Visite chantier') -> None:
    depart = maintenant() + timedelta(days=7)
    page.get_by_label('Objet de la mission').fill(objet)
    page.get_by_label('Lieu de la mission').fill(lieu)
    page.get_by_label('Code analytique').fill('IT-2026-001')
    page.get_by_label('Date et heure de départ').fill(depart.strftime('%Y-%m-%dT08:00'))
    page.get_by_label('Date et heure de retour').fill(depart.strftime('%Y-%m-%dT17:00'))
    page.get_by_label("Véhicule de l'établissement").check()
    page.get_by_label('Détail du transport').fill('1234 AB 01')
    page.get_by_label('Quantité de gasoil').fill('40')


def soumettre(page: Page, **champs: str) -> str:
    """Crée et soumet un ordre de mission. Renvoie son numéro."""
    page.goto('/missions/nouveau')
    remplir(page, **champs)
    page.get_by_role('button', name='Soumettre aux RH').click()

    numero = page.get_by_test_id('numero-mission')
    expect(numero).to_be_visible()
    return (numero.inner_text() or '').strip()


# ---------------------------------------------------------------------------
# Scénario 1
# ---------------------------------------------------------------------------


def test_1_connexion_par_lien_magique(anonyme: Page) -> None:
    ouvrir_session(anonyme, DEMANDEUR)

    expect(anonyme.get_by_role('heading', name='Mes ordres de mission')).to_be_visible()
    expect(anonyme.get_by_text('SCHADRACH GUY-ROLAND YEYE')).to_be_visible()


def test_1bis_le_lien_ne_sert_quune_fois(anonyme: Page) -> None:
    depuis = len(messages())
    anonyme.goto('/login')
    anonyme.get_by_label('Adresse e-mail professionnelle').fill(DEMANDEUR)
    anonyme.get_by_role('button', name='Recevoir mon lien de connexion').click()

    lien = attendre_lien(r'/login/callback\?[^\s"\'<>]+', depuis)
    anonyme.goto(lien)
    expect(anonyme.get_by_role('heading', name='Mes ordres de mission')).to_be_visible()

    anonyme.get_by_role('button', name='Quitter').click()
    anonyme.goto(lien)

    expect(anonyme.get_by_text("n'est plus valable")).to_be_visible()


# ---------------------------------------------------------------------------
# Scénario 2
# ---------------------------------------------------------------------------


def test_2_brouillon_modification_soumission(page: Page) -> None:
    # -- Brouillon --------------------------------------------------------
    page.goto('/missions/nouveau')
    remplir(page, lieu='Assinie')
    page.get_by_role('button', name='Enregistrer comme brouillon').click()

    expect(page.get_by_text('Brouillon enregistré.')).to_be_visible()
    expect(page.get_by_text('Brouillon').first).to_be_visible()

    # -- Modification -------------------------------------------------------
    page.get_by_role('link', name='Modifier le brouillon').click()
    page.get_by_label('Lieu de la mission').fill('Grand-Bassam')

    # -- Soumission ---------------------------------------------------------
    depuis = len(messages())
    page.get_by_role('button', name='Soumettre aux RH').click()

    numero = (page.get_by_test_id('numero-mission').inner_text() or '').strip()
    assert numero.startswith('OM-')
    expect(page.get_by_text('En attente de validation').first).to_be_visible()

    # -- E-mail reçu par les RH ---------------------------------------------
    attendre_lien(r'/approve/[A-Za-z0-9_-]+', depuis)
    courriel = messages()[-1]

    assert courriel['destinataires'] == ['rh@porteo-group.com']
    assert numero in courriel['objet']
    assert 'Grand-Bassam' in courriel['objet']
    assert courriel['pieces_jointes'][0]['nom'] == f'{numero}_YEYE.pdf'


def test_2bis_une_saisie_invalide_est_signalee_sans_soumettre(page: Page) -> None:
    page.goto('/missions/nouveau')

    remplir(page)
    page.get_by_label('Véhicule de location').check()
    page.get_by_label('Détail du transport').fill('')
    page.get_by_role('button', name='Soumettre aux RH').click()

    expect(page.get_by_text('Le nom du loueur est obligatoire')).to_be_visible()
    # La saisie déjà faite est conservée : rien à ressaisir.
    expect(page.get_by_label('Lieu de la mission')).to_have_value('Assinie')


# ---------------------------------------------------------------------------
# Scénario 3
# ---------------------------------------------------------------------------


def test_3_validation_par_les_rh_depuis_la_boite_mail(page: Page, anonyme: Page) -> None:
    depuis = len(messages())
    numero = soumettre(page, lieu='Yamoussoukro')
    lien = attendre_lien(r'/approve/[A-Za-z0-9_-]+', depuis)

    # Les RH ouvrent le lien dans un navigateur sans session applicative.
    anonyme.goto(lien)
    expect(anonyme.get_by_role('heading', name=f'Ordre de mission {numero}')).to_be_visible()
    expect(anonyme.get_by_text('Yamoussoukro')).to_be_visible()

    # Le simple affichage n'a rien décidé.
    page.reload()
    expect(page.get_by_text('En attente de validation').first).to_be_visible()

    avant_decision = len(messages())
    anonyme.get_by_role('button', name='Confirmer la validation').click()
    expect(anonyme.get_by_text(f'Ordre de mission {numero} validé')).to_be_visible()

    page.reload()
    expect(page.get_by_text('Validé').first).to_be_visible()

    courriel = attendre_message(avant_decision)
    assert courriel['destinataires'] == [DEMANDEUR]
    assert courriel['objet'] == f'Ordre de mission {numero} — validé'
    assert len(courriel['pieces_jointes']) == 1


# ---------------------------------------------------------------------------
# Scénario 4
# ---------------------------------------------------------------------------


def test_4_refus_sans_puis_avec_motif(page: Page, anonyme: Page) -> None:
    depuis = len(messages())
    numero = soumettre(page, lieu='Bouaké')
    lien = attendre_lien(r'/reject/[A-Za-z0-9_-]+', depuis)

    anonyme.goto(lien)

    # -- Motif trop court : refus bloqué ------------------------------------
    anonyme.get_by_label('Motif du refus').fill('Non')
    anonyme.get_by_role('button', name='Confirmer le refus').click()
    expect(anonyme.get_by_text('au moins 10 caractères')).to_be_visible()

    page.reload()
    expect(page.get_by_text('En attente de validation').first).to_be_visible()

    # -- Motif suffisant : refus enregistré ----------------------------------
    motif = 'Budget déplacement du service déjà consommé pour le mois en cours.'
    anonyme.get_by_label('Motif du refus').fill(motif)
    anonyme.get_by_role('button', name='Confirmer le refus').click()

    expect(anonyme.get_by_text(f'Ordre de mission {numero} refusé')).to_be_visible()

    page.reload()
    expect(page.get_by_text('Refusé').first).to_be_visible()

    courriel = messages()[-1]
    assert 'refusé' in courriel['objet']
    assert motif in courriel['html']
    # Un ordre refusé ne circule pas : aucune pièce jointe.
    assert courriel['pieces_jointes'] == []


# ---------------------------------------------------------------------------
# Scénario 5
# ---------------------------------------------------------------------------


def test_5_un_lien_deja_utilise_na_plus_aucun_effet(page: Page, anonyme: Page) -> None:
    depuis = len(messages())
    numero = soumettre(page, lieu='San-Pédro')

    valider = attendre_lien(r'/approve/[A-Za-z0-9_-]+', depuis)
    refuser = attendre_lien(r'/reject/[A-Za-z0-9_-]+', depuis)

    anonyme.goto(valider)
    anonyme.get_by_role('button', name='Confirmer la validation').click()
    expect(anonyme.get_by_text(f'Ordre de mission {numero} validé')).to_be_visible()

    # -- Rejeu du lien de validation ----------------------------------------
    anonyme.goto(valider)
    expect(anonyme.get_by_text('Lien inutilisable')).to_be_visible()
    expect(anonyme.get_by_text('décision a déjà été prise')).to_be_visible()

    # -- Le lien de refus, jamais ouvert, est caduc lui aussi (règle 7) ------
    anonyme.goto(refuser)
    expect(anonyme.get_by_text('Lien inutilisable')).to_be_visible()

    page.reload()
    expect(page.get_by_text('Validé').first).to_be_visible()


# ---------------------------------------------------------------------------
# Cloisonnement et pages publiques
# ---------------------------------------------------------------------------


def test_la_file_rh_est_fermee_aux_collaborateurs(page: Page) -> None:
    reponse = page.goto('/rh/')

    assert reponse is not None
    assert reponse.status == 403


def test_les_rh_retrouvent_lordre_dans_leur_file(page: Page, page_rh: Page) -> None:
    numero = soumettre(page, lieu='Korhogo')

    page_rh.goto('/rh/')
    expect(page_rh.get_by_text(numero).first).to_be_visible()


@pytest.mark.parametrize('chemin_protege', ['/', '/missions/nouveau'])
def test_les_pages_protegees_renvoient_vers_la_connexion(
    anonyme: Page, chemin_protege: str
) -> None:
    anonyme.goto(chemin_protege)

    expect(anonyme.get_by_role('heading', name='Connexion')).to_be_visible()
