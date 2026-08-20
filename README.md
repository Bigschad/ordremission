# Ordres de mission — PORTEO GROUP

Dématérialisation des **ordres de mission en Côte d'Ivoire** de PORTEO GROUP.

Un collaborateur saisit sa demande en ligne ; l'application produit un PDF
visuellement fidèle au formulaire papier pré-imprimé et l'envoie par e-mail
aux Ressources Humaines, qui valident ou refusent **directement depuis leur
boîte mail**, sans avoir à se connecter.

L'ensemble tient dans les quotas gratuits de Vercel, Neon et Resend.

## Essayer l'application

[![Ouvrir dans GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Bigschad/ordremission/tree/claude/porteo-ordres-mission-i7jy6e?quickstart=1)

Un clic suffit : le Codespace installe les dépendances, crée une base **SQLite**
locale, charge un jeu de démonstration et démarre l'application sur le port
5000, qu'il transfère automatiquement. Ni Postgres, ni Resend, ni compte à
créer.

L'application n'utilise pas de mot de passe : saisissez une adresse de
démonstration sur l'écran de connexion, puis récupérez le lien reçu depuis le
terminal du Codespace avec `python -m scripts.lien connexion`.

| Adresse                           | Rôle                           |
| --------------------------------- | ------------------------------ |
| `schadrach.yeye@porteo-group.com` | Collaborateur (matricule 4071) |
| `rh@porteo-group.com`             | Ressources Humaines            |
| `admin@porteo-group.com`          | Administrateur                 |

Sur votre machine, la même démonstration se lance avec :

```bash
pip install -r requirements-dev.txt
python -m scripts.demo
```

![Ordre de mission en attente de validation, généré par l'application](docs/apercu-pdf.png)

Le document ci-dessus est généré par l'application. Un ordre refusé porte un
filigrane rouge et le motif du refus (`docs/apercu-pdf-refuse.png`) ; un ordre
validé porte la mention « Validé électroniquement » dans la colonne
_Ressources Humaines_. D'autres exemples sont dans `docs/pdf-exemples/`.

---

## Sommaire

0. [Essayer l'application](#essayer-lapplication)
1. [Fonctionnement](#fonctionnement)
2. [Pile technique](#pile-technique)
3. [Prérequis](#prérequis)
4. [Installation locale](#installation-locale)
5. [Création de la base Neon](#création-de-la-base-neon)
6. [Configuration de Resend](#configuration-de-resend)
7. [Variables d'environnement](#variables-denvironnement)
8. [Commandes](#commandes)
9. [Tests](#tests)
10. [Déploiement sur Vercel](#déploiement-sur-vercel)
11. [Limites de l'offre gratuite](#limites-de-loffre-gratuite)
12. [Architecture du code](#architecture-du-code)
13. [Décisions de conception](#décisions-de-conception)
14. [Recette](#recette)

---

## Fonctionnement

```
Collaborateur                    Application                  Ressources Humaines
     │                                │                                │
     │ saisit sa demande              │                                │
     ├───────────────────────────────►│                                │
     │                                │ attribue OM-2026-0001          │
     │                                │ émet 2 jetons à usage unique   │
     │                                │ produit le PDF                 │
     │                                ├───────────────────────────────►│
     │                                │   e-mail + PDF joint           │
     │                                │   ✓ Valider    ✗ Refuser       │
     │                                │                                │
     │                                │◄───────────────────────────────┤
     │                                │   décision (sans connexion)    │
     │◄───────────────────────────────┤                                │
     │  e-mail : validé (PDF joint)   │                                │
     │  ou refusé (motif)             │                                │
```

Le PDF porte un **QR code** renvoyant vers `/verify/{numero}` : n'importe qui —
un agent au poste de garde, par exemple — peut vérifier l'authenticité d'un
document présenté, sans accéder à la moindre donnée personnelle sensible.

### Statuts

| Statut      | Signification                          | Transitions possibles                   |
| ----------- | -------------------------------------- | --------------------------------------- |
| `DRAFT`     | Brouillon, non soumis, non numéroté    | modifier, supprimer, soumettre, annuler |
| `SUBMITTED` | Envoyé aux RH, en attente              | valider, refuser, annuler, renvoyer     |
| `APPROVED`  | Validé par les RH                      | — (terminal)                            |
| `REJECTED`  | Refusé, motif obligatoire              | — (terminal)                            |
| `CANCELLED` | Annulé par le demandeur avant décision | — (terminal)                            |

### Rôles

| Rôle       | Périmètre                                           |
| ---------- | --------------------------------------------------- |
| `EMPLOYEE` | Ses propres ordres de mission uniquement            |
| `HR`       | Vue globale, décisions, export CSV                  |
| `ADMIN`    | Idem `HR`, plus l'administration des collaborateurs |

---

## Pile technique

| Couche           | Choix                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Framework        | Flask 3.1 — gabarits Jinja2 rendus côté serveur                    |
| Interface        | HTML et CSS écrits à la main, sans framework ni build              |
| Formulaires      | HTML natif, validation partagée dans `app/domaine/validations.py`  |
| Protection CSRF  | Flask-WTF                                                          |
| ORM              | SQLAlchemy 2.0 (`Mapped[]`), migrations Alembic                    |
| Base             | Neon Postgres via psycopg 3 ; SQLite pour la démo et les tests     |
| Authentification | Lien magique par e-mail uniquement, aucun mot de passe             |
| E-mail           | API HTTP Resend (`httpx`), gabarits Jinja2                         |
| PDF              | ReportLab — Python pur, ni Puppeteer ni Chromium                   |
| QR code          | segno — Python pur, aucune dépendance système                      |
| Tests            | pytest (unitaires et HTTP) et Playwright (bout en bout)            |
| Qualité          | ruff (lint et format), mypy en mode `strict`                       |
| Fuseau           | `Africa/Abidjan` — stockage en UTC, affichage en heure locale      |
| Langue           | Français intégral : interface, e-mails, PDF, messages d'erreur     |

**Aucune dépendance système** : tout s'installe avec `pip`, ce qui est la
condition pour tenir dans les 250 Mo d'une fonction serverless Vercel.

---

## Prérequis

- **Python 3.11 ou supérieur** (`python --version`)
- Un compte **Neon** (offre gratuite) pour la base de données
- Un compte **Resend** (offre gratuite) pour l'envoi d'e-mails
- Un compte **Vercel** (offre Hobby) pour l'hébergement

Pour un simple essai, **rien de tout cela n'est nécessaire** :
`python -m scripts.demo` utilise SQLite et écrit les e-mails sur disque.

---

## Installation locale

### Démonstration, sans infrastructure

```bash
git clone <url-du-dépôt> ordremission
cd ordremission

python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

python -m scripts.demo        # .env, base SQLite, jeu de démonstration, serveur
```

`scripts/demo.py` génère un `.env` avec une base SQLite (`demo.db`) et le
transport e-mail sur disque. Rien n'est installé en dehors du projet.

### Développement sur PostgreSQL

C'est la configuration de production ; à privilégier dès que l'on touche aux
requêtes ou aux migrations.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(32))"   # → SECRET_KEY

createdb ordremission
alembic upgrade head          # applique les migrations
python -m scripts.seed        # jeu de données de démonstration
flask --app wsgi:app run      # http://localhost:5000
```

Quatre variables suffisent — Resend n'est pas nécessaire en local :

```dotenv
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/ordremission"
SECRET_KEY="<sortie de la commande ci-dessus>"
EMAIL_TRANSPORT="fichier"
APP_URL="http://localhost:5000"
```

### Se connecter en local sans envoyer de vrais e-mails

Avec `EMAIL_TRANSPORT="fichier"`, les messages sont écrits dans `.mailbox/` au
lieu d'être envoyés. `scripts/lien.py` en extrait les liens :

```bash
python -m scripts.lien              # dernier message : destinataires, objet, pièces jointes, liens
python -m scripts.lien connexion    # dernier lien de connexion, seul
python -m scripts.lien approve      # dernier lien de validation RH
python -m scripts.lien reject       # dernier lien de refus RH
```

Le PDF joint n'est pas écrit sur disque par ce transport ; pour l'examiner,
téléchargez-le depuis l'écran de détail ou lancez `python -m scripts.exemples_pdf`.

Comptes du jeu de démonstration :

| Adresse                           | Rôle                           |
| --------------------------------- | ------------------------------ |
| `schadrach.yeye@porteo-group.com` | Collaborateur (matricule 4071) |
| `rh@porteo-group.com`             | Ressources Humaines            |
| `admin@porteo-group.com`          | Administrateur                 |

---

## Création de la base Neon

1. Créer un projet sur [neon.tech](https://neon.tech), région **Europe
   (Frankfurt)** ou **AWS eu-central-1** — la plus proche d'Abidjan parmi
   celles de l'offre gratuite.
2. Récupérer la chaîne de connexion **pooled** (l'hôte contient `-pooler`)
   dans l'onglet _Connection Details_ → `DATABASE_URL`.
3. Conserver `?sslmode=require` à la fin de la chaîne.
4. Appliquer le schéma :

```bash
alembic upgrade head       # migrations
python -m scripts.seed     # facultatif : jeu de démonstration
```

> La chaîne peut être fournie sous la forme `postgres://` ou `postgresql://` :
> `app/config.py` la ramène à `postgresql+psycopg://`, requis par SQLAlchemy
> pour utiliser le pilote psycopg 3.

> Neon met les projets gratuits en veille après quelques minutes d'inactivité.
> La première requête après une mise en veille prend une à deux secondes.

---

## Configuration de Resend

1. Créer un compte sur [resend.com](https://resend.com) et générer une clé
   d'API (`RESEND_API_KEY`).
2. Ajouter le domaine **porteo-group.com** dans _Domains_.
3. Créer chez le registrar les enregistrements DNS indiqués par Resend :

   | Type  | Nom                                  | Valeur                                                     | Rôle                            |
   | ----- | ------------------------------------ | ---------------------------------------------------------- | ------------------------------- |
   | `TXT` | `send.porteo-group.com`              | `v=spf1 include:amazonses.com ~all`                        | SPF — autorise Resend à émettre |
   | `TXT` | `resend._domainkey.porteo-group.com` | clé publique fournie par Resend                            | DKIM — signature des messages   |
   | `MX`  | `send.porteo-group.com`              | `feedback-smtp.<région>.amazonses.com` (priorité 10)       | retours et plaintes             |
   | `TXT` | `_dmarc.porteo-group.com`            | `v=DMARC1; p=none; rua=mailto:postmaster@porteo-group.com` | DMARC — recommandé              |

   Les valeurs exactes sont affichées dans l'interface Resend : **les recopier
   telles quelles**, elles varient d'un domaine à l'autre.

4. Attendre la vérification (quelques minutes à quelques heures selon le
   registrar), puis renseigner :

```
EMAIL_FROM="Ordres de mission Porteo <om@porteo-group.com>"
HR_EMAIL="rh@porteo-group.com,rh2@porteo-group.com"
```

`HR_EMAIL` accepte plusieurs adresses séparées par des virgules.

> Sans vérification DNS, Resend n'autorise l'envoi que vers l'adresse du
> propriétaire du compte : les e-mails aux RH n'arriveront pas.

---

## Variables d'environnement

Toutes sont documentées dans [`.env.example`](.env.example).

| Variable          | Rôle                                                          | Obligatoire |
| ----------------- | ------------------------------------------------------------- | ----------- |
| `DATABASE_URL`    | Chaîne Neon _pooled_, ou `sqlite:///…` pour la démonstration  | oui         |
| `SECRET_KEY`      | Signe le cookie de session et les jetons CSRF                 | oui         |
| `APP_URL`         | URL publique, utilisée dans les liens et le QR code           | oui         |
| `RESEND_API_KEY`  | Clé d'API Resend                                              | oui         |
| `EMAIL_FROM`      | Expéditeur des e-mails                                        | non         |
| `HR_EMAIL`        | Destinataires RH, séparés par des virgules                    | non         |
| `APP_NAME`        | Titre affiché dans l'interface                                | non         |
| `EMAIL_TRANSPORT` | `fichier` écrit les e-mails sur disque — **tests uniquement** | non         |
| `FLASK_DEBUG`     | `1` active le rechargement des gabarits                       | non         |

Aucun secret n'est présent dans le code ; `.env*` est exclu du dépôt.

---

## Commandes

| Commande                          | Effet                                              |
| --------------------------------- | -------------------------------------------------- |
| `flask --app wsgi:app run`        | Serveur de développement                           |
| `gunicorn wsgi:app`               | Serveur de production hors Vercel                  |
| `ruff check .`                    | Lint                                               |
| `ruff format .`                   | Formatage                                          |
| `mypy app scripts wsgi.py tests`  | Typage strict                                      |
| `pytest`                          | Tests unitaires et HTTP (SQLite)                   |
| `pytest --cov=app`                | Idem, avec couverture — seuil 80 % sur `app/`      |
| `pytest e2e`                      | Tests de bout en bout (Playwright)                 |
| `alembic upgrade head`            | Applique les migrations                            |
| `alembic revision --autogenerate` | Crée une migration à partir du modèle              |
| `python -m scripts.seed`          | Jeu de données de démonstration                    |
| `python -m scripts.demo`          | Démonstration complète sur SQLite                  |
| `python -m scripts.lien`          | Liens contenus dans les e-mails du transport test  |
| `python -m scripts.exemples_pdf`  | Régénère `docs/pdf-exemples/` et les aperçus PNG   |

---

## Tests

### Unitaires et HTTP — pytest

```bash
pytest              # SQLite temporaire — aucune infrastructure
pytest --cov=app    # avec couverture
```

La campagne s'exécute par défaut sur une base **SQLite** créée dans un dossier
temporaire et détruite à la fin. Les tables métier sont vidées entre chaque
test. Rien à installer, rien à nettoyer.

```bash
createdb om_test
TEST_DATABASE_URL="postgresql://om:om@localhost:5432/om_test" pytest
```

La même campagne rejouée sur PostgreSQL, **la seule configuration qui valide
les garanties de concurrence de la numérotation** : SQLite n'admet qu'un seul
écrivain, la question ne s'y pose pas. Le test concerné est marqué `postgres`
et explicitement ignoré en mode SQLite, jamais supprimé — la sortie de
`pytest` indique alors « 1 skipped ».

Sont couverts :

- l'attribution des numéros, dont un test de concurrence sur **50 soumissions
  simultanées** — aucune collision, aucun trou dans la séquence ;
- chaque règle métier de validation, cas passant et cas bloquant ;
- le cycle de vie des jetons : usage unique, expiration, invalidation croisée,
  et absence d'effet de bord à la simple consultation ;
- les **35 combinaisons** statut × transition de la machine à états ;
- le contrôle d'accès des requêtes, les décisions concurrentes, la limitation
  de débit, le journal d'audit, l'export et l'import CSV ;
- le transport e-mail, y compris une clé absente, une erreur HTTP de Resend et
  un service injoignable — aucun de ces cas ne doit lever ;
- la non-régression du PDF : une seule page, numéro présent, libellés du
  formulaire papier dans l'ordre attendu ;
- les cinq scénarios du cahier des charges rejoués à travers les vraies routes
  HTTP (`tests/test_parcours.py`).

### Bout en bout — Playwright

```bash
playwright install chromium    # première fois
pytest e2e
```

La campagne démarre elle-même le serveur sur un port libre, sur SQLite et avec
`EMAIL_TRANSPORT=fichier` : les e-mails — donc les liens de connexion et de
décision — sont lus depuis le disque, sans service externe. Les décisions RH
sont prises dans un **contexte de navigation distinct**, sans session
applicative, exactement comme depuis une boîte mail.

Scénarios : connexion par lien magique ; lien de connexion à usage unique ;
brouillon → modification → soumission → e-mail RH ; saisie invalide sans perte
de données ; validation depuis la boîte mail sans connexion ; refus sans puis
avec motif ; rejeu d'un lien déjà consommé ; cloisonnement des rôles.

> Sur un environnement fournissant déjà un Chromium (conteneur de CI),
> `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/chemin/vers/chrome pytest e2e` évite un
> second téléchargement.

---

## Déploiement sur Vercel

1. **Importer le dépôt** sur Vercel. Le runtime Python est détecté grâce à
   [`api/index.py`](api/index.py) ; [`vercel.json`](vercel.json) dirige toutes
   les routes vers cette unique fonction et fixe la région **`cdg1` (Paris)**,
   la plus proche d'Abidjan parmi celles de l'offre Hobby.

2. **Renseigner les variables d'environnement** (section _Settings →
   Environment Variables_) pour les environnements _Production_ et _Preview_ :

   ```
   DATABASE_URL, SECRET_KEY, APP_URL, RESEND_API_KEY, EMAIL_FROM,
   HR_EMAIL, APP_NAME
   ```

   `APP_URL` doit porter l'URL **définitive** : c'est elle qui construit les
   liens des e-mails et le QR code du PDF.

3. **Migrations.** Le déploiement Vercel n'exécute pas de commande de build
   côté base : appliquer les migrations depuis un poste avant de déployer un
   changement de schéma.

   ```bash
   DATABASE_URL="<chaîne Neon>" alembic upgrade head
   ```

4. **Vérifier le parcours complet en production** en suivant la
   [checklist de recette](docs/recette.md).

> **Ne jamais activer `EMAIL_TRANSPORT=fichier` en production** : les e-mails
> seraient écrits sur un disque éphémère au lieu d'être envoyés.

---

## Limites de l'offre gratuite

L'application est conçue pour rester dans les quotas gratuits. Les points de
vigilance, et ce qui a été fait pour les respecter :

### Vercel Hobby

| Quota                             | Situation                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 100 Go de bande passante par mois | Largement suffisant : une feuille de style unique, un seul script de 2 ko, aucun média lourd, aucun bundle JavaScript.                                                          |
| 10 s d'exécution par fonction     | `maxDuration: 10` déclaré dans `vercel.json`. Un PDF se rend en quelques dizaines de millisecondes.                                                                            |
| 250 Mo décompressés par fonction  | Flask, SQLAlchemy, psycopg, ReportLab et segno pèsent **≈ 40 Mo**. C'est la raison du choix de ReportLab : Puppeteer, `@sparticuz/chromium` ou WeasyPrint dépassent la limite. |
| 1 cron par jour maximum           | Aucun cron. La purge de la limitation de débit est déclenchée de façon opportuniste depuis les requêtes protégées.                                                             |
| Pas de stockage de fichiers       | Aucun PDF n'est stocké : chaque document est régénéré à la demande, avec un cache mémoire de 60 secondes qui absorbe les rafales.                                              |

### Neon (offre gratuite)

- **0,5 Go de stockage** : un ordre de mission pèse quelques centaines
  d'octets ; le journal d'audit est la table qui croît le plus vite.
- **Mise en veille automatique** : la première requête après une période
  d'inactivité prend une à deux secondes.
- **Connexions** : le moteur SQLAlchemy est configuré avec `NullPool` et
  `pool_pre_ping`. En serverless, une fonction ne survit pas d'une invocation à
  l'autre : maintenir un pool TCP épuiserait le quota de connexions de Neon.
- Purge conseillée du journal d'audit au-delà de deux ans d'exploitation.

### Resend (offre gratuite)

- **100 e-mails par jour**, 3 000 par mois. Une soumission consomme
  1 message (RH) + 1 message (décision) + 1 message (connexion), soit environ
  3 messages par ordre de mission traité.
- Au-delà, l'envoi échoue : l'ordre de mission reste `SUBMITTED`, l'échec est
  journalisé dans `AuditLog` et le demandeur dispose du bouton
  « Renvoyer aux RH » (3 relances maximum).

### Ce qui a été volontairement écarté

Puppeteer, `@sparticuz/chromium`, WeasyPrint, S3, Docker, Redis, Celery, tout
service payant, et tout cron plus fréquent qu'une exécution quotidienne.

---

## Architecture du code

```
api/index.py             point d'entrée serverless (Vercel)
wsgi.py                  point d'entrée WSGI classique (gunicorn)
app/
  __init__.py            fabrique Flask : session par requête, en-têtes, filtres
  config.py              configuration lue depuis l'environnement
  db.py                  moteur, sessions, différences de dialecte
  models.py              modèle SQLAlchemy
  domaine/               règles métier, sans dépendance à Flask
    validations.py       validation partagée formulaire / serveur
    numerotation.py      séquence annuelle OM-AAAA-NNNN
    statuts.py           machine à états (table de transitions)
    jetons.py            jetons d'approbation à usage unique
    decision.py          validation et refus, sous concurrence
    missions.py          brouillon, soumission, annulation, relance
    connexion.py         liens magiques
    requetes.py          lecture filtrée selon le rôle
    limitation.py        limitation de débit en base
    audit.py             journal
    utilisateurs.py      administration et import CSV
  pdf/                   document ReportLab, projection, cache
  emails/                transport, gabarits Jinja2, notifications
  web/                   routes Flask, contrôle d'accès
  templates/             gabarits Jinja2
  static/                feuille de style, script d'aperçu, favicon
migrations/              migrations Alembic
scripts/                 seed, démonstration, liens, exemples PDF
tests/                   pytest — unitaires et parcours HTTP
e2e/                     pytest + Playwright — bout en bout
docs/                    recette, exemples de PDF
```

### Points d'attention pour la maintenance

- **La validation est partagée** : `app/domaine/validations.py` sert au rendu
  du formulaire _et_ à l'enregistrement. Un message d'erreur affiché à l'écran
  est exactement celui que produirait le serveur.
- **Le domaine ne connaît ni Flask ni la requête HTTP.** Chaque opération y
  renvoie un résultat typé (`Issue`, `Resultat`, `Resolution`) plutôt que de
  lever : les règles métier se testent sans serveur.
- **L'autorisation est toujours vérifiée côté serveur**, dans les requêtes
  elles-mêmes (`app/domaine/requetes.py`) et non dans les gabarits ; le rôle et
  le statut « actif » sont relus en base à chaque requête. Masquer un lien
  n'est jamais une mesure de sécurité.
- **L'aperçu et le PDF définitif partagent le même code de rendu** : ils ne
  peuvent pas diverger.

---

## Décisions de conception

**ReportLab plutôt qu'un rendu HTML.** Le PDF doit être superposable au
formulaire papier : le positionnement absolu au point près est ici un avantage,
pas une contrainte. ReportLab est du Python pur, sans bibliothèque système —
ce que WeasyPrint (Cairo, Pango) et Puppeteer (Chromium) ne permettent pas dans
une fonction serverless de 250 Mo.

**Numéro provisoire des brouillons.** Le cahier des charges impose `numero` non
nul et unique, tout en n'attribuant le numéro définitif qu'à la soumission. Un
brouillon porte donc un numéro provisoire `BROUILLON-…`, remplacé par
`OM-AAAA-NNNN` lors de la soumission. Ni l'interface ni le PDF n'affichent
jamais un numéro provisoire : ils indiquent « Brouillon (non numéroté) ».

**Numérotation sous concurrence.** La séquence annuelle est portée par la table
`Counter`, dont la ligne est verrouillée par un `SELECT … FOR UPDATE` sur
PostgreSQL. Numéro et passage à `SUBMITTED` sont dans la même transaction :
aucun numéro n'est consommé par une soumission qui échoue. Un test rejoue
50 soumissions simultanées et vérifie l'absence de collision comme de trou.

**Horodatages toujours conscients du fuseau.** PostgreSQL conserve le fuseau,
SQLite non. Un `TypeDecorator` (`UtcDateTime`, dans `app/models.py`) normalise
donc toute date en UTC à l'écriture comme à la lecture : le code métier ne
manipule jamais de date naïve, quel que soit le moteur.

**Identité du valideur.** Les RH décident depuis leur boîte mail, sans se
connecter : l'application enregistre alors le service comme valideur
(« Ressources Humaines — PORTEO GROUP »). Si la personne est malgré tout
authentifiée — décision prise depuis l'écran `/rh/` —, son identité nominative
est retenue et imprimée sur le PDF.

**Aucun effet de bord sur un GET.** Les scanners d'e-mails préchargent les
liens : afficher `/approve/{jeton}` ne consomme donc jamais le jeton. La
décision passe par un POST explicite, protégé par un jeton CSRF.

**Décision atomique.** L'enregistrement d'une décision est un
`UPDATE … WHERE statut = 'SUBMITTED'` dont on vérifie le nombre de lignes
touchées : deux gestionnaires qui cliquent en même temps ne peuvent pas
produire deux décisions contradictoires.

**Seule l'empreinte des jetons est stockée.** Les jetons d'approbation et de
connexion font 32 octets aléatoires ; la base ne conserve que leur SHA-256.
Une fuite de la base ne permet donc pas de valider un ordre de mission.

**Les brouillons sont visibles des RH.** L'écran `/rh/` affiche « tous les
OM », conformément à la section 7 du cahier des charges, statut `DRAFT`
compris. Si la confidentialité des brouillons est souhaitée, le filtre se pose
dans `app/domaine/requetes.py` — un seul point à modifier.

**Périmètre v2.** Ni per diem, ni frais de mission, ni validation N+1 ou
Directeur, ni pointage sécurité. La machine à états
(`app/domaine/statuts.py`) est une table de transitions : intercaler une étape
« Supérieur hiérarchique » entre `SUBMITTED` et `APPROVED` consistera à y
ajouter des lignes, sans toucher aux appelants. Les colonnes de signature du
PDF sont déjà en place.

---

## Recette

La checklist de recette est dans [`docs/recette.md`](docs/recette.md).
