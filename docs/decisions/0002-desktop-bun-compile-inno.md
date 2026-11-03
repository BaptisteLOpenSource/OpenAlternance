# 0002 - Desktop Windows : Bun compile et Inno Setup

## Contexte

Les utilisateurs non développeurs doivent installer OpenAlternance sur Windows sans Bun, sans terminal et sans compte.
Le même code doit servir le mode local (SQLite) et le mode en ligne (Neon). Le projet n'accepte pas de nouvelle dépendance npm sans raison claire.

## Décision

- Le point d'entrée `src/desktop/main.ts` est compilé en un seul `OpenAlternance.exe` avec `bun build --compile` (`scripts/build-desktop.ts`).
  L'exe embarque l'interface web et sert la même API que `bun run serve`, sur `127.0.0.1:3737`, dans une fenêtre Edge en mode app (navigateur par défaut en repli).
- Inno Setup empaquette l'exe (`installer/openalternance.iss`). Installation pour l'utilisateur courant, sans droits administrateur.
  Inno Setup est un outil de build seul, lancé par la CI : il n'entre dans aucun `package.json`.
- Mode en ligne : l'URL Neon est saisie dans l'installeur, écrite dans `%APPDATA%\OpenAlternance\config.json`, puis
  chiffrée au premier démarrage avec DPAPI (`ConvertFrom-SecureString`, portée utilisateur Windows). Le texte clair disparaît du fichier.
- Pas de mot de passe en desktop. Le serveur n'écoute que sur `127.0.0.1` et refuse les `Host` inconnus. Les écritures exigent une `Origin` identique.
- Mises à jour : l'app interroge l'API GitHub des releases et n'accepte que l'URL exacte de `OpenAlternance-Setup.exe` sur `github.com`.

## Alternatives rejetées

- Electron : embarque un Chromium complet et un second runtime Node à côté de Bun. Le serveur existant devrait être réécrit ou porté.
- Tauri : impose une couche Rust (hôte et commandes) en plus du code TypeScript, pour un seul écran et un serveur local déjà écrit.
- Mot de passe local obligatoire : un PC mono-utilisateur n'a pas de menace à couvrir, et le mot de passe bloquerait le premier lancement sans gain.
- Stocker l'URL Neon en clair : elle donne accès à toute la base ; DPAPI la lie au compte Windows sans demander de saisie supplémentaire.

## Conséquences

- Le binaire n'est pas signé : SmartScreen affiche un avertissement au premier lancement (voir le guide desktop).
- Sur un PC partagé, toute session ouverte sur le même poste peut lire `127.0.0.1:3737` pendant que l'app tourne. Plafond accepté, documenté dans le guide desktop.
  Atténuation : arrêt automatique après 60 minutes sans requête.
- DPAPI ne protège que contre une lecture hors du compte Windows. Un malware tournant sous ce compte peut déchiffrer l'URL.
- La clé Neon reste en mémoire du processus pendant l'exécution ; l'URL en clair n'est jamais réécrite dans `config.json` après migration.
- Les données locales ne sont pas chiffrées au repos (`openalternance.db`). La désinstallation propose de les supprimer.
- Toute évolution du format de `config.json` doit rester compatible avec l'installeur (`ConfigText`, `IsOnlineConfig` dans le fichier `.iss`).
