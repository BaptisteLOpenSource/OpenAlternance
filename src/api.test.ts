import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// db.ts and api.ts read env at import, before beforeAll: point them at the
// test DB here, or Bun's .env sends DB tests to production.
const DB = process.env.TEST_DATABASE_URL ?? "sqlite://:memory:";
if (DB === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL = DATABASE_URL: refuse de tester sur la prod");
process.env.DATABASE_URL = DB;
process.env.OPENALTERNANCE_PASSWORD = "pw-de-test";
process.env.OPENALTERNANCE_PASSWORD ??= "pw-de-test";
const { handle } = await import("./api");
const ORIGIN = "http://127.0.0.1:3000";
const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  handle(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.origin ? { origin: init.origin } : {}), ...(init.headers ?? {}) },
    }),
  );

describe("gates sans base", () => {
  test("API sans cookie de session -> 401 JSON", async () => {
    const res = await req("/api/state");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("écriture depuis une autre origine -> 403 (CSRF)", async () => {
    const res = await req("/api/entreprise", { method: "POST", origin: "https://evil.example", body: "{}" });
    expect(res.status).toBe(403);
  });

  test("logout depuis une autre origine -> 403 (CSRF)", async () => {
    const res = await req("/api/logout", { method: "POST", origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  test("lecture d'un PDF sans session -> 401, jamais le fichier", async () => {
    const res = await req("/api/fichiers/lettre-mgdis.pdf");
    expect(res.status).toBe(401);
  });

  test("chemin hors /api -> 404", async () => {
    const res = await req("/autre");
    expect(res.status).toBe(404);
  });
});

describe("en-têtes de sécurité (vercel.json)", () => {
  const config = JSON.parse(readFileSync(join(import.meta.dir, "..", "vercel.json"), "utf8"));
  const headers = Object.fromEntries(
    config.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
  ) as Record<string, string>;

  test("HSTS présent", () => {
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  test("CSP: pas de script inline sans hash, pas d'unsafe-eval", () => {
    const csp = headers["Content-Security-Policy"]!;
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("API non cacheable", () => {
    expect(config.headers[1].headers[0]).toEqual({ key: "Cache-Control", value: "no-store" });
  });
});

// Build integrity: every inline script in dist/index.html must have its hash in the CSP.
test("hashes CSP = scripts inline du build (si dist existe)", () => {
  const distIndex = join(import.meta.dir, "..", "dist", "index.html");
  if (!require("node:fs").existsSync(distIndex)) return;
  const crypto = require("node:crypto");
  const html = readFileSync(distIndex, "utf8");
  const csp = JSON.parse(readFileSync(join(import.meta.dir, "..", "vercel.json"), "utf8")).headers[0].headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy",
  ).value as string;
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${crypto.createHash("sha256").update(body!).digest("base64")}'`;
    expect(csp).toContain(hash);
  }
});

describe("base de test (TEST_DATABASE_URL)", () => {
  let api: typeof import("./api");
  let sql: typeof import("./db").sql;
  let cookie = "";
  const login = async (password: string) =>
    req("/api/login", { method: "POST", origin: ORIGIN, body: JSON.stringify({ password }) });

  beforeAll(async () => {
    ({ sql } = await import("./db"));
    api = await import("./api");
    await (await import("./db")).migrate();
    await sql`DELETE FROM companies WHERE nom LIKE 'TEST-%'`;
    await sql`DELETE FROM login_attempts`;
    await sql`DELETE FROM sessions`;
    const res = await api.handle(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ password: "pw-de-test" }) }));
    cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM companies WHERE nom LIKE 'TEST-%'`;
    await sql`DELETE FROM login_attempts`;
    await sql`DELETE FROM sessions`;
  });

  const auth = (path: string, init: RequestInit & { origin?: string } = {}) =>
    api.handle(
      new Request(`${ORIGIN}${path}`, {
        ...init,
        headers: { "content-type": "application/json", origin: ORIGIN, cookie, ...(init.headers ?? {}) },
      }),
    );

  test("mauvais mot de passe -> 401, bon -> 200 + cookie HttpOnly SameSite=Strict", async () => {
    expect((await login("mauvais")).status).toBe(401);
    const ok = await login("pw-de-test");
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  test("le mot de passe n'apparaît jamais dans la réponse", async () => {
    const res = await login("pw-de-test");
    expect(await res.text()).not.toContain("pw-de-test");
  });

  test("le cookie ouvre l'état", async () => {
    expect((await auth("/api/state")).status).toBe(200);
  });

  test("logout révoque le cookie copié", async () => {
    expect((await auth("/api/logout", { method: "POST" })).status).toBe(200);
    expect((await auth("/api/state")).status).toBe(401);
    cookie = (await login("pw-de-test")).headers.get("set-cookie")!.split(";")[0]!;
  });

  test("injection SQL dans un nom -> stockée littéralement, table intacte", async () => {
    const nom = `TEST-'); DROP TABLE companies; --`;
    const res = await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    expect(res.status).toBe(200);
    const [row] = await sql`SELECT nom FROM companies WHERE nom = ${nom}`;
    expect(row.nom).toBe(nom);
  });

  test("injection SQL dans un statut -> 400 (liste fermée)", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-statut" }) });
    const res = await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: "TEST-statut", statut: "x' OR '1'='1" }) });
    expect(res.status).toBe(400);
  });

  test("XSS dans les notes -> stockées telles quelles, servies en JSON", async () => {
    const payload = "<script>alert(1)</script>";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-xss", notes: payload }) });
    const res = await auth("/api/state");
    expect(res.headers.get("content-type")).toContain("application/json");
    const state = (await res.json()) as { companies: { nom: string; notes: string }[] };
    expect(state.companies.find((c) => c.nom === "TEST-xss")?.notes).toBe(payload);
  });

  test("site javascript: refusé (schéma http/https seulement)", async () => {
    const res = await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-js", site: "javascript:alert(1)" }) });
    expect(res.status).toBe(400);
  });

  test("logo javascript: refusé", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-logo" }) });
    const res = await auth("/api/fiche", { method: "POST", body: JSON.stringify({ entreprise: "TEST-logo", logo: "javascript:alert(1)" }) });
    expect(res.status).toBe(400);
  });

  test("champ requis absent -> 400 (validation aux frontières)", async () => {
    const res = await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ ville: "Rennes" }) });
    expect(res.status).toBe(400);
  });

  test("corps non JSON ou non objet -> 400", async () => {
    expect((await auth("/api/entreprise", { method: "POST", body: "pas du json" })).status).toBe(400);
    expect((await auth("/api/entreprise", { method: "POST", body: "[1,2]" })).status).toBe(400);
  });

  test("type d'échange inconnu -> 400", async () => {
    const res = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-xss", type: "hack" }) });
    expect(res.status).toBe(400);
  });

  test("date d'échange invalide -> 400 (pas de relance NaN)", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-relance" }) });
    const res = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-relance", type: "mail", date: "garbage" }) });
    expect(res.status).toBe(400);
  });

  test("délai d'échange non entier -> 400", async () => {
    const res = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-relance", type: "mail", delai: "abc" }) });
    expect(res.status).toBe(400);
  });

  test("échange sur entreprise refusée -> pas de relance créée", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-refus" }) });
    await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: "TEST-refus", statut: "refuse" }) });
    const res = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-refus", type: "mail" }) });
    const state = (await res.json()) as { companies: { nom: string; prochaine_relance: string | null }[] };
    expect(state.companies.find((c) => c.nom === "TEST-refus")?.prochaine_relance).toBeNull();
  });

  test("relance décalée à une date, date invalide -> 400", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-decale" }) });
    const bad = await auth("/api/relance-date", { method: "POST", body: JSON.stringify({ entreprise: "TEST-decale", date: "2026-02-30" }) });
    expect(bad.status).toBe(400);
    const res = await auth("/api/relance-date", { method: "POST", body: JSON.stringify({ entreprise: "TEST-decale", date: "2026-12-01" }) });
    const state = (await res.json()) as { companies: { nom: string; prochaine_relance: string | null }[] };
    expect(state.companies.find((c) => c.nom === "TEST-decale")?.prochaine_relance).toBe("2026-12-01");
  });

  test("doublon en casse différente -> 400", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-Casse Test" }) });
    const res = await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "test-casse test" }) });
    expect(res.status).toBe(400);
  });

  test("action inconnue -> 404", async () => {
    expect((await auth("/api/inconnue", { method: "POST", body: "{}" })).status).toBe(404);
  });

  test("nom de lettre hors whitelist -> 404 (pas de traversée de chemin)", async () => {
    expect((await auth("/api/lettres/..%2Fsecret.md")).status).toBe(404);
  });

  test("PDF: nom non autorisé -> 404", async () => {
    expect((await auth("/api/fichiers/..%2Fcv.txt")).status).toBe(404);
  });

  test("rate limit: 10 échecs puis 429", async () => {
    await sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 10; i++) await login("raté");
    expect((await login("pw-de-test")).status).toBe(429);
    await sql`DELETE FROM login_attempts`;
  });

  test("personne-supprimer retire le contact de l'état", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-suppr-contact" }) });
    await auth("/api/personne", { method: "POST", body: JSON.stringify({ entreprise: "TEST-suppr-contact", nom: "TEST-Contact" }) });
    const before = (await (await auth("/api/state")).json()) as { contacts: { id: number; nom: string }[] };
    const id = before.contacts.find((k) => k.nom === "TEST-Contact")!.id;
    const res = await auth("/api/personne-supprimer", { method: "POST", body: JSON.stringify({ id: String(id) }) });
    expect(res.status).toBe(200);
    const after = (await res.json()) as { contacts: { id: number }[] };
    expect(after.contacts.some((k) => k.id === id)).toBe(false);
  });

  test("entreprise-supprimer retire l'entreprise, ses contacts et ses échanges", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-suppr-entreprise" }) });
    await auth("/api/personne", { method: "POST", body: JSON.stringify({ entreprise: "TEST-suppr-entreprise", nom: "TEST-Sans-Suite" }) });
    const echange = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-suppr-entreprise", type: "mail" }) });
    expect(echange.status).toBe(200);
    const avant = (await echange.json()) as { interactions: { nom: string }[] };
    expect(avant.interactions.some((i) => i.nom === "TEST-suppr-entreprise")).toBe(true);
    const res = await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-suppr-entreprise" }) });
    expect(res.status).toBe(200);
    const state = (await res.json()) as {
      companies: { nom: string }[];
      contacts: { nom: string }[];
      interactions: { nom: string }[];
    };
    expect(state.companies.some((c) => c.nom === "TEST-suppr-entreprise")).toBe(false);
    expect(state.contacts.some((k) => k.nom === "TEST-Sans-Suite")).toBe(false);
    expect(state.interactions.some((i) => i.nom === "TEST-suppr-entreprise")).toBe(false);
  });

  test("lettre d'une entreprise supprimée -> enregistrée (200), pas 400", async () => {
    const lettre = (content: string) =>
      auth("/api/lettre", {
        method: "POST",
        body: JSON.stringify({ entreprise: "TEST-lettre-orpheline", content: `---\ntype: lettre\nentreprise: TEST-lettre-orpheline\nstatut: brouillon\n---\n\n${content}` }),
      });
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-lettre-orpheline" }) });
    expect((await lettre("v1")).status).toBe(200);
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-lettre-orpheline" }) });
    expect((await lettre("v2")).status).toBe(200);
  });

  test("lettre envoyée -> candidature loggée une fois, entreprise contactée", async () => {
    const nom = "TEST-lettre-envoyee";
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: nom }) });
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: nom, content: `---\ntype: lettre\nentreprise: ${nom}\nstatut: brouillon\n---\n\nx` }) });
    const envoyer = (date: string) => auth("/api/lettre-statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "envoyee", date }) });
    expect((await envoyer("2026-10-01")).status).toBe(200);
    const res = await envoyer("2026-10-02");
    const state = (await res.json()) as { companies: { nom: string; statut: string }[]; interactions: { nom: string; type: string }[] };
    expect(state.companies.find((c) => c.nom === nom)?.statut).toBe("contacte");
    expect(state.interactions.filter((i) => i.nom === nom && i.type === "candidature")).toHaveLength(1);
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: nom }) });
  });

  test("entreprise-supprimer inconnue -> 400", async () => {
    const res = await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-inconnue" }) });
    expect(res.status).toBe(400);
  });
});
