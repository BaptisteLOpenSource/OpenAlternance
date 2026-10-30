# Alternance tracker

Suivi de mes démarchages en alternance : entreprises, contacts, échanges, relances, lettres.
Dashboard Bun + Preact déployé sur Vercel. Données dans Neon Postgres, seule source de vérité.

## Installation

Prérequis : [Bun](https://bun.sh), `.env` avec `DATABASE_URL` (Neon) et `OPENALTERNANCE_PASSWORD`.

```bash
bun install
```

## Lancer

```bash
bun run serve                 # -> http://127.0.0.1:3000
bun run cli liste             # même données, en terminal
bun test
```

Depuis le dashboard : ajouter une entreprise, un contact, un échange, changer un statut.
Chaque écriture va directement dans Neon.

En CLI :

```bash
bun run cli add "Acme SARL" --ville Lyon --site https://acme.test
bun run cli personne "Acme SARL" --nom "Jane Doe" --role RH --email jane@acme.test
bun run cli contact "Acme SARL" mail --note "CV envoyé"        # relance auto dans 7 j
bun run cli contact "Acme SARL" entretien --date 2026-10-20    # annule la relance
bun run cli statut "Acme SARL" refuse
```

Types d'échange : `mail`, `appel`, `candidature`, `relance`, `entretien`, `reponse`, `depot` (CV déposé en physique, statut `contacte`).
Statuts : `a_contacter`, `contacte`, `relance`, `entretien`, `offre`, `refuse`.
`offre` et `refuse` figent le statut et suppriment la relance.

## Todo

Page `Todo` : relances dues (date <= aujourd'hui). Par ligne : `Relancé` (écrit un échange relance),
`Refusé` (statut refuse), `Sans réponse` (retire la relance, garde le statut).
Au chargement du dashboard, une relance datée d'avant aujourd'hui est ramenée à aujourd'hui et
`retard` s'incrémente du nombre de jours reportés (badge `+N j de retard`). Reset à chaque action.

## Tableur et entretiens

Page `Tableur` : une ligne par entreprise, mêmes colonnes que le tableau Excel. Bouton copier par ligne
et `Copier la vue` (lignes filtrées, colle dans Excel). Les colonnes CV, relance, entretien et réponse sont calculées depuis
les échanges. Les champs du tableau sont éditables dans la fiche entreprise.

Page `Entretiens` : échanges de type `entretien`, chacun lié à une entreprise. Séparés en `À venir` et `Passés`.
`bun run migrate` ajoute les nouvelles colonnes du schéma.

## Commandes et clic droit

`Ctrl+K` (ou `Cmd+K`) : palette de commandes (pages, entreprises, actions). Flèches + Entrée.
Clic droit hors champ : menu d'actions de la page courante, `Actualiser` toujours présent.
Bouton réglages (en-tête) : coche les actions à garder dans le clic droit (choix stocké dans le navigateur).

## Données

Neon Postgres est la seule source de vérité : entreprises, contacts, échanges, lettres et PDF.
Pas d'export local. `bun run migrate` crée le schéma, `bun run cli sync-files` pousse
`lettres/*.md`, `lettres/*.pdf`, `data/cv.pdf` et `data/logo.png` en base.

## Lettres de motivation

Dossier `lettres/` versionné, un fichier `.md` par entreprise (ex. `lettres/acme-sarl.md`).
Ouvrable directement comme vault Obsidian. `.obsidian/` est ignoré (config locale).

## Structure

- `src/logic.ts` : règles métier pures (dates de relance, transitions de statut)
- `src/db.ts` : connexion Neon + schéma
- `src/repo.ts` : requêtes
- `api/index.ts` : fonction Vercel, toutes les routes `/api/*` y sont réécrites (`vercel.json`)
- `src/web/` : dashboard Preact + Tailwind (composants shadcn dans `ui.tsx`, appels API dans `store.ts`)
- `src/server.ts` : serveur Bun (bundle du dashboard + API JSON)
- `src/cli.ts` : commandes terminal
