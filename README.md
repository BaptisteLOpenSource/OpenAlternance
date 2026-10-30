<h1 align="center">OpenAlternance 🎯</h1>

<p align="center">
  Suivi de démarchages en alternance : entreprises, contacts, échanges, relances, lettres de motivation.<br>
  À héberger chez soi (SQLite) ou en ligne (Vercel + Neon Postgres). Même code dans les deux cas.
</p>

<p align="center">
  <a href="https://github.com/BaptisteLOpenSource/OpenAlternance/actions/workflows/ci.yml"><img alt="Statut du CI" src="https://github.com/BaptisteLOpenSource/OpenAlternance/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-blue.svg"></a>
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-informational.svg">
  <a href="https://github.com/BaptisteLOpenSource/OpenAlternance/pulls"><img alt="Pull requests bienvenues" src="https://img.shields.io/badge/PR-bienvenues-brightgreen.svg"></a>
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Preact" src="https://img.shields.io/badge/preact-%23673AB8.svg?style=for-the-badge&logo=preact&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white">
  <img alt="Neon" src="https://img.shields.io/badge/Neon-%23139EF2.svg?style=for-the-badge&logo=neon&logoColor=white">
  <img alt="Vercel" src="https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/playwright-%232EAD33.svg?style=for-the-badge">
</p>

> Captures d'écran : à venir.

## Sommaire

- [Choisir son mode](#choisir-son-mode)
- [Démarrage rapide](#démarrage-rapide-local)
- [Fonctionnalités](#fonctionnalités)
- [Documentation](#documentation)
- [Contribuer](#contribuer)
- [Licence](#licence)

## Choisir son mode

| | 💻 Local | ☁️ En ligne |
|---|---|---|
| Base | fichier SQLite `data/openalternance.db` | Neon Postgres |
| Accès | `http://127.0.0.1:3000`, un seul poste | partout, via Vercel |
| Coût | aucun | offres gratuites Vercel et Neon suffisantes |
| Sauvegarde | copier le fichier `.db` | branches et sauvegardes Neon |
| Guide | [installation locale](docs/installation-locale.md) | [installation en ligne](docs/installation-en-ligne.md) |

## Démarrage rapide (local)

Prérequis : [Bun](https://bun.sh).

```bash
bun install
cp .env.example .env   # puis choisir OPENALTERNANCE_PASSWORD (16 caractères minimum)
bun run setup          # crée la base et ajoute des entreprises d'exemple
bun run serve          # -> http://127.0.0.1:3000
```

`bun run setup` ne remplit les exemples que si la base est vide.

## Fonctionnalités

### 🏢 Entreprises et échanges

Depuis le dashboard : ajouter une entreprise, un contact, un échange, changer un statut. En terminal :

```bash
bun run cli liste
bun run cli add "Acme SARL" --ville Lyon --site https://example.com
bun run cli personne "Acme SARL" --nom "Jane Doe" --role RH --email jane@example.com
bun run cli contact "Acme SARL" mail --note "CV envoyé"        # relance auto dans 7 j
bun run cli contact "Acme SARL" entretien --date 2026-10-20    # annule la relance
bun run cli statut "Acme SARL" refuse
bun test
```

- Types d'échange : `mail`, `appel`, `candidature`, `relance`, `entretien`, `reponse`, `depot` (CV déposé en physique, statut `contacte`).
- Statuts : `a_contacter`, `contacte`, `relance`, `entretien`, `offre`, `refuse`.
- `offre` et `refuse` figent le statut et suppriment la relance.

### ✅ Todo

Page `Todo` : relances dues (date <= aujourd'hui). Par ligne : `Relancé` (écrit un échange relance),
`Refusé` (statut refuse), `Sans réponse` (retire la relance, garde le statut).

Au chargement du dashboard, une relance datée d'avant aujourd'hui est ramenée à aujourd'hui et
`retard` s'incrémente du nombre de jours reportés (badge `+N j de retard`). Reset à chaque action.

### 📊 Tableur et entretiens

Page `Tableur` : une ligne par entreprise, mêmes colonnes que le tableau Excel. Bouton copier par ligne
et `Copier la vue` (lignes filtrées, colle dans Excel). Les colonnes CV, relance, entretien et réponse sont
calculées depuis les échanges. Les champs du tableau sont éditables dans la fiche entreprise.

Page `Entretiens` : échanges de type `entretien`, chacun lié à une entreprise. Séparés en `À venir` et `Passés`.

### ⌨️ Commandes et clic droit

- `Ctrl+K` (ou `Cmd+K`) : palette de commandes (pages, entreprises, actions). Flèches + Entrée.
- Clic droit hors champ : menu d'actions de la page courante, `Actualiser` toujours présent.
- Bouton réglages (en-tête) : coche les actions à garder dans le clic droit (choix stocké dans le navigateur).

### 📄 Lettres et documents

Les lettres de motivation et documents (CV, modèles de mail) sont stockés en base. `bun run cli sync-files`
pousse `lettres/*.md`, `lettres/*.pdf`, `data/cv.pdf` et `data/logo.png` ; `lettres/_template.md` sert de modèle.
Des exemples fictifs sont dans [`exemples/`](exemples/).

## Documentation

- [Installation locale](docs/installation-locale.md)
- [Installation en ligne](docs/installation-en-ligne.md)
- [Architecture](ARCHITECTURE.md)
- [Décisions](docs/decisions/)

## Contribuer

Les contributions sont bienvenues.

1. Forker le repo, créer une branche depuis `dev`.
2. Commits au format [Conventional Commits](https://www.conventionalcommits.org/fr/) : `type(scope): sujet`.
3. Vérifier `bun test` et `bun run typecheck`.
4. Ouvrir une pull request vers `dev`.

Bug ou idée : ouvrir une [issue](https://github.com/BaptisteLOpenSource/OpenAlternance/issues).

## Licence

[MIT](LICENSE) © 2026 [BaptisteLeDev](https://github.com/BaptisteLeDev) et les contributeurs d'OpenAlternance.

Libre de modifier, forker et redistribuer, à condition de conserver la mention de copyright et la licence.
