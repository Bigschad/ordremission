# Checklist de recette

À dérouler après chaque déploiement, sur l'environnement de production.
Prévoir environ 20 minutes.

**Prérequis** : un compte collaborateur actif, un accès à la boîte `HR_EMAIL`,
un compte administrateur.

---

## 1. Connexion

| #   | Vérification                              | Attendu                                                                             | OK  |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------- | --- |
| 1.1 | Ouvrir `/` sans être connecté             | Redirection vers `/login?suite=%2F`                                                 | ☐   |
| 1.2 | Saisir une adresse de collaborateur actif | Écran « Vérifiez votre boîte mail »                                                 | ☐   |
| 1.3 | Consulter la boîte mail                   | Message « Votre lien de connexion — Ordres de mission Porteo », aux couleurs Porteo | ☐   |
| 1.4 | Ouvrir le lien                            | Arrivée sur le tableau de bord, nom et matricule affichés en haut à droite          | ☐   |
| 1.5 | Réouvrir le **même** lien                 | Page « Connexion impossible », aucune session ouverte                               | ☐   |
| 1.6 | Saisir une adresse inexistante            | Écran **identique** à l'étape 1.2, aucun e-mail envoyé, aucun compte créé           | ☐   |
| 1.7 | Saisir une adresse désactivée             | Idem 1.6                                                                            | ☐   |
| 1.8 | Demander 6 liens d'affilée                | Le 6ᵉ est bloqué : « Trop de demandes de connexion »                                | ☐   |

## 2. Saisie d'un ordre de mission

| #    | Vérification                                        | Attendu                                                                  | OK  |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------ | --- |
| 2.1  | « Nouvel ordre de mission »                         | Formulaire en 3 sections, identité pré-remplie et verrouillée            | ☐   |
| 2.2  | Panneau latéral (sur ordinateur)                    | Aperçu du PDF qui se met à jour pendant la saisie                        | ☐   |
| 2.3  | Date de retour **avant** la date de départ          | « La date de retour doit être postérieure à la date de départ »          | ☐   |
| 2.4  | Date de départ à plus de 30 jours dans le passé     | Message de refus explicite                                               | ☐   |
| 2.5  | Date de départ à plus de 12 mois dans le futur      | Message de refus explicite                                               | ☐   |
| 2.6  | Choisir « Transport en commun »                     | Le champ « gasoil » disparaît, un encart explique pourquoi               | ☐   |
| 2.7  | Choisir « Véhicule de location » sans loueur        | « Le nom du loueur est obligatoire »                                     | ☐   |
| 2.8  | Choisir « Véhicule personnel » sans immatriculation | « L'immatriculation du véhicule est obligatoire »                        | ☐   |
| 2.9  | « Enregistrer comme brouillon »                     | Statut _Brouillon_, aucun numéro attribué                                | ☐   |
| 2.10 | Modifier puis réenregistrer le brouillon            | Modifications conservées                                                 | ☐   |
| 2.11 | Supprimer un brouillon                              | Confirmation demandée, puis suppression                                  | ☐   |
| 2.12 | Saisie complète depuis un téléphone                 | Faisable en **moins de 90 secondes**, sans zoom ni défilement horizontal | ☐   |
| 2.13 | Parcourir le formulaire au clavier uniquement       | Tous les champs et boutons atteignables, focus visible                   | ☐   |

## 3. Soumission

| #    | Vérification                | Attendu                                                                  | OK  |
| ---- | --------------------------- | ------------------------------------------------------------------------ | --- |
| 3.1  | « Soumettre aux RH »        | Numéro `OM-AAAA-NNNN` attribué, statut _En attente de validation_        | ☐   |
| 3.2  | Soumettre un second ordre   | Numéro incrémenté de 1, sans trou                                        | ☐   |
| 3.3  | Boîte `HR_EMAIL`            | Objet `[Ordre de mission OM-…] PRÉNOMS NOM — Lieu, du jj/MM au jj/MM`    | ☐   |
| 3.4  | Corps du message            | Récapitulatif complet, boutons **✓ Valider** vert et **✗ Refuser** rouge | ☐   |
| 3.5  | Pièce jointe                | `OM-AAAA-NNNN_NOM.pdf`                                                   | ☐   |
| 3.6  | Ouvrir le PDF               | **Une seule page**, superposable au formulaire papier                    | ☐   |
| 3.7  | Filigrane du PDF            | « EN ATTENTE DE VALIDATION » en gris                                     | ☐   |
| 3.8  | Pied de page du PDF         | Coordonnées, mention légale, bandeau bleu, QR code                       | ☐   |
| 3.9  | Scanner le QR code          | Page `/verify/OM-…` : statut, lieu, dates, sans donnée sensible          | ☐   |
| 3.10 | Annuler une demande soumise | Statut _Annulé_ ; les liens du mail deviennent sans effet                | ☐   |

## 4. Décision des Ressources Humaines

