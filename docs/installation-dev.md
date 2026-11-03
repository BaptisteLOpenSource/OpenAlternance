---
title: Installation développeur
description: Cloner OpenAlternance, lancer le serveur web et l'app bureau depuis le code, lancer les tests.
---

Guide pour contribuer ou modifier le code. Pour simplement utiliser l'app, voir [Installation desktop](/installation-desktop/) (Windows) ou [Installation en ligne](/installation-en-ligne/).

## Prérequis

- [Bun](https://bun.sh) installé (`bun --version`).
- [Git](https://git-scm.com) et, pour le fork, la [CLI GitHub](https://cli.github.com) (`gh`) connectée à ton compte.

## Forker et cloner

Le dépôt n'accepte pas de push direct : travaille sur ton fork.

```bash
gh repo fork BaptisteLOpenSource/OpenAlternance --clone
cd OpenAlternance
git checkout dev
git checkout -b 12-mon-changement   # <numéro-issue>-<slug>, depuis dev
```

Sans `gh` : forke le dépôt depuis GitHub, puis `git clone https://github.com/<ton-compte>/OpenAlternance.git`
et crée la branche depuis `dev`. Ne travaille jamais sur `main`.

## Installer et lancer

```bash
bun install
bun run setup    # crée la base SQLite et ajoute des entreprises d'exemple
bun run serve    # serveur web : http://127.0.0.1:3000
```

`bun run setup` ne remplit les exemples que si la base est vide. Relancé plus tard, il ne fait que migrer.

Le mot de passe (`OPENALTERNANCE_PASSWORD`, 16 caractères minimum) est facultatif en local : sans lui,
l'authentification est désactivée. Pour le tester, copie `.env.example` en `.env` et renseigne-le.

L'app bureau se lance depuis le code avec :

```bash
bun run desktop  # fenêtre sur http://127.0.0.1:3737
```

Elle n'a pas besoin de `setup` : la base est créée au démarrage. Attention : elle lit la même
configuration et les mêmes données que l'app installée (`%APPDATA%\OpenAlternance\` et
`%LOCALAPPDATA%\OpenAlternance\`). Pour tester sans toucher à ta vraie base, supprime ou renomme
`config.json` avant de lancer, ou définis `OPENALTERNANCE_DESKTOP_PORT` pour éviter le conflit de port.

## Où sont les données

Par défaut `data/openalternance.db` (dossier créé automatiquement, ignoré par git).

Pour placer la base ailleurs, dans `.env` :

```
DATABASE_URL=sqlite:///media/usb/openalternance.db
```

Le chemin absolu suit `sqlite://` (d'où les trois `/`). Relance `bun run setup` après tout changement d'URL :
c'est une base différente.

## Tests et vérifications

```bash
bun test src          # tests unitaires et API (SQLite en mémoire)
bun run typecheck     # TypeScript
bun run test:e2e      # Playwright, API mockée
```

Avant d'ouvrir une pull request vers `dev`, lance au minimum `bun test src` et `bun run typecheck`.

## Construire l'app bureau

```bash
bun run build:desktop   # dist-desktop/OpenAlternance.exe (Windows)
```

L'installeur (`installer/openalternance.iss`, Inno Setup) est produit par la CI (`.github/workflows/release.yml`).
Voir [ADR 0002](https://github.com/BaptisteLOpenSource/OpenAlternance/blob/dev/docs/decisions/0002-desktop-bun-compile-inno.md).

## Sécurité

Le serveur écoute sur `127.0.0.1` uniquement. Limite de débit, sessions et mot de passe : voir la
[liste de contrôle sécurité](/installation-en-ligne/#liste-de-contrôle-sécurité).

Ne l'expose jamais sur `0.0.0.0` ni derrière un reverse proxy : la limite de débit se base sur l'adresse
du socket et le serveur refuse tout en-tête `Host` autre que `127.0.0.1:<port>` ou `localhost:<port>`.
