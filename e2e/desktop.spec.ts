import { expect, test, type Page, type Route } from "@playwright/test";
import { PROFIL_VIDE } from "../src/logic";

// Desktop: no login, /api/desktop/* routes. Mocked like app.spec.ts.
type Info = { status: number; body: unknown };
type Mock = { calls: { method: string; path: string }[] };

const state = {
  today: "2026-10-13",
  companies: [],
  contacts: [],
  postes: [],
  agences: [],
  interactions: [],
  lettres: [],
  pdfs: [],
  documents: [],
  profil: PROFIL_VIDE,
};

async function mockDesktop(page: Page, info: Info, mock: Mock) {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    mock.calls.push({ method: req.method(), path });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/api/desktop/info") return json(info.body, info.status);
    if (path === "/api/desktop/update") return json({ ok: true });
    if (path === "/api/desktop/backup") return json({ file: "C:\\Users\\bapti\\AppData\\Local\\OpenAlternance\\backups\\db-test.sqlite" });
    if (path === "/api/state") return json(state);
    if (req.method() === "POST") return json(state);
    return json({ error: "Introuvable" }, 404);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("mise à jour : bannière visible, clic -> POST /api/desktop/update, téléchargement affiché", async ({ page }) => {
  const mock: Mock = { calls: [] };
  await mockDesktop(page, { status: 200, body: { mode: "local", version: "1.0.0", update: { version: "1.1.0", url: "https://example.test/Setup.exe" } } }, mock);
  await page.goto("/");
  await expect(page.getByText("Nouvelle version 1.1.0 disponible")).toBeVisible();
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByText(/^Téléchargement de la mise à jour/)).toBeVisible();
  expect(mock.calls.some((c) => c.method === "POST" && c.path === "/api/desktop/update")).toBe(true);
});

test("hors desktop (404) : pas de bannière, pas de bouton sauvegarde, déconnexion gardée", async ({ page }) => {
  const mock: Mock = { calls: [] };
  await mockDesktop(page, { status: 404, body: { error: "Introuvable" } }, mock);
  await page.goto("/#/compte");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await expect(page.getByText("Nouvelle version")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sauvegarder sur ce PC" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Candidat/ })).toBeVisible();
});

test("desktop local : pas de bouton sauvegarde, menu de déconnexion masqué", async ({ page }) => {
  const mock: Mock = { calls: [] };
  await mockDesktop(page, { status: 200, body: { mode: "local", version: "1.0.0", update: null } }, mock);
  await page.goto("/#/compte");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sauvegarder sur ce PC" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Candidat/ })).toHaveCount(0);
});

test("desktop online : sauvegarde -> POST /api/desktop/backup, chemin du fichier affiché", async ({ page }) => {
  const mock: Mock = { calls: [] };
  await mockDesktop(page, { status: 200, body: { mode: "online", version: "1.0.0", update: null } }, mock);
  await page.goto("/#/compte");
  await page.getByRole("button", { name: "Sauvegarder sur ce PC" }).click();
  await expect(page.getByText("Sauvegarde créée : C:\\Users\\bapti\\AppData\\Local\\OpenAlternance\\backups\\db-test.sqlite")).toBeVisible();
  expect(mock.calls.some((c) => c.method === "POST" && c.path === "/api/desktop/backup")).toBe(true);
});
