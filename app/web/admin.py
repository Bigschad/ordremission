"""Administration des collaborateurs — réservée au rôle ADMIN."""

from __future__ import annotations

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for
from sqlalchemy import func, select
from werkzeug.wrappers import Response

from app.domaine import utilisateurs as service
from app.models import MissionOrder, Role, User
from app.web.securite import admin_requis, utilisateur_courant

bp = Blueprint('admin', __name__, url_prefix='/admin')


def _compter_missions() -> dict[str, int]:
    lignes = g.db.execute(
        select(MissionOrder.demandeur_id, func.count()).group_by(MissionOrder.demandeur_id)
    )
    return {identifiant: int(nombre) for identifiant, nombre in lignes}


@bp.get('/utilisateurs')
@admin_requis
def liste() -> str:
    liste_utilisateurs = service.lister(g.db)
    return render_template(
        'admin/utilisateurs.html',
        utilisateurs=liste_utilisateurs,
        nb_missions=_compter_missions(),
        libelles_role=service.LIBELLES_ROLE,
        roles=list(Role),
        colonnes_csv=service.COLONNES_CSV,
        actifs=sum(1 for u in liste_utilisateurs if u.actif),
    )


@bp.post('/utilisateurs')
@admin_requis
def creer() -> Response:
    admin = utilisateur_courant()
    assert admin is not None

    resultat = service.valider(request.form.to_dict(), actif=request.form.get('actif') == 'on')

    if not resultat.ok or resultat.fiche is None:
        flash(
            'Fiche invalide : ' + ' — '.join(resultat.erreurs.values()),
            'erreur',
        )
        return redirect(url_for('admin.liste'))

    _, erreur = service.creer(g.db, resultat.fiche, admin.email)
    flash(erreur or 'Collaborateur enregistré.', 'erreur' if erreur else 'succes')
    return redirect(url_for('admin.liste'))


@bp.post('/utilisateurs/<utilisateur_id>')
@admin_requis
def modifier(utilisateur_id: str) -> Response:
    admin = utilisateur_courant()
    assert admin is not None

    cible = g.db.get(User, utilisateur_id)
    if cible is None:
        abort(404)

    actif = request.form.get('actif') == 'on'
    resultat = service.valider(request.form.to_dict(), actif=actif)

    if not resultat.ok or resultat.fiche is None:
        flash('Fiche invalide : ' + ' — '.join(resultat.erreurs.values()), 'erreur')
        return redirect(url_for('admin.liste'))

    # Un administrateur ne peut ni se rétrograder ni se désactiver lui-même :
    # cela pourrait laisser l'application sans administrateur actif.
    if cible.id == admin.id and (resultat.fiche.role is not Role.ADMIN or not actif):
        flash(
            'Vous ne pouvez pas retirer votre propre rôle d’administrateur '
            'ni désactiver votre compte.',
            'erreur',
        )
        return redirect(url_for('admin.liste'))

    _, erreur = service.modifier(g.db, cible, resultat.fiche, admin.email)
    flash(erreur or 'Fiche collaborateur mise à jour.', 'erreur' if erreur else 'succes')
    return redirect(url_for('admin.liste'))


@bp.post('/utilisateurs/<utilisateur_id>/activation')
@admin_requis
def activation(utilisateur_id: str) -> Response:
    admin = utilisateur_courant()
    assert admin is not None

    cible = g.db.get(User, utilisateur_id)
    if cible is None:
        abort(404)

    actif = request.form.get('actif') == 'oui'

    if cible.id == admin.id and not actif:
        flash('Vous ne pouvez pas désactiver votre propre compte.', 'erreur')
        return redirect(url_for('admin.liste'))

    flash(service.basculer_activation(g.db, cible, actif, admin.email), 'succes')
    return redirect(url_for('admin.liste'))


@bp.post('/utilisateurs/import')
@admin_requis
def importer() -> Response:
    admin = utilisateur_courant()
    assert admin is not None

    fichier = request.files.get('fichier')
    if fichier is None or not fichier.filename:
        flash('Sélectionnez un fichier CSV.', 'erreur')
        return redirect(url_for('admin.liste'))

    contenu = fichier.read().decode('utf-8-sig', errors='replace')
    resultat = service.importer_csv(g.db, contenu, admin.email)

    message = (
        f'Import terminé : {resultat.crees} création(s), '
        f'{resultat.mis_a_jour} mise(s) à jour, {len(resultat.erreurs)} ligne(s) en erreur.'
    )
    flash(message, 'attention' if resultat.erreurs else 'succes')

    for erreur in resultat.erreurs[:10]:
        flash(f'Ligne {erreur.ligne} — {erreur.message}', 'erreur')

    return redirect(url_for('admin.liste'))
