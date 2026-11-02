# Design: right-click site web, Todo title link, filter persistence

Date: 2026-11-02 · Size: small · Status: awaiting approval

## Intent

Three UX fixes on the web app:

1. Right-click action "Ouvrir le site web" available on Entreprises list rows (and company page), also toggleable in the Personnaliser dropdown.
2. Todo card company name click -> company page.
3. Statut filter on Entreprises list survives navigating to a company page and back.

## Non-goals

- Persist filter across full page reload (localStorage) unless asked later.
- Persist sort order, search already lives in App state.
- New command palette entry, mobile long-press menu.

## Approaches

### 1. Right-click "Ouvrir le site web"

- **A (chosen): one new Command + row detection.** Add `{ id: "site-web", label: "Ouvrir le site web", scope: ["company", "entreprises"] }` in `commands.ts`, `run` opens `company.site` (`window.open(..., "noopener")`, no-op when `site` null). In `app.tsx` `onContextMenu`, resolve company under cursor from `closest("[data-company]")` (new attr on `TableRow` in `companies.tsx`), keep it in state next to menu coords, feed it into `ctx.company` when rendering the menu. CustomizeMenu already lists every non-pinned command, so the entry shows there for free.
  - Tradeoff: one extra state in App; menu ctx differs from route ctx only while menu open.
- **B: only scope "company".** Cheapest but dead on the list, rejected by user.
- **C: separate context menu inside CompaniesPage.** Duplicates popup/dismiss logic in `menus.tsx`, rejected.

### 2. Todo title -> company page

- **A (chosen): plain `<a href="#/entreprises/{id}">` on the name** (`todo.tsx:37`), same pattern as the list link `companies.tsx:122`.
- **B: button + onClick setting hash.** Worse a11y, no middle-click/open-in-tab.

### 3. Filter survives back navigation

- **A (chosen): lift `filter` state from `CompaniesPage` into `App`**, pass `filter`/`onFilter` props. App never remounts on hash change, so return keeps "À contacter".
- **B: localStorage via `store()`.** Survives reload too, adds a key + hydration, not asked.
- **C: filter in the hash (`#/entreprises?statut=`).** Shareable/back-button clean, but rewrites routing for a small ask.

## Constraints

- Follow existing patterns: commands table, `openCompany` hash nav, App-level state for cross-page UI state.
- No new deps. No comments unless non-obvious why.
- `site` is `string | null`; guard before open (repo already validates http/https).

## Decisions (as agreed)

- Right-click target: list rows (user picked A over page-only).
- Filter persistence: in-session only (approach A).

## Left to builder

Implement A/A/A, run `bun test` + typecheck + lint per repo scripts, one small test only if logic warrants (see below).

Test note: command `run` guard (null site) is trivial; skip unit test unless a pure helper appears. Manual check: filter "À contacter" -> open company -> back keeps filter; right-click row with site opens tab; right-click row without site does nothing; Todo name navigates.
