# Installation locale

Mode SQLite : tout tourne sur ta machine, aucune base distante.

## Prérequis

[Bun](https://bun.sh) installé (`bun --version`).

## Étapes

```bash
git clone <url-du-depot> openalternance
cd openalternance
bun install
cp .env.example .env
```

Édite `.env` et remplace `OPENALTERNANCE_PASSWORD` par un mot de passe de 16 caractères minimum.
Laisse `DATABASE_URL` vide.

```bash
bun run setup   # à lancer depuis la racine du dépôt
bun run serve
```

Ouvre `http://127.0.0.1:3000` et connecte-toi avec le mot de passe.

`bun run setup` crée le schéma puis, uniquement si aucune entreprise n'existe, ajoute les exemples
(Acme SARL, Globex SAS, Initech, lettres et documents). Il ne touche jamais aux lettres existantes.
Relancé plus tard, il ne fait que migrer.

## Où sont les données

Par défaut `data/openalternance.db` (dossier créé automatiquement, ignoré par git).

Sauvegarde : arrêter le serveur, copier `data/openalternance.db`.

Pour placer la base ailleurs (clé USB, disque externe), dans `.env` :

```
DATABASE_URL=sqlite:///media/usb/openalternance.db
```

Le chemin absolu suit `sqlite://` (d'où les trois `/`). Le dossier parent est créé si besoin.
Relance `bun run setup` après tout changement d'URL : c'est une base différente.

## Sécurité

Le serveur écoute sur `127.0.0.1` uniquement. Le mot de passe reste demandé : 10 échecs en 15 minutes
bloquent l'IP, les sessions durent 30 jours.
