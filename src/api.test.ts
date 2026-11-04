import { describe, expect, test, beforeAll, afterAll, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// db.ts and api.ts read env at import, before beforeAll: point them at the
// test DB here, or Bun's .env sends DB tests to production.
const DB = process.env.TEST_DATABASE_URL ?? "sqlite://:memory:";
if (DB === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL = DATABASE_URL: refuse de tester sur la prod");
process.env.DATABASE_URL = DB;
process.env.OPENALTERNANCE_PASSWORD = "mot-de-passe-de-test-ok";
const { handle, passwordProblem, authRequired } = await import("./api");
const { digest } = await import("./auth");
const { logoDeps } = await import("./logo");
const ORIGIN = "http://127.0.0.1:3000";
const fingerprint = (password: string) => digest(password).toString("hex").slice(0, 16);
const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  handle(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.origin ? { origin: init.origin } : {}), ...(init.headers ?? {}) },
    }),
  );

describe("passwordProblem", () => {
  test("vide, court ou placeholder refusés", () => {
    expect(passwordProblem("")).toMatch(/non configuré/);
    expect(passwordProblem("court")).toMatch(/16/);
    expect(passwordProblem("change-me-min-16-chars")).toMatch(/16/);
    expect(passwordProblem("0123456789abcdef")).toBeNull();
  });
});

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
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  test("iframes PDF même origine seulement", () => {
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
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
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script[^>]*>/gi)) {
    const hash = `'sha256-${crypto.createHash("sha256").update(body!).digest("base64")}'`;
    expect(csp).toContain(hash);
  }
});

