# OpenAlternance

Suivi de démarchages en alternance : entreprises, contacts, échanges, relances, lettres de motivation.
Dashboard Bun + Preact, à héberger chez soi (SQLite) ou en ligne (Vercel + Neon Postgres). Même code dans les deux cas.

> Captures d'écran : à venir.

## Choisir son mode

| | Local | En ligne |
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

## Commandes et clic droit

`Ctrl+K` (ou `Cmd+K`) : palette de commandes (pages, entreprises, actions). Flèches + Entrée.
Clic droit hors champ : menu d'actions de la page courante, `Actualiser` toujours présent.
Bouton réglages (en-tête) : coche les actions à garder dans le clic droit (choix stocké dans le navigateur).

## Lettres et documents

Les lettres de motivation et documents (CV, modèles de mail) sont stockés en base. `bun run cli sync-files`
pousse `lettres/*.md`, `lettres/*.pdf`, `data/cv.pdf` et `data/logo.png` ; `lettres/_template.md` sert de modèle.

## Documentation

- [Installation locale](docs/installation-locale.md)
- [Installation en ligne](docs/installation-en-ligne.md)
- [Architecture](ARCHITECTURE.md)
- [Décisions](docs/decisions/)

## Licence

MIT, voir [LICENSE](LICENSE).
