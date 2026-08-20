# Environnement de démonstration

Ce dossier configure un conteneur de développement (GitHub Codespaces ou
VS Code Dev Containers) qui démarre l'application **sans aucune
infrastructure** : la base est un fichier SQLite local et les e-mails sont
déposés dans `.mailbox/` au lieu d'être envoyés.

## Au démarrage

| Étape    | Commande                         | Effet                                                |
| -------- | -------------------------------- | ---------------------------------------------------- |
| Création | `pnpm install --frozen-lockfile` | Dépendances                                          |
| Contenu  | `pnpm demo:setup`                | `.env` de démonstration, base SQLite, jeu de données |
| Attache  | `pnpm dev`                       | Serveur sur le port 3000, transféré automatiquement  |

`pnpm demo:setup` détecte l'URL publique du Codespace et la place dans
`AUTH_URL` et `APP_URL` : les liens des e-mails et le QR code du PDF pointent
donc vers la bonne adresse.

## Se connecter

L'application n'utilise pas de mot de passe. Saisissez l'une des adresses de
démonstration sur l'écran de connexion, puis récupérez le lien reçu depuis le
terminal :

```bash
pnpm lien connexion
```

| Adresse                           | Rôle                           |
| --------------------------------- | ------------------------------ |
| `schadrach.yeye@porteo-group.com` | Collaborateur (matricule 4071) |
| `rh@porteo-group.com`             | Ressources Humaines            |
| `admin@porteo-group.com`          | Administrateur                 |

Les liens de décision des Ressources Humaines se récupèrent de la même façon :

```bash
pnpm lien           # dernier message : objet, pièces jointes, liens
pnpm lien approve   # lien de validation
pnpm lien reject    # lien de refus
```

## Limites de ce mode

SQLite sert la démonstration et les tests ; **la production tourne sur Neon
Postgres**. Deux différences assumées :

- la recherche ne distingue pas les accents de la même façon ;
- les garanties de concurrence de la numérotation ne sont observables que sur
  PostgreSQL — les tests correspondants ne s'exécutent qu'avec `pnpm test:pg`.
