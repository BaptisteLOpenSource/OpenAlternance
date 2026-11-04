---
name: openalternance
description: Read and update the OpenAlternance job-search tracker (companies, contacts, exchanges, statuses, follow-ups) and fix cover letters. Use when the user asks to list companies, log a mail/call/interview, change a status, add a contact, or correct a lettre de motivation.
---

# OpenAlternance

Run every command from the repo root. Data goes to `DATABASE_URL` (empty = local SQLite
`data/openalternance.db`, `postgresql://...` = Neon). Never print or commit `.env`.

## Read

- `bun run cli liste` : table of companies (statut, contacts, last exchange, next relance).
- Letters: `lettres/*.md` (model `lettres/_template.md`, `{{placeholders}}`).

## Write

```bash
bun run cli add "<Entreprise>" --ville <ville> --site <url> --notes "<texte>"
bun run cli personne "<Entreprise>" --nom "<nom>" --role <role> --email <mail> --tel <tel>
bun run cli contact "<Entreprise>" <type> --date YYYY-MM-DD --delai 7 --note "<texte>"
bun run cli statut "<Entreprise>" <statut>
bun run cli fusionner "<Source>" "<Cible>"   # merge source into cible, source deleted
bun run cli sync-files
```

- `type`: `mail`, `appel`, `candidature`, `relance`, `entretien`, `reponse`, `depot`.
- `statut`: `a_contacter`, `contacte`, `relance`, `entretien`, `offre`, `refuse`.
- `contact` sets a relance in 7 days (`--delai` to change); `entretien` cancels it.
- `offre` and `refuse` freeze the status and drop the relance.
- Company name must match exactly: run `liste` first.

## Fix a cover letter

1. Read `lettres/<file>.md`. Fix spelling, grammar, tone; keep facts, names, dates, structure.
2. Show the diff to the user before saving.
3. `bun run cli sync-files` pushes `lettres/*.md` to the DB (overwrites by file name).

Sync is one way (files -> DB). A letter edited only in the dashboard is not in `lettres/`:
ask the user to export it first.

## Rules

- Confirm before `statut ... refuse` or bulk changes.
- One command per change, report each CLI output line.
