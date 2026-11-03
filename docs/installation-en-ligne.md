---
title: Installation en ligne
description: Une base Neon, l'app desktop pour créer le schéma, Vercel pour l'accès depuis le téléphone.
---

Mode en ligne : la base est chez Neon, l'application est sur Vercel. Tu la gardes accessible depuis tes PC et ton téléphone.

> Utilise une base Neon neuve. Une base issue de l'ancien tracker privé n'est pas compatible avec le schéma.

Ordre des étapes : Neon, puis l'app desktop (elle crée le schéma), puis Vercel, puis le téléphone.

## Neon

1. Créer un projet sur [neon.tech](https://neon.tech), région `eu-central` (Francfort).
2. Copier la chaîne de connexion **poolée** : dans la console, bouton **Connect**, option de pooling activée. L'hôte contient `-pooler` :
   `postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Doc officielle : [chaînes de connexion Neon](https://neon.com/docs/connect/connect-from-any-app) et [connection pooling](https://neon.com/docs/connect/connection-pooling).
3. Créer une branche `dev` (menu Branches) pour tester sans toucher aux données réelles, avec sa propre chaîne de connexion.

TLS est forcé par l'application, quel que soit le `sslmode` de l'URL.

## Installer l'app desktop

Suis [Installation desktop](/installation-desktop/) et choisis **En ligne avec Neon**, en collant la chaîne poolée.
Le premier démarrage crée le schéma et ajoute les exemples si la base est vide. Aucune ligne de commande n'est nécessaire.

Les mises à jour de schéma suivantes se font aussi au démarrage de l'app.

## Vercel

1. Importer le dépôt sur [vercel.com](https://vercel.com) : depuis le tableau de bord, **New Project**, connecter GitHub, choisir le dépôt, puis **Deploy**.
   Doc officielle : [déployer depuis le tableau de bord](https://vercel.com/docs/getting-started-with-vercel#deploy-from-the-dashboard).
2. Avant le premier déploiement, ajouter les variables d'environnement ([doc officielle](https://vercel.com/docs/environment-variables)) :
   - `DATABASE_URL` : la chaîne Neon poolée de la branche principale (la même que dans l'app desktop).
   - `OPENALTERNANCE_PASSWORD` : 16 caractères minimum, par exemple `openssl rand -base64 24`.
3. Déployer. `vercel.json` fournit la commande de build et les réécritures `/api/*`.

Sans `DATABASE_URL` Postgres, toutes les routes `/api` répondent 500 sur Vercel (SQLite n'y est pas supporté).

## Téléphone

1. Ouvrir l'URL Vercel de l'application dans le navigateur du téléphone.
2. Se connecter avec `OPENALTERNANCE_PASSWORD`.
3. Ajouter l'app à l'écran d'accueil : menu du navigateur, puis **Ajouter à l'écran d'accueil**.

## Changer ou réinitialiser le mot de passe

1. Dans Vercel, ouvrir le projet, puis **Settings > Environment Variables**, et modifier `OPENALTERNANCE_PASSWORD`.
2. Ouvrir l'onglet **Deployments**, cliquer sur le menu du dernier déploiement, puis **Redeploy**
   ([doc officielle](https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project)).
   Une modification de variable ne s'applique qu'aux nouveaux déploiements.
3. Toutes les sessions sont déconnectées : les sessions sont liées au mot de passe. Reconnecte-toi avec le nouveau mot de passe, sur chaque appareil.

## Liste de contrôle sécurité

- `vercel.json` pose déjà CSP, HSTS, `X-Frame-Options: DENY` et `nosniff`.
- Limite de débit : 10 connexions échouées par 15 minutes et par IP, basée sur l'en-tête `X-Forwarded-For` posé par Vercel (valable uniquement derrière Vercel).
- Mot de passe de 16 caractères minimum, imposé : sinon toutes les routes `/api` répondent 500.
- Sessions de 30 jours stockées côté serveur ; la déconnexion les révoque.
- Ne jamais committer `.env` (ignoré par git).
- La protection de déploiement Vercel (mot de passe ou SSO devant l'application) est optionnelle, en plus du mot de passe applicatif.
