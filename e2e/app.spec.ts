import { expect, test, type Page, type Route } from "@playwright/test";
import { PROFIL_VIDE } from "../src/logic";

// API mocked at the network edge: the UI is tested without a database.
type Mock = { loggedIn: boolean; calls: { method: string; path: string; body: unknown }[]; extra?: Record<string, unknown> };

const company = {
  id: 1,
  nom: "MGDIS",
  ville: "Rennes",
  site: "https://mgdis.example",
  statut: "a_contacter",
  prochaine_relance: null,
  notes: "<img src=x onerror=\"window.__xss=1\">",
  logo: null,
  poste: "Dev",
  publication: null,
  candidatures: null,
  reponses: null,
  mail: null,
  derniere_interaction: null,
  contacts: [],
};

const grizzlead = { ...company, id: 2, nom: "Grizzlead", ville: "Auray", contacts: [] };

const postes = [
  { id: 1, company_id: 1, intitule: "Dev web", contrat: "alternance", annonce: null, publication: null, candidatures: null, reponses: null, agence_id: null, etat: { statut: "entretien", prochaine: null } },
  { id: 2, company_id: 1, intitule: "Data", contrat: "cdi", annonce: "https://mgdis.example/data", publication: null, candidatures: null, reponses: null, agence_id: 1, etat: { statut: "a_contacter", prochaine: null } },
];

const agences = [{ id: 1, company_id: 1, ville: "Auray", adresse: null, code_postal: null }];

const echanges = [
  { id: 10, company_id: 1, type: "candidature", date: "2026-10-01", note: null, delai: 7, poste_id: 1, statut: null, prochaine: null, nom: "MGDIS" },
  { id: 11, company_id: 1, type: "mail", date: "2026-10-02", note: null, delai: null, poste_id: 2, statut: null, prochaine: null, nom: "MGDIS" },
  { id: 12, company_id: 1, type: "statut", date: "2026-10-03", note: null, delai: null, poste_id: null, statut: "entretien", prochaine: null, nom: "MGDIS" },
  { id: 13, company_id: 1, type: "planif", date: "2026-10-04", note: null, delai: null, poste_id: null, statut: null, prochaine: null, nom: "MGDIS" },
];

const state = (lettres: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  today: "2026-10-13",
  companies: [company, grizzlead],
  contacts: [],
  postes,
  agences,
  interactions: echanges,
  lettres,
  pdfs: ["lettre-mgdis.pdf"],
  documents: [],
  cv: false,
  profil: PROFIL_VIDE,
  ...extra,
});

async function mockApi(page: Page, mock: Mock) {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postDataJSON?.() ?? null;
    mock.calls.push({ method: req.method(), path, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/api/login") {
      mock.loggedIn = true;
      return json({ ok: true });
    }
    if (path === "/api/logout") {
      mock.loggedIn = false;
      return json({ ok: true });
    }
    if (!mock.loggedIn) return json({ error: "Connexion requise" }, 401);
    if (path === "/api/state") return json(state([{ file: "mgdis.md", type: "lettre", entreprise: "MGDIS", statut: "brouillon" }], mock.extra));
    if (path === "/api/lettre") return json({ ...state(), file: "mgdis-data.md" });
    if (path === "/api/mgdis.md" || path.startsWith("/api/lettres/")) {
      return json({ content: "# Bonjour", html: "<h1>Bonjour</h1>" });
    }
    if (path === "/api/logos/1") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="1" height="1" fill="#ff0000"/><rect x="1" width="1" height="1" fill="#0000ff"/></svg>',
      });
    }
    if (req.method() === "POST") return json(state([], mock.extra));
    return json({ error: "Introuvable" }, 404);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("login: le mot de passe part une fois vers /api/login, jamais stocké côté client", async ({ page }) => {
  const mock: Mock = { loggedIn: false, calls: [] };
  await mockApi(page, mock);
  await page.goto("/");
  await page.getByLabel("Mot de passe").fill("s3cret-test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Dashboard").first()).toBeVisible();
  const login = mock.calls.find((c) => c.path === "/api/login");
  expect(login?.body).toEqual({ password: "s3cret-test" });
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("s3cret-test");
});

test("chaque page s'affiche une fois connecté", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  for (const hash of ["#/", "#/calendrier", "#/entreprises", "#/entreprises/1", "#/lettres"]) {
    await page.goto(`/${hash}`);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByText("Alternance").first()).toBeVisible();
  }
});

test("lettres: le PDF importé est listé et pointe vers /api/fichiers", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/lettres");
  const link = page.getByRole("link", { name: "lettre-mgdis.pdf" });
  await expect(link).toHaveAttribute("href", "/api/fichiers/lettre-mgdis.pdf");
});

test("CV absent: formulaire d'envoi, pas d'iframe", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [], extra: { cv: false } };
  await mockApi(page, mock);
  await page.goto("/#/cv");
  await expect(page.locator('input[type=file][accept="application/pdf"]')).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("document PDF: visionneuse et téléchargement", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [], extra: { documents: [{ name: "cv-2026.pdf", format: "pdf" }] } };
  await mockApi(page, mock);
  await page.goto("/#/documents/cv-2026.pdf");
  await expect(page.locator('iframe[src="/api/fichiers/cv-2026.pdf"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "Télécharger" })).toHaveAttribute("download", "cv-2026.pdf");
});

test("clic droit sur une lettre: Supprimer la lettre", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/lettres");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-lettre="mgdis.md"]').click({ button: "right" });
  await page.getByText("Supprimer la lettre", { exact: true }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/lettre-supprimer")?.body).toEqual({ file: "mgdis.md" });
});

