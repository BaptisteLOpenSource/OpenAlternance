# Architecture

## Couches

| Fichier | Rôle |
|---|---|
| `src/logic.ts` | domaine pur : dates de relance, transitions de statut. Aucune I/O. |
| `src/db.ts`, `src/repo.ts` | infrastructure : connexion, schéma, requêtes. |
| `src/api.ts` | routes `/api/*`, authentification, limitation de débit. Appelée par `src/server.ts` (local) et `api/index.ts` (Vercel). |
| `src/cli.ts`, `src/setup.ts` | terminal : commandes, migration, données d'exemple. |
| `src/web/store.ts` | seule provenance des données pour l'interface. Les vues lisent le store, jamais `fetch`. |

Sens des dépendances : web -> api -> repo -> db ; `logic.ts` ne dépend de rien.

## Deux bases, un code

`DATABASE_URL` choisit l'adaptateur (`resolveDb` dans `src/db.ts`) : `postgres://` ou `postgresql://`
-> Neon, sinon SQLite (défaut `sqlite://data/openalternance.db`). Voir [ADR 0001](docs/decisions/0001-sqlite-et-neon-meme-code.md).

Règle : aucun SQL propre à un dialecte hors du schéma de `src/db.ts`. Les requêtes de `repo.ts` et `api.ts`
sont portables. Les calculs de temps se font en JS (horodatages ISO-8601 UTC écrits et comparés depuis JS),
jamais avec l'horloge de la base.

## Authentification

Mot de passe unique (`OPENALTERNANCE_PASSWORD`), sessions en table, identiques dans les deux modes.
