# Installation en ligne (Vercel + Neon)

Mode Postgres : la base est chez Neon, l'application chez Vercel.

> Utilise une base Neon neuve. Une base issue de l'ancien tracker privé n'est pas compatible avec le schéma.

## 1. Neon

1. Créer un projet sur [neon.tech](https://neon.tech), région `eu-central` (Francfort).
2. Copier la chaîne de connexion **poolée** (hôte contenant `-pooler`) :
   `postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Créer une branche `dev` (menu Branches) pour tester sans toucher aux données réelles, avec sa propre chaîne de connexion.

TLS est forcé par l'application, quel que soit le `sslmode` de l'URL.

## 2. Vercel

1. Importer le dépôt sur [vercel.com](https://vercel.com).
2. Variables d'environnement :
   - `DATABASE_URL` : la chaîne Neon de la branche principale.
   - `OPENALTERNANCE_PASSWORD` : 16 caractères minimum, par exemple `openssl rand -base64 24`.
3. Déployer. `vercel.json` fournit la commande de build et les réécritures `/api/*`.

## 3. Initialiser la base (une fois, depuis ton poste)

```bash
DATABASE_URL='postgresql://...' bun run setup
```

Crée le schéma et ajoute les exemples si la base est vide. Les mises à jour de schéma suivantes passent
par la même commande (`bun run migrate` fait la migration seule).

## Liste de contrôle sécurité

- `vercel.json` pose déjà CSP, HSTS, `X-Frame-Options: DENY` et `nosniff`.
- Limite de débit : 10 connexions échouées par 15 minutes et par IP.
- Sessions de 30 jours stockées côté serveur ; la déconnexion les révoque.
- Ne jamais committer `.env` (ignoré par git).
- La protection de déploiement Vercel (mot de passe ou SSO devant l'application) est optionnelle, en plus du mot de passe applicatif.
- Sans `DATABASE_URL` Postgres, toutes les routes `/api` répondent 500 sur Vercel (SQLite n'y est pas supporté).