test("impression de la lettre: nom du PDF = nom de fichier du profil", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [], extra: { profil: { ...PROFIL_VIDE, username: "BaptisteDechamp" } } };
  await mockApi(page, mock);
  await page.goto("/#/lettres/mgdis.md");
  await page.getByRole("button", { name: "Imprimer" }).click();
  await expect(page).toHaveTitle("Lettre_Motivation_BaptisteDechamp-MGDIS");
});

test("entreprise: dégradé pris dans les couleurs du logo, logo jamais en fond", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [], extra: { companies: [{ ...company, logo: "https://mgdis.example/logo.svg" }] } };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  const colorOf = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("*")].some((el) => getComputedStyle(el).backgroundColor === "rgb(255, 0, 0)"));
  await expect.poll(colorOf).toBe(true);
  const logoAsBackground = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("*")].some((el) => getComputedStyle(el).backgroundImage.includes("/api/logos/")));
  expect(logoAsBackground).toBe(false);
});

test("XSS: les notes d'entreprise sont affichées en texte, aucun script exécuté", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await expect.poll(() => page.locator("textarea").evaluateAll((els) => els.some((e) => (e as HTMLTextAreaElement).value.includes("<img src=x")))).toBe(true);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test("XSS: la lettre rendue est dans une iframe sandboxée", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/lettres");
  await page.getByRole("row", { name: /MGDIS/ }).click();
  const frame = page.locator("iframe[title^=\"Aperçu PDF\"]");
  await expect(frame).toBeVisible();
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).not.toContain("allow-same-origin");
});

test("déconnexion : menu sidebar -> POST /api/logout -> écran de login", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/");
  await page.getByRole("button", { name: /Candidat/ }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  expect(mock.calls.some((c) => c.method === "POST" && c.path === "/api/logout")).toBe(true);
});

test("session expirée (401) renvoie vers le login sans erreur brute", async ({ page }) => {
  const mock: Mock = { loggedIn: false, calls: [] };
  await mockApi(page, mock);
  await page.goto("/");
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  await expect(page.getByText("SyntaxError")).toHaveCount(0);
});

test("API: une réponse non JSON ne casse pas l'UI (message lisible)", async ({ page }) => {
  await page.route("**/api/state", (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "The page could not be found" }),
  );
  await page.goto("/");
  await expect(page.getByText("réponse non JSON")).toBeVisible();
});

test("postes: intitulés, contrats et agence affichés sur la fiche entreprise", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await expect(page.getByText("Dev web", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("CDI", { exact: true })).toBeVisible();
  await expect(page.getByText("Auray", { exact: true }).first()).toBeVisible();
});

test("poste: ajout via le dialogue -> POST /api/poste", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Ajouter un poste" }).click();
  await page.getByLabel("Intitulé").fill("Ops");
  await page.getByLabel("Contrat").click();
  await page.getByRole("option", { name: "Stage" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/poste")?.body).toMatchObject({ entreprise: "MGDIS", intitule: "Ops", contrat: "stage" });
});

test("poste: modifier renvoie tous les champs (contrat, agence, annonce)", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Modifier le poste Data" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect
    .poll(() => mock.calls.find((c) => c.path === "/api/poste-modifier")?.body)
    .toMatchObject({ id: "2", intitule: "Data", contrat: "cdi", agence: "1", annonce: "https://mgdis.example/data" });
});

test("historique: filtre par poste masque les autres échanges", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await expect(page.getByText("Email", { exact: true })).toBeVisible();
  await page.getByLabel("Filtrer l'historique par poste").click();
  await page.getByRole("option", { name: "Dev web" }).click();
  await expect(page.getByText("Email", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Candidature", { exact: true })).toBeVisible();
});

test("historique: événements statut et planif lisibles", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await expect(page.getByText("Statut → Entretien")).toBeVisible();
  await expect(page.getByText("Relances arrêtées")).toBeVisible();
});

test("poste: StatutSelect envoie le poste", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Statut du poste Data" }).click();
  await page.getByRole("option", { name: "Refusé" }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/statut")?.body).toEqual({ entreprise: "MGDIS", poste: "2", statut: "refuse" });
});

test("échange: type limité aux types d'échange (pas statut ni planif)", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Ajouter un échange" }).first().click();
  await page.getByLabel("Type").click();
  await expect(page.getByRole("option")).toHaveCount(9);
  await expect(page.getByRole("option", { name: "statut" })).toHaveCount(0);
});

test("échange modifié: le poste est renvoyé même inchangé", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [], extra: { interactions: [echanges[1]] } };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Modifier l'échange" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/echange-modifier")?.body).toMatchObject({ id: "11", poste: "2" });
});

test("lettre d'un poste: ouvre le fichier renvoyé par l'API", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.getByRole("button", { name: "Lettre du poste Data" }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/lettre")?.body).toMatchObject({ entreprise: "MGDIS", poste: "2" });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/lettres/mgdis-data.md");
});

test("fusion: dialogue -> POST /api/entreprise-fusionner {source, cible}", async ({ page }) => {
  const mock: Mock = { loggedIn: true, calls: [] };
  await mockApi(page, mock);
  await page.goto("/#/entreprises/1");
  await page.locator("h1").click({ button: "right" });
  await page.getByText("Fusionner avec une autre entreprise", { exact: true }).click();
  await page.getByLabel("Cible").click();
  await page.getByRole("option", { name: "Grizzlead" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => mock.calls.find((c) => c.path === "/api/entreprise-fusionner")?.body).toEqual({ source: "MGDIS", cible: "Grizzlead" });
});