| #    | Vérification                                                              | Attendu                                                                         | OK  |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --- |
| 4.1  | Ouvrir « ✓ Valider » depuis un navigateur **déconnecté**                  | Récapitulatif affiché, **aucune décision enregistrée**                          | ☐   |
| 4.2  | Rafraîchir cette page plusieurs fois                                      | Toujours aucune décision : le GET est sans effet                                | ☐   |
| 4.3  | « Confirmer la validation »                                               | Confirmation « Ordre de mission OM-… validé »                                   | ☐   |
| 4.4  | Rouvrir le même lien                                                      | « Lien inutilisable — une décision a déjà été prise »                           | ☐   |
| 4.5  | Ouvrir le lien **Refuser** du même message                                | Également caduc (les deux jetons sont consommés ensemble)                       | ☐   |
| 4.6  | Boîte du demandeur                                                        | « Ordre de mission OM-… — validé », PDF validé joint                            | ☐   |
| 4.7  | PDF validé                                                                | Colonne _Ressources Humaines_ : « Validé électroniquement par … le … » + numéro | ☐   |
| 4.8  | Sur un autre ordre, ouvrir « ✗ Refuser » et saisir moins de 10 caractères | Refus bloqué, message explicite                                                 | ☐   |
| 4.9  | Saisir un motif complet et confirmer                                      | Statut _Refusé_                                                                 | ☐   |
| 4.10 | Boîte du demandeur                                                        | « — refusé », motif mis en évidence, **aucune** pièce jointe                    | ☐   |
| 4.11 | PDF de l'ordre refusé                                                     | Filigrane rouge **REFUSÉ** en diagonale, motif dans la colonne RH               | ☐   |

## 5. File d'attente RH

| #   | Vérification                                      | Attendu                                                           | OK  |
| --- | ------------------------------------------------- | ----------------------------------------------------------------- | --- |
| 5.1 | Se connecter en tant que `HR`                     | Le menu « File Ressources Humaines » apparaît                     | ☐   |
| 5.2 | Onglets de statut                                 | Compteurs cohérents avec le contenu                               | ☐   |
| 5.3 | Recherche par numéro, nom, matricule, objet, lieu | Résultats corrects                                                | ☐   |
| 5.4 | Filtres demandeur, lieu, période                  | Résultats corrects, filtres conservés dans l'URL                  | ☐   |
| 5.5 | Tri et pagination                                 | Fonctionnels, l'URL reste partageable                             | ☐   |
| 5.6 | Valider en ligne depuis la file                   | Statut mis à jour, e-mail envoyé au demandeur                     | ☐   |
| 5.7 | Refuser en ligne sans motif                       | Bloqué                                                            | ☐   |
| 5.8 | « Exporter en CSV »                               | Fichier ouvrable dans Excel : accents corrects, colonnes séparées | ☐   |

## 6. Administration

| #   | Vérification                                 | Attendu                                                          | OK  |
| --- | -------------------------------------------- | ---------------------------------------------------------------- | --- |
| 6.1 | Se connecter en tant que `ADMIN`             | Le menu « Collaborateurs » apparaît                              | ☐   |
| 6.2 | Créer un collaborateur                       | Il peut aussitôt demander un lien de connexion                   | ☐   |
| 6.3 | Créer un doublon d'e-mail ou de matricule    | Message d'erreur explicite                                       | ☐   |
| 6.4 | Désactiver un collaborateur                  | Il ne reçoit plus de lien de connexion                           | ☐   |
| 6.5 | Tenter de se désactiver soi-même             | Refusé                                                           | ☐   |
| 6.6 | Importer un CSV valide                       | Créations et mises à jour rapportées                             | ☐   |
| 6.7 | Importer un CSV contenant une ligne invalide | Lignes valides importées, ligne fautive signalée avec son numéro | ☐   |

## 7. Cloisonnement et sécurité

| #   | Vérification                                                            | Attendu                                                                                            | OK  |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --- |
| 7.1 | En tant que collaborateur A, ouvrir l'URL d'un ordre du collaborateur B | Page « introuvable » — indiscernable d'un ordre inexistant                                         | ☐   |
| 7.2 | Idem sur `/api/missions/{id}/pdf`                                       | 404                                                                                                | ☐   |
| 7.3 | En tant que collaborateur, ouvrir `/rh` puis `/admin/utilisateurs`      | Redirection vers le tableau de bord                                                                | ☐   |
| 7.4 | `/api/rh/export` sans session                                           | 403 en JSON                                                                                        | ☐   |
| 7.5 | En-têtes HTTP de la page d'accueil                                      | `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy` | ☐   |
| 7.6 | `/verify/OM-0000-0000`                                                  | « Ordre de mission inconnu »                                                                       | ☐   |

## 8. Langue et présentation

| #   | Vérification                | Attendu                                              | OK  |
| --- | --------------------------- | ---------------------------------------------------- | --- |
| 8.1 | Parcourir toute l'interface | Français intégral, aucun texte anglais résiduel      | ☐   |
| 8.2 | Lire les trois e-mails      | Français, responsive, couleurs Porteo                | ☐   |
| 8.3 | Lire le PDF                 | Français, accents corrects                           | ☐   |
| 8.4 | Dates affichées             | Heure d'Abidjan (UTC+0), format `jj/MM/aaaa à HHhmm` | ☐   |
| 8.5 | Listes vides                | Message explicite, jamais un écran blanc             | ☐   |
| 8.6 | Chargements                 | Squelettes visibles, jamais de saut de mise en page  | ☐   |

---

## Anomalies relevées

| #   | Écran | Description | Gravité |
| --- | ----- | ----------- | ------- |
|     |       |             |         |

**Recette effectuée par** ................................
**Date** .................. **Version déployée** ..................
