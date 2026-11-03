---
title: Utilisation en ligne de commande
description: Gérer entreprises, contacts, échanges, statuts et lettres d'OpenAlternance depuis le terminal avec bun run cli.
---

Toutes les commandes se lancent depuis la racine du dépôt. Elles écrivent dans la base pointée par
`DATABASE_URL` : vide = SQLite local, `postgresql://...` = Neon (mode en ligne).

## Lire

```bash
bun run cli liste
```

Affiche chaque entreprise avec ville, statut, contacts, dernier échange et prochaine relance.

## Entreprises et contacts

```bash
bun run cli add "Acme SARL" --ville Lyon --site https://example.com --notes "Startup SaaS"
bun run cli personne "Acme SARL" --nom "Jane Doe" --role RH --email jane@example.com --tel 0600000000
```

Le nom de l'entreprise doit être écrit exactement comme dans `liste`.

## Échanges

```bash
bun run cli contact "Acme SARL" mail --note "CV envoyé"
bun run cli contact "Acme SARL" appel --date 2026-10-15 --delai 3
bun run cli contact "Acme SARL" entretien --date 2026-10-20
```

| Type | Usage |
|---|---|
| `mail`, `appel`, `candidature`, `relance` | programme une relance dans 7 jours (`--delai` pour changer) |
| `entretien` | annule la relance |
| `reponse` | réponse reçue de l'entreprise |
| `depot` | CV déposé en physique, statut `contacte` |

## Statuts

```bash
bun run cli statut "Acme SARL" entretien
```

`a_contacter`, `contacte`, `relance`, `entretien`, `offre`, `refuse`. `offre` et `refuse` figent le
statut et suppriment la relance.

## Lettres et documents

```bash
bun run cli sync-files
```

Pousse `lettres/*.md`, `lettres/*.pdf`, `data/cv.pdf` et `data/logo.png` en base (écrase par nom de
fichier). `lettres/_template.md` sert de modèle. La synchro va des fichiers vers la base, pas l'inverse.

## Base en ligne depuis ton poste

```bash
DATABASE_URL='postgresql://...' bun run cli liste
```

Même commandes, appliquées à la base Neon.
