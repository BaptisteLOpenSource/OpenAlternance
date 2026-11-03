# Contribuer à OpenAlternance

Merci de vouloir contribuer. Le dépôt n'accepte pas de push direct : tout passe par un fork et une pull request vers `dev`.

## Avant de coder

- Un bug ou une idée ? Ouvre une [issue](https://github.com/BaptisteLOpenSource/OpenAlternance/issues/new/choose) avec le formulaire adapté.
- Pour un changement important (nouvelle zone, changement de schéma, refonte), ouvre d'abord une issue pour qu'on s'aligne sur l'approche.

## Flux

1. Forke le dépôt sur GitHub.
2. Crée une branche **depuis `dev`** dans ton fork. Ne travaille jamais sur `main`.
3. Commits au format [Conventional Commits](https://www.conventionalcommits.org/fr/) : `type(scope): sujet`, en minuscules, sans point final, 75 caractères maximum.
4. Avant d'ouvrir la PR, lance les vérifications locales :

   ```bash
   bun install
   bun run typecheck
   bun test src
   ```

5. Ouvre une pull request **vers `dev`**. Si elle n'est pas prête à être relue, ouvre-la en brouillon.
6. Une revue du mainteneur (`@BaptisteLeDev`) est requise avant fusion.

## Ce qui est attendu

- Un changement ciblé par PR. Une PR qui mélange refonte et correction sera découpée.
- Pas de nouvelle dépendance sans raison claire. Préfère la bibliothèque standard et ce qui existe déjà dans le code.
- Pas de commentaire de code sauf pour expliquer un _pourquoi_ non évident.
- Ne commite jamais `.env`, de clés ou de données personnelles.

## CI

La CI (typecheck, tests, e2e avec API mockée) ne demande aucun secret. Pour une première contribution, GitHub demande une approbation avant de lancer les workflows de ton fork : c'est normal.

## Licence

En contribuant, tu acceptes que ton code soit publié sous la [licence MIT](LICENSE) du projet.
