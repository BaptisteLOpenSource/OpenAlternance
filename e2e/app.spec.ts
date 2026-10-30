import { expect, test, type Page, type Route } from "@playwright/test";
import { PROFIL_VIDE } from "../src/logic";

// API mocked at the network edge: the UI is tested without a database.
type Mock = { loggedIn: boolean; calls: { method: string; path: string; body: unknown }[] };

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

const state = (lettres: unknown[] = []) => ({
  today: "2026-10-13",
  companies: [company],
  contacts: [],
  interactions: [],
  lettres,
  pdfs: ["lettre-mgdis.pdf"],
  documents: [],
  profil: PROFIL_VIDE,
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
    if (path === "/api/state") return json(state([{ file: "mgdis.md", type: "lettre", entreprise: "MGDIS", statut: "brouillon" }]));
    if (path === "/api/mgdis.md" || path.startsWith("/api/lettres/")) {
      return json({ content: "# Bonjour", html: "<h1>Bonjour</h1>" });
    }
    if (req.method() === "POST") return json(state());
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