describe("base de test (TEST_DATABASE_URL)", () => {
  let api: typeof import("./api");
  let repo: typeof import("./repo");
  let sql: typeof import("./db").sql;
  let cookie = "";
  const login = async (password: string) =>
    req("/api/login", { method: "POST", origin: ORIGIN, body: JSON.stringify({ password }) });

  afterEach(() => {
    logoDeps.lookup = logoDeps.fetch = undefined;
  });

  beforeAll(async () => {
    ({ sql } = await import("./db"));
    api = await import("./api");
    repo = await import("./repo");
    await (await import("./db")).migrate();
    await sql`DELETE FROM companies WHERE nom LIKE 'TEST-%'`;
    await sql`DELETE FROM login_attempts`;
    await sql`DELETE FROM sessions`;
    await sql`DELETE FROM fichiers WHERE name = 'cv.pdf'`;
    const res = await api.handle(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ password: "mot-de-passe-de-test-ok" }) }));
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
    const ok = await login("mot-de-passe-de-test-ok");
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  test("session stockée = empreinte du mot de passe + jeton, jamais le jeton brut", async () => {
    const ok = await login("mot-de-passe-de-test-ok");
    const cookieToken = ok.headers.get("set-cookie")!.match(/openalternance=([^;]+)/)![1]!;
    const [row] = await sql<{ token: string }[]>`SELECT token FROM sessions WHERE token LIKE ${`%.${cookieToken}`}`;
    expect(row?.token).toBe(`${fingerprint("mot-de-passe-de-test-ok")}.${cookieToken}`);
    expect(row?.token).not.toBe(cookieToken);
  });

  test("session liée à un ancien mot de passe -> 401", async () => {
    const oldPrefix = fingerprint("un-ancien-mot-de-passe");
    expect(oldPrefix).not.toBe(fingerprint("mot-de-passe-de-test-ok"));
    await sql`INSERT INTO sessions (token, created_at) VALUES (${`${oldPrefix}.ancien`}, ${new Date().toISOString()})`;
    const res = await auth("/api/state", { headers: { cookie: "openalternance=ancien" } });
    expect(res.status).toBe(401);
  });

  test("le mot de passe n'apparaît jamais dans la réponse", async () => {
    const res = await login("mot-de-passe-de-test-ok");
    expect(await res.text()).not.toContain("mot-de-passe-de-test-ok");
  });

  test("le cookie ouvre l'état", async () => {
    expect((await auth("/api/state")).status).toBe(200);
  });

  test("logout révoque le cookie copié", async () => {
    expect((await auth("/api/logout", { method: "POST" })).status).toBe(200);
    expect((await auth("/api/state")).status).toBe(401);
    cookie = (await login("mot-de-passe-de-test-ok")).headers.get("set-cookie")!.split(";")[0]!;
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
    const res = await auth("/api/fiches");
    expect(res.headers.get("content-type")).toContain("application/json");
    const fiches = (await res.json()) as { nom: string; notes: string }[];
    expect(fiches.find((c) => c.nom === "TEST-xss")?.notes).toBe(payload);
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

  const PDF_B64 = Buffer.from("%PDF-1.4\n%test\n").toString("base64");

  test("document PDF: stocké tel quel, format pdf, hors liste PDF importés", async () => {
    const res = await auth("/api/document-pdf", { method: "POST", body: JSON.stringify({ titre: "docpdftest", data: PDF_B64 }) });
    expect(res.status).toBe(200);
    const state = (await res.json()) as { documents: { name: string; format: string }[]; pdfs: string[] };
    expect(state.documents).toContainEqual({ name: "docpdftest.pdf", format: "pdf" });
    expect(state.pdfs).not.toContain("docpdftest.pdf");
    expect(state.pdfs).not.toContain("doc-docpdftest.pdf");
    expect(await repo.hasFichier("docpdftest.pdf")).toBe(false);
    expect(await repo.hasFichier("doc-docpdftest.pdf")).toBe(true);
    const served = await auth("/api/fichiers/docpdftest.pdf");
    expect(served.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await served.arrayBuffer()).toString("latin1")).toBe("%PDF-1.4\n%test\n");
  });

  test("document PDF: titre déjà pris -> 400", async () => {
    const res = await auth("/api/document-pdf", { method: "POST", body: JSON.stringify({ titre: "docpdftest", data: PDF_B64 }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Document déjà existant/);
  });

  test("document PDF: titre collisionnant avec un PDF de lettre -> 400, rien écrit", async () => {
    await repo.writeFichier("lettre-xxx.pdf", new Uint8Array(Buffer.from("%PDF-1.4\n%lettre\n")));
    const res = await auth("/api/document-pdf", { method: "POST", body: JSON.stringify({ titre: "lettre-xxx", data: PDF_B64 }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Document déjà existant/);
    const state = (await (await auth("/api/state")).json()) as { documents: { name: string }[]; pdfs: string[] };
    expect(state.documents.map((doc) => doc.name)).not.toContain("lettre-xxx.pdf");
    expect(state.pdfs).toContain("lettre-xxx.pdf");
    await sql`DELETE FROM fichiers WHERE name = 'lettre-xxx.pdf'`;
  });

  test("document PDF: supprimer le document supprime le fichier", async () => {
    await auth("/api/document-supprimer", { method: "POST", body: JSON.stringify({ name: "docpdftest.pdf" }) });
    expect((await auth("/api/fichiers/docpdftest.pdf")).status).toBe(404);
    expect(await repo.hasFichier("doc-docpdftest.pdf")).toBe(false);
  });

  test("CV: non PDF -> 400, rien écrit", async () => {
    const res = await auth("/api/cv", { method: "POST", body: JSON.stringify({ data: "aGVsbG8=" }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("fichier PDF invalide");
    expect((await auth("/api/cv.pdf")).status).toBe(404);
  });

  test("CV: PDF -> servi, absent de PDF importés", async () => {
    const res = await auth("/api/cv", { method: "POST", body: JSON.stringify({ data: PDF_B64 }) });
    expect(res.status).toBe(200);
    const state = (await res.json()) as { pdfs: string[]; cv: boolean };
    expect(state.cv).toBe(true);
    expect(state.pdfs).not.toContain("cv.pdf");
    expect((await auth("/api/cv.pdf")).status).toBe(200);
  });

  test("enregistrer un document ou une lettre vidés -> 200, contenu vide", async () => {
    await auth("/api/document", { method: "POST", body: JSON.stringify({ titre: "vide-test", format: "md", content: "x" }) });
    const doc = await auth("/api/document-modifier", { method: "POST", body: JSON.stringify({ name: "vide-test.md", content: "" }) });
    expect(doc.status).toBe(200);
    expect(((await (await auth("/api/documents/vide-test.md")).json()) as { content: string }).content).toBe("");
    await sql`DELETE FROM documents WHERE name = 'vide-test.md'`;
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-lettre-vide" }) });
    const lettre = await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-lettre-vide", content: "" }) });
    expect(lettre.status).toBe(200);
  });

  test("lettre sans clé content -> 400, contenu intact", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-sans-content" }) });
    await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-sans-content", content: "texte" }) });
    expect((await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-sans-content" }) })).status).toBe(400);
    expect(((await (await auth("/api/lettres/test-sans-content.md")).json()) as { content: string }).content).toBe("texte\n");
  });

  test("lettre enregistrée par son fichier, même orpheline ou au frontmatter vidé", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-par-fichier" }) });
    await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-par-fichier", content: "a" }) });
    const save = (file: string, content: string) => auth("/api/lettre", { method: "POST", body: JSON.stringify({ file, content }) });
    expect((await save("test-par-fichier.md", "")).status).toBe(200);
    expect((await save("test-par-fichier.md", "b")).status).toBe(200);
    expect(((await (await auth("/api/lettres/test-par-fichier.md")).json()) as { content: string }).content).toBe("b\n");
    expect((await save("_template.md", "x")).status).toBe(400);
    expect((await save("../x.md", "x")).status).toBe(400);
    expect((await save("test-inconnue.md", "x")).status).toBe(400);
    expect(await repo.readLettre("test-inconnue.md")).toBeNull();
  });

  test("lettre orpheline (entreprise supprimée): supprimée par son fichier", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-orph-suppr" }) });
    await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-orph-suppr", content: "lettre" }) });
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-orph-suppr" }) });
    const res = await auth("/api/lettre-supprimer", { method: "POST", body: JSON.stringify({ file: "test-orph-suppr.md" }) });
    expect(res.status).toBe(200);
    expect((await auth("/api/lettres/test-orph-suppr.md")).status).toBe(404);
  });

  test("lettre d'un poste: réponse porte le fichier créé, suffixe -id si le nom est pris", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-collision" }) });
    const addDev = async () => {
      await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-collision", intitule: "Dev" }) });
      const state = (await (await auth("/api/state")).json()) as { postes: { id: number; intitule: string }[] };
      return Math.max(...state.postes.filter((p) => p.intitule === "Dev").map((p) => p.id));
    };
    const letter = (poste: number) =>
      auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: "TEST-collision", poste: String(poste), content: "a" }) });
    const first = await addDev();
    expect(((await (await letter(first)).json()) as { file: string }).file).toBe("test-collision-dev.md");
    await auth("/api/poste-supprimer", { method: "POST", body: JSON.stringify({ id: String(first) }) });
    const second = await addDev();
    expect(((await (await letter(second)).json()) as { file: string }).file).toBe(`test-collision-dev-${second}.md`);
  });

  test("template de lettre: suppression refusée", async () => {
    const res = await auth("/api/lettre-supprimer", { method: "POST", body: JSON.stringify({ file: "_template.md" }) });
    expect(res.status).toBe(400);
  });

  test("logo: adresse interne refusée (SSRF), fiche non enregistrée", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-ssrf" }) });
    const res = await auth("/api/fiche", { method: "POST", body: JSON.stringify({ entreprise: "TEST-ssrf", logo: "http://127.0.0.1:9/x.png" }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/interne/);
    const state = (await (await auth("/api/state")).json()) as { companies: { nom: string; logo: string | null }[] };
    expect(state.companies.find((c) => c.nom === "TEST-ssrf")?.logo).toBeNull();
  });

  test("logo d'une entreprise sans fichier stocké: récupéré puis servi", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    logoDeps.lookup = async () => ["93.184.216.34"];
    logoDeps.fetch = async () => new Response(png);
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-logo-ancien" }) });
    await sql`UPDATE companies SET logo = 'https://logo.example/a.png' WHERE nom = 'TEST-logo-ancien'`;
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE nom = 'TEST-logo-ancien'`;
    const res = await auth(`/api/logos/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await repo.hasFichier(`logo-${id}`)).toBe(true);
  });

  test("logo injoignable: un seul essai, pas de nouvelle récupération à chaque GET", async () => {
    let calls = 0;
    logoDeps.lookup = async () => ["93.184.216.34"];
    logoDeps.fetch = async () => (calls++, new Response(null, { status: 500 }));
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-logo-ko" }) });
    await sql`UPDATE companies SET logo = 'https://logo.example/ko.png' WHERE nom = 'TEST-logo-ko'`;
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE nom = 'TEST-logo-ko'`;
    await auth(`/api/logos/${id}`);
    await auth(`/api/logos/${id}`);
    expect(calls).toBe(1);
  });

  test("entreprise supprimée -> son logo stocké aussi", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-logo-suppr" }) });
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE nom = 'TEST-logo-suppr'`;
    await repo.writeFichier(`logo-${id}`, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-logo-suppr" }) });
    expect(await repo.hasFichier(`logo-${id}`)).toBe(false);
  });

  test("logo stocké: servi par son type sniffé, même origine", async () => {
    await repo.writeFichier("logo-999999", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const res = await auth("/api/logos/999999");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    await sql`DELETE FROM fichiers WHERE name = 'logo-999999'`;
    expect((await auth("/api/logos/../etc")).status).toBe(404);
  });

  test("document-texte: PDF absent -> 400", async () => {
    const res = await auth("/api/document-texte", { method: "POST", body: JSON.stringify({ name: "absent.pdf" }) });
    expect(res.status).toBe(400);
  });

  test("rate limit: 10 échecs puis 429", async () => {
    await sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 10; i++) await login("raté");
    expect((await login("mot-de-passe-de-test-ok")).status).toBe(429);
    await sql`DELETE FROM login_attempts`;
  });

  test("rate limit: X-Forwarded-For ignoré hors Vercel (clé = adresse du socket)", async () => {
    await sql`DELETE FROM login_attempts`;
    const attempt = (xff: string) =>
      api.handle(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN, "x-forwarded-for": xff }, body: JSON.stringify({ password: "raté" }) }), "9.9.9.9");
    for (let i = 0; i < 10; i++) await attempt(`1.1.1.${i}`);
    expect((await attempt("2.2.2.2")).status).toBe(429);
    await sql`DELETE FROM login_attempts`;
  });

  test("connexion réussie efface les échecs de l'IP", async () => {
    await sql`DELETE FROM login_attempts`;
    for (let i = 0; i < 3; i++) await login("raté");
    expect((await login("mot-de-passe-de-test-ok")).status).toBe(200);
    const [{ n }] = await sql<{ n: number | string }[]>`SELECT count(*) AS n FROM login_attempts`;
    expect(Number(n)).toBe(0);
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

  // Base after migrate() only, as the desktop app runs it (no CLI setup).
  test("parcours sur base neuve: entreprise, contact, échange, lettre depuis le template, envoi", async () => {
    const nom = "TEST-parcours";
    const post = (action: string, body: object) => auth(`/api/${action}`, { method: "POST", body: JSON.stringify(body) });
    expect((await post("entreprise", { nom, ville: "Lyon" })).status).toBe(200);
    expect((await post("personne", { entreprise: nom, nom: "TEST-Recruteur" })).status).toBe(200);
    expect((await post("echange", { entreprise: nom, type: "appel", note: "premier contact" })).status).toBe(200);

    const template = await auth("/api/lettres/_template.md");
    expect(template.status).toBe(200);
    const { content } = (await template.json()) as { content: string };
    expect(content).toContain("type: template-lettre");
    const draft = content.replace("type: template-lettre", `type: lettre\nentreprise: ${nom}\nstatut: brouillon`);
    expect((await post("lettre", { entreprise: nom, content: draft })).status).toBe(200);
    expect((await post("lettre-statut", { entreprise: nom, statut: "envoyee", date: "2026-11-04" })).status).toBe(200);

    const state = (await (await auth("/api/state")).json()) as {
      companies: { nom: string; statut: string }[];
      contacts: { nom: string }[];
      interactions: { nom: string; type: string }[];
      lettres: { file: string; entreprise: string; statut: string }[];
    };
    const lettre = state.lettres.find((l) => l.entreprise === nom);
    expect(state.companies.find((c) => c.nom === nom)?.statut).toBe("contacte");
    expect(state.contacts.some((k) => k.nom === "TEST-Recruteur")).toBe(true);
    expect(state.interactions.filter((i) => i.nom === nom).map((i) => i.type).sort()).toEqual(["appel", "candidature"]);
    expect(lettre?.statut).toBe("envoyee");
    await post("lettre-supprimer", { file: lettre?.file });
  });

  test("entreprise-supprimer inconnue -> 400", async () => {
    const res = await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-inconnue" }) });
    expect(res.status).toBe(400);
  });

  test("state: liste légère sans champs de fiche; fiche complète par id et en bloc", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-fiche" }) });
    await auth("/api/fiche", { method: "POST", body: JSON.stringify({ entreprise: "TEST-fiche", note_google: "4,5" }) });
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE nom = 'TEST-fiche'`;
    const state = (await (await auth("/api/state")).json()) as { companies: Record<string, unknown>[] };
    const lean = state.companies.find((c) => c.nom === "TEST-fiche")!;
    expect(lean).not.toHaveProperty("note_google");
    expect(lean).not.toHaveProperty("notes");
    const one = await auth(`/api/fiches/${id}`);
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ id, nom: "TEST-fiche", note_google: "4,5" });
    const all = (await (await auth("/api/fiches")).json()) as { nom: string; note_google: string | null }[];
    expect(all.find((c) => c.nom === "TEST-fiche")?.note_google).toBe("4,5");
    expect((await auth("/api/fiches/999999")).status).toBe(404);
  });

  type Etat = {
    postes: { id: number; intitule: string; contrat: string; annonce: string | null; agence_id: number | null }[];
    agences: { id: number; ville: string }[];
    interactions: { nom: string; type: string; poste_id: number | null }[];
  };
  const etat = async () => (await (await auth("/api/state")).json()) as Etat;
  const posteDe = async (nom: string) => {
    const [row] = await sql<{ id: number }[]>`SELECT p.id FROM postes p JOIN companies c ON c.id = p.company_id WHERE c.nom = ${nom} ORDER BY p.id DESC LIMIT 1`;
    return row!.id;
  };

  test("poste: créer, modifier, supprimer -> état à jour", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-postes" }) });
    const cree = await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-postes", intitule: "Dev", contrat: "stage", annonce: "https://x.example/dev" }) });
    expect(cree.status).toBe(200);
    const id = await posteDe("TEST-postes");
    expect((await etat()).postes.find((p) => p.id === id)).toMatchObject({ intitule: "Dev", contrat: "stage", annonce: "https://x.example/dev" });
    const modifie = await auth("/api/poste-modifier", { method: "POST", body: JSON.stringify({ id: String(id), intitule: "Data", contrat: "cdi" }) });
    expect(modifie.status).toBe(200);
    expect((await etat()).postes.find((p) => p.id === id)).toMatchObject({ intitule: "Data", contrat: "cdi" });
    expect((await auth("/api/poste-supprimer", { method: "POST", body: JSON.stringify({ id: String(id) }) })).status).toBe(200);
    expect((await etat()).postes.some((p) => p.id === id)).toBe(false);
  });

  test("poste: contrat hors liste ou annonce non http -> 400", async () => {
    const contrat = await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-postes", intitule: "X", contrat: "freelance" }) });
    expect(contrat.status).toBe(400);
    const annonce = await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-postes", intitule: "X", annonce: "javascript:alert(1)" }) });
    expect(annonce.status).toBe(400);
  });

  test("échange avec un poste d'une autre entreprise -> 400", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-poste-a" }) });
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-poste-b" }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-poste-a", intitule: "Dev" }) });
    const res = await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-poste-b", type: "mail", poste: String(await posteDe("TEST-poste-a")) }) });
    expect(res.status).toBe(400);
  });

  test("poste supprimé -> ses échanges restent, sans poste", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-poste-suppr" }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-poste-suppr", intitule: "Dev" }) });
    const id = await posteDe("TEST-poste-suppr");
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: "TEST-poste-suppr", type: "mail", poste: String(id) }) });
    expect((await etat()).interactions.find((i) => i.nom === "TEST-poste-suppr")?.poste_id).toBe(id);
    await auth("/api/poste-supprimer", { method: "POST", body: JSON.stringify({ id: String(id) }) });
    expect((await etat()).interactions.find((i) => i.nom === "TEST-poste-suppr")?.poste_id).toBeNull();
  });

  test("lettre par poste: un fichier et une candidature par poste, renommage suit toutes les lettres", async () => {
    const nom = "TEST-grizzlead";
    const lettreDe = (poste: number) =>
      auth("/api/lettre", {
        method: "POST",
        body: JSON.stringify({ entreprise: nom, poste: String(poste), content: `---\ntype: lettre\nentreprise: ${nom}\nstatut: brouillon\n---\n\nx` }),
      });
    const lettresDe = async (entreprise: string) =>
      ((await (await auth("/api/state")).json()) as { lettres: { file: string; entreprise: string; poste?: number }[] }).lettres.filter((l) => l.entreprise === entreprise);
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "Dev Web" }) });
    const web = await posteDe(nom);
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "Data" }) });
    const data = await posteDe(nom);
    expect((await lettreDe(web)).status).toBe(200);
    expect((await lettreDe(data)).status).toBe(200);
    const lettres = await lettresDe(nom);
    expect(lettres.find((l) => l.poste === web)?.file).toBe("test-grizzlead-dev-web.md");
    expect(lettres.find((l) => l.poste === data)?.file).toBe("test-grizzlead-data.md");
    const envoyer = (poste: number) =>
      auth("/api/lettre-statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "envoyee", date: "2026-10-01", poste: String(poste) }) });
    expect((await envoyer(web)).status).toBe(200);
    expect((await envoyer(data)).status).toBe(200);
    const candidatures = (await etat()).interactions.filter((i) => i.nom === nom && i.type === "candidature");
    expect(candidatures.map((i) => i.poste_id).sort()).toEqual([web, data].sort());
    expect((await auth("/api/entreprise-renommer", { method: "POST", body: JSON.stringify({ entreprise: nom, nom: "TEST-grizzlead-renomme" }) })).status).toBe(200);
    for (const l of await lettresDe("TEST-grizzlead-renomme")) {
      const { content } = (await (await auth(`/api/lettres/${l.file}`)).json()) as { content: string };
      expect(content).toContain("entreprise: TEST-grizzlead-renomme");
    }
    expect(await lettresDe("TEST-grizzlead-renomme")).toHaveLength(2);
    await auth("/api/entreprise-supprimer", { method: "POST", body: JSON.stringify({ entreprise: "TEST-grizzlead-renomme" }) });
  });

  test("fusion Grizzlead Rennes -> Auray", async () => {
    const rennes = "TEST-grizzlead-rennes";
    const auray = "TEST-grizzlead-auray";
    const post = (path: string, body: object) => auth(path, { method: "POST", body: JSON.stringify(body) });
    await post("/api/entreprise", { nom: rennes, ville: "Rennes" });
    await post("/api/fiche", { entreprise: rennes, ville: "Rennes", adresse: "1 rue TEST", code_postal: "35000", notes: "siège Rennes" });
    await post("/api/entreprise", { nom: auray, ville: "Auray", notes: "siège Auray" });
    await post("/api/personne", { entreprise: rennes, nom: "TEST-contact-rennes" });
    await post("/api/poste", { entreprise: rennes, intitule: "TEST-poste-rennes" });
    const posteRennes = await posteDe(rennes);
    await post("/api/echange", { entreprise: rennes, type: "mail", poste: String(posteRennes), delai: null });
    await post("/api/relance-date", { entreprise: rennes, date: "2030-02-10" });
    await post("/api/lettre", { entreprise: rennes, content: `---\ntype: lettre\nentreprise: ${rennes}\nstatut: brouillon\n---\n\nx` });
    await post("/api/lettre", { entreprise: rennes, poste: String(posteRennes), content: `---\ntype: lettre\nentreprise: ${rennes}\nstatut: brouillon\n---\n\nx` });

    expect((await post("/api/entreprise-fusionner", { source: rennes, cible: rennes })).status).toBe(400);
    expect(await (await post("/api/entreprise-fusionner", { source: rennes, cible: rennes })).text()).toContain("Fusion impossible: même entreprise");

    expect((await post("/api/entreprise-fusionner", { source: rennes, cible: auray })).status).toBe(200);

    const [cible] = await sql<{ id: number; prochaine_relance: string | null }[]>`SELECT id, prochaine_relance FROM companies WHERE nom = ${auray}`;
    expect(await sql`SELECT 1 AS ok FROM companies WHERE nom = ${rennes}`).toHaveLength(0);
    expect((await sql<{ nom: string }[]>`SELECT nom FROM contacts WHERE company_id = ${cible!.id}`).map((c) => c.nom)).toContain("TEST-contact-rennes");
    expect((await sql<{ type: string }[]>`SELECT type FROM interactions WHERE company_id = ${cible!.id} AND poste_id = ${posteRennes}`).map((i) => i.type)).toContain("mail");
    expect((await sql<{ company_id: number }[]>`SELECT company_id FROM postes WHERE id = ${posteRennes}`)[0]?.company_id).toBe(cible!.id);
    expect((await sql<{ ville: string }[]>`SELECT ville FROM agences WHERE company_id = ${cible!.id}`).map((a) => a.ville)).toEqual(["Rennes"]);
    expect(cible!.prochaine_relance).toBe("2030-02-10");

    const lettres = await sql<{ file: string; content: string }[]>`SELECT file, content FROM lettres WHERE file LIKE 'test-grizzlead-rennes%'`;
    expect(lettres).toHaveLength(2);
    for (const l of lettres) expect(l.content).toContain(`entreprise: ${auray}`);

    await post("/api/entreprise-supprimer", { entreprise: auray });
    for (const l of lettres) await post("/api/lettre-supprimer", { file: l.file });
  });

  test("agence: créer, modifier, lier à un poste, supprimer -> poste au siège", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-agences" }) });
    const cree = await auth("/api/agence", { method: "POST", body: JSON.stringify({ entreprise: "TEST-agences", ville: "TEST-Rennes", code_postal: "35000" }) });
    expect(cree.status).toBe(200);
    const agenceId = (await etat()).agences.find((a) => a.ville === "TEST-Rennes")!.id;
    expect((await auth("/api/agence-modifier", { method: "POST", body: JSON.stringify({ id: String(agenceId), ville: "TEST-Lyon" }) })).status).toBe(200);
    expect((await etat()).agences.find((a) => a.id === agenceId)?.ville).toBe("TEST-Lyon");
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-agences", intitule: "Dev", agence: String(agenceId) }) });
    const posteId = await posteDe("TEST-agences");
    expect((await etat()).postes.find((p) => p.id === posteId)?.agence_id).toBe(agenceId);
    await auth("/api/agence-supprimer", { method: "POST", body: JSON.stringify({ id: String(agenceId) }) });
    expect((await etat()).postes.find((p) => p.id === posteId)?.agence_id).toBeNull();
  });

  test("poste avec une agence d'une autre entreprise -> 400", async () => {
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom: "TEST-agence-autre" }) });
    await auth("/api/agence", { method: "POST", body: JSON.stringify({ entreprise: "TEST-agence-autre", ville: "TEST-Nantes" }) });
    const agenceId = (await etat()).agences.find((a) => a.ville === "TEST-Nantes")!.id;
    const res = await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: "TEST-agences", intitule: "X", agence: String(agenceId) }) });
    expect(res.status).toBe(400);
  });

  type Suivi = {
    companies: { nom: string; statut: string; prochaine_relance: string | null; spontanee: { statut: string } }[];
    postes: { id: number; etat: { statut: string; prochaine: string | null } }[];
    interactions: { id: number; nom: string; type: string }[];
  };
  const suivi = async () => (await (await auth("/api/state")).json()) as Suivi;

  test("statut manuel: événement dans l'historique, survit à la suppression d'un échange antérieur", async () => {
    const nom = "TEST-suivi-statut";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "mail", date: "2026-10-01" }) });
    const mail = (await suivi()).interactions.find((i) => i.nom === nom && i.type === "mail")!;
    await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "entretien" }) });
    expect((await suivi()).interactions.some((i) => i.nom === nom && i.type === "statut")).toBe(true);
    await auth("/api/echange-supprimer", { method: "POST", body: JSON.stringify({ id: String(mail.id) }) });
    expect((await suivi()).companies.find((c) => c.nom === nom)?.statut).toBe("entretien");
  });

  test("relance datée puis échange modifié: la relance tient", async () => {
    const nom = "TEST-suivi-relance";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "mail", date: "2026-10-01" }) });
    await auth("/api/relance-date", { method: "POST", body: JSON.stringify({ entreprise: nom, date: "2026-12-01" }) });
    const mail = (await suivi()).interactions.find((i) => i.nom === nom && i.type === "mail")!;
    await auth("/api/echange-modifier", { method: "POST", body: JSON.stringify({ id: String(mail.id), type: "mail", date: "2026-10-01", note: "x" }) });
    expect((await suivi()).companies.find((c) => c.nom === nom)?.prochaine_relance).toBe("2026-12-01");
  });

  test("lettre renvoyée en brouillon: candidature auto retirée, candidature manuelle gardée", async () => {
    const nom = "TEST-suivi-lettre";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/lettre", { method: "POST", body: JSON.stringify({ entreprise: nom, content: `---
type: lettre
entreprise: ${nom}
statut: brouillon
---

x` }) });
    await auth("/api/lettre-statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "envoyee", date: "2026-10-01" }) });
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "candidature", date: "2026-10-01" }) });
    await auth("/api/lettre-statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "brouillon" }) });
    const restantes = await sql<{ auto: string | null }[]>`SELECT i.auto FROM interactions i JOIN companies c ON c.id = i.company_id WHERE c.nom = ${nom} AND i.type = 'candidature'`;
    expect(restantes).toEqual([{ auto: null }]);
  });

  test("poste refusé + poste ouvert: entreprise pas fermée, états par poste", async () => {
    const nom = "TEST-suivi-postes";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "A" }) });
    const a = await posteDe(nom);
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "B" }) });
    const b = await posteDe(nom);
    await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "refuse", poste: String(a) }) });
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "candidature", date: "2026-10-02", poste: String(b) }) });
    const s = await suivi();
    expect(s.companies.find((c) => c.nom === nom)?.statut).toBe("contacte");
    expect(s.postes.find((p) => p.id === a)?.etat.statut).toBe("refuse");
    expect(s.postes.find((p) => p.id === b)?.etat.statut).toBe("contacte");
  });

  test("relance le même jour sur deux pistes: acceptée, doublon refusé par piste", async () => {
    const nom = "TEST-suivi-relance-pistes";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "A" }) });
    const a = String(await posteDe(nom));
    const relance = (poste?: string) =>
      auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "relance", date: "2026-10-05", ...(poste ? { poste } : {}) }) });
    expect((await relance()).status).toBe(200);
    expect((await relance(a)).status).toBe(200);
    expect((await relance(a)).status).toBe(400);
  });

  test("poste supprimé: ses échanges passent en spontanée et l'état est rejoué", async () => {
    const nom = "TEST-suivi-poste-suppr";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "refuse" }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "A" }) });
    const a = await posteDe(nom);
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "candidature", date: "2026-10-02", poste: String(a) }) });
    expect((await suivi()).companies.find((c) => c.nom === nom)?.statut).toBe("contacte");
    await auth("/api/poste-supprimer", { method: "POST", body: JSON.stringify({ id: String(a) }) });
    const company = (await suivi()).companies.find((c) => c.nom === nom)!;
    expect(company.statut).toBe(company.spontanee.statut);
  });

  test("piste spontanée exposée à part de l'agrégat", async () => {
    const nom = "TEST-suivi-spontanee";
    await auth("/api/entreprise", { method: "POST", body: JSON.stringify({ nom }) });
    await auth("/api/poste", { method: "POST", body: JSON.stringify({ entreprise: nom, intitule: "A" }) });
    await auth("/api/echange", { method: "POST", body: JSON.stringify({ entreprise: nom, type: "candidature", date: "2026-10-02", poste: String(await posteDe(nom)) }) });
    const company = async () => (await suivi()).companies.find((c) => c.nom === nom)!;
    expect(await company()).toMatchObject({ statut: "contacte", spontanee: { statut: "a_contacter" } });
    await auth("/api/statut", { method: "POST", body: JSON.stringify({ entreprise: nom, statut: "entretien" }) });
    expect((await company()).spontanee.statut).toBe("entretien");
  });
});

describe("authRequired", () => {
  test("vercel always requires", () => expect(authRequired({ VERCEL: "1" })).toBe(true));
  test("local with password requires", () => expect(authRequired({ OPENALTERNANCE_PASSWORD: "x".repeat(16) })).toBe(true));
  test("local without password is open", () => expect(authRequired({})).toBe(false));
});

// Own process: PASSWORD and VERCEL are read at import.
const openScript = `
if (!process.env.VERCEL) await (await import("./src/db")).migrate();
const { handle } = await import("./src/api");
const spawned = JSON.parse(process.env.SPAWN_REQ!) as { method: string; path: string; headers: Record<string, string> };
const res = await handle(new Request("http://127.0.0.1:3000" + spawned.path, { method: spawned.method, headers: spawned.headers, body: spawned.method === "GET" ? undefined : "{}" }));
console.log(JSON.stringify({ status: res.status, body: await res.text() }));`;
// Postgres URL is a stub: Vercel 500s before any connection.
const spawnApi = async (env: Record<string, string>, request = { method: "GET", path: "/api/state", headers: {} }) => {
  const base: Record<string, string | undefined> = { ...process.env, DATABASE_URL: "sqlite://:memory:", SPAWN_REQ: JSON.stringify(request) };
  delete base.OPENALTERNANCE_PASSWORD;
  delete base.VERCEL;
  const p = Bun.spawn(["bun", "--no-env-file", "-e", openScript], { cwd: join(import.meta.dir, ".."), env: { ...base, ...env }, stdout: "pipe", stderr: "pipe" });
  const out = JSON.parse(await new Response(p.stdout).text()) as { status: number; body: string };
  await p.exited;
  return out;
};

test("sans mot de passe en local: API ouverte sans cookie", async () => {
  const out = await spawnApi({});
  expect(out.status).toBe(200);
});

test("sans mot de passe en local: écriture d'une autre origine -> 403 (CSRF)", async () => {
  const out = await spawnApi({}, { method: "POST", path: "/api/entreprise", headers: { origin: "http://evil.test" } });
  expect(out.status).toBe(403);
});

test("VERCEL sans mot de passe: 500 non configuré", async () => {
  const out = await spawnApi({ VERCEL: "1", DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x" });
  expect(out.status).toBe(500);
  expect(out.body).toContain("non configuré");
});
