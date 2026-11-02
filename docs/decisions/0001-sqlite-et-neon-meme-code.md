# 0001 - SQLite et Neon avec le même code

## Contexte

L'application doit tourner en local sans compte externe (SQLite) et en ligne sur Vercel (Neon Postgres).

## Décision

Une seule base de code. L'adaptateur est choisi par le schéma de `DATABASE_URL` ; sans valeur, SQLite.
`Bun.SQL` couvre les deux. Le schéma est généré par dialecte dans `src/db.ts`, le reste du SQL est commun.

## Alternatives rejetées

- Deux dépôts : corrections à dupliquer, divergence assurée.
- Deux branches : mêmes problèmes, fusions permanentes.

## Conséquences

- Les calculs de temps sont faits en JS (ISO-8601 UTC), pas en SQL : les fonctions de date diffèrent entre dialectes.
- Pas de SQL spécifique à un dialecte hors du schéma.
- Les tests de l'API tournent sur SQLite en mémoire, sans Neon.
