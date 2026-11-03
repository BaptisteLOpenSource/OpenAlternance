---
title: Avec une IA (Claude Code)
description: Laisser Claude Code ou une autre IA installer OpenAlternance, lire tes candidatures, corriger tes lettres et mettre à jour les statuts.
---

Le dépôt contient un skill Claude Code : `.claude/skills/openalternance/SKILL.md`. Ouvre Claude Code
à la racine du dépôt, il le charge tout seul. Il passe par la [ligne de commande](/utilisation-cli/),
donc rien de plus à installer.

Exemples de demandes :

- « Liste mes entreprises avec une relance due. »
- « J'ai envoyé un mail à Acme SARL aujourd'hui, note-le. »
- « Passe Globex SAS en entretien le 20 octobre. »
- « Corrige l'orthographe de `lettres/lettre-acme-sarl.md` puis synchronise. »

Pas de serveur MCP pour l'instant : le skill et la CLI couvrent les mêmes actions.

## Prompts à copier

Copie un prompt (bouton en haut à droite du bloc) et colle-le dans ton IA.

### Installation développeur

```text
Installe OpenAlternance en local sur ma machine.
Dépôt : https://github.com/BaptisteLOpenSource/OpenAlternance
Guide : https://openalternance.baptisteledev.fr/installation-dev/
Étapes : vérifier que Bun est installé, cloner, bun install, copier .env.example en .env,
générer un OPENALTERNANCE_PASSWORD de 24 caractères, laisser DATABASE_URL vide,
bun run setup puis bun run serve. Donne-moi le mot de passe et l'URL à la fin.
Ne commite jamais .env.
```

### Installation en ligne (Vercel + Neon)

```text
Déploie OpenAlternance sur Vercel avec une base Postgres Neon.
Dépôt : https://github.com/BaptisteLOpenSource/OpenAlternance
Guide : https://openalternance.baptisteledev.fr/installation-en-ligne/
Étapes (même ordre que le guide) :
1. Neon : créer un projet région eu-central, récupérer la chaîne de connexion poolée (hôte -pooler).
2. Poste Windows : installer OpenAlternance-Setup.exe, mode « En ligne avec Neon », coller la chaîne.
   Le premier démarrage crée le schéma (pas de bun run setup).
3. Vercel : importer le dépôt, définir DATABASE_URL (même chaîne Neon) et
   OPENALTERNANCE_PASSWORD (24 caractères aléatoires) en production.
4. Déployer en production et me donner l'URL.
Demande-moi avant toute action payante ou sur un compte. N'écris aucun secret dans le dépôt.
```

### Corriger une lettre

```text
Dans le dépôt OpenAlternance, corrige lettres/<fichier>.md : orthographe, grammaire, ton professionnel.
Garde les faits, noms, dates et la structure. Montre-moi le diff, puis lance bun run cli sync-files.
```

### Mettre à jour mes candidatures

```text
Dans le dépôt OpenAlternance, lance bun run cli liste puis mets à jour avec la CLI :
<ex. mail envoyé à Acme SARL aujourd'hui, Globex SAS refusé, entretien chez Initech le 2026-11-10>.
Demande confirmation avant tout statut refuse.
```
