---
title: Installation desktop
description: Installer OpenAlternance sur Windows, en local (SQLite) ou connecté à Neon, avec mises à jour et sauvegarde.
---

Application Windows : une fenêtre dédiée, sans navigateur ni terminal. Elle tourne sur ton PC et peut
se connecter à une base Neon pour être utilisée depuis plusieurs PC et ton téléphone.

Pour le développement depuis le code, voir [Installation développeur](/installation-dev/).

## Télécharger

Récupère `OpenAlternance-Setup.exe` sur la page des
[versions](https://github.com/BaptisteLOpenSource/OpenAlternance/releases/latest).

## Installer

1. Lance `OpenAlternance-Setup.exe`.
2. Windows affiche « Windows a protégé votre ordinateur » (SmartScreen) : clique sur **Informations complémentaires**,
   puis **Exécuter quand même**.3. Suis l'assistant. L'installation se fait pour ton compte seul, sans droits administrateur, dans
   `%LOCALAPPDATA%\Programs\OpenAlternance`.
4. Choisis le mode de stockage (voir ci-dessous). Une icône est créée dans le menu Démarrer ; l'app s'ouvre à la fin.

## Choisir le mode

| Mode | Où sont les données | Quand le choisir |
|---|---|---|
| **Sur ce PC uniquement** | base SQLite sur ton PC | un seul poste, aucun compte, rien en ligne |
| **En ligne avec Neon** | base Postgres chez Neon | plusieurs PC et ton téléphone (il faut d'abord [créer la base Neon](/installation-en-ligne/#neon)) |

En mode en ligne, colle la chaîne `postgresql://...` de ta branche Neon à l'étape suivante de l'assistant.
Le lien « Où trouver ma clé ? » ouvre le guide.

## Où sont les données

- Configuration : `%APPDATA%\OpenAlternance\config.json`.
  En mode en ligne, l'URL Neon y est chiffrée (DPAPI, liée à ton compte Windows) ; elle n'est jamais écrite en clair.
- Base locale, sauvegardes et journal : `%LOCALAPPDATA%\OpenAlternance\` (`openalternance.db`, dossier `backups\`,
  `openalternance.log`).

En mode en ligne, les données vivent sur Neon. Le dossier local ne garde que la configuration, les sauvegardes et le journal.

## Mises à jour

Au démarrage, l'app vérifie la dernière version publiée. Si elle est plus récente, une bannière apparaît en haut de la page.
Le bouton de mise à jour télécharge le nouvel installeur, l'exécute en silencieux puis relance l'app.
Si la vérification échoue (pas de connexion), l'app démarre normalement sans bannière.

## Sauvegarder (mode en ligne)

Le bouton **Sauvegarder** copie la base Neon dans un fichier SQLite local :
`%LOCALAPPDATA%\OpenAlternance\backups\openalternance-AAAA-MM-JJ-HHMM.db`.
Le bouton n'apparaît qu'en mode en ligne ; en mode local, copie simplement `openalternance.db`.

## Changer de mode ou reconfigurer

Relance `OpenAlternance-Setup.exe` : la mise à jour se fait par-dessus l'installation existante, et la page de mode
reflète ton choix actuel. En mode en ligne, laisse le champ vide pour garder la clé déjà enregistrée.
Passer d'un mode à l'autre ouvre une base différente : les données de l'autre mode ne sont pas copiées.

## Désinstaller

Désinstalle depuis les paramètres Windows (Applications). L'installeur demande ensuite si tu veux aussi supprimer
tes données locales (base, sauvegardes, configuration). Si tu refuses, elles restent dans `%LOCALAPPDATA%` et `%APPDATA%`.
Les données Neon ne sont jamais supprimées par la désinstallation.

## PC partagé

- Le serveur écoute sur `127.0.0.1` uniquement, et l'app desktop n'a pas de mot de passe. Pendant qu'elle tourne,
  toute personne ayant une session ouverte sur ce PC peut ouvrir `http://127.0.0.1:3737` et lire les données.
- L'app s'arrête seule après 60 minutes sans requête. Fermer la fenêtre ne suffit pas : pour arrêter tout de suite,
  termine `OpenAlternance.exe` dans le Gestionnaire des tâches.
- Ne laisse pas ta session ouverte sans surveillance sur un PC partagé.
