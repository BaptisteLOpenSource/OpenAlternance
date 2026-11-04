import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootError, isUniqueViolation, resolveDb, schema } from "./db";

test("resolveDb picks the adapter from the url scheme", () => {
  expect(resolveDb(undefined)).toEqual({ dialect: "sqlite", url: "sqlite://data/openalternance.db" });
  expect(resolveDb("sqlite://:memory:").dialect).toBe("sqlite");
  expect(resolveDb("postgresql://u:p@ep-x.neon.tech/db").dialect).toBe("postgres");
  expect(resolveDb("postgres://u:p@ep-x.neon.tech/db").dialect).toBe("postgres");
});

test("schema is portable", () => {
  expect(schema("sqlite").join()).not.toMatch(/IDENTITY|BYTEA|TIMESTAMPTZ|now\(\)/);
  expect(schema("postgres").join()).toContain("GENERATED ALWAYS AS IDENTITY");
});

test("sqlite migrate creates the missing parent directory", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "oa-")), "nested", "x.db");
  const p = Bun.spawn(["bun", "-e", 'const { migrate } = await import("./src/db"); await migrate();'], {
    env: { ...process.env, DATABASE_URL: `sqlite://${file}` },
    stderr: "pipe",
  });
  expect(await p.exited).toBe(0);
  expect(existsSync(file)).toBe(true);
});

test("migrate idempotent, poste legacy backfilled once", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "oa-")), "x.db");
  const script = `
    const { sql, migrate } = await import("./src/db");
    await sql.unsafe("CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL UNIQUE, statut TEXT NOT NULL DEFAULT 'a_contacter', prochaine_relance TEXT, retard INTEGER NOT NULL DEFAULT 0, poste TEXT, publication TEXT, candidatures TEXT, reponses TEXT, annonce TEXT)");
    await sql.unsafe("CREATE TABLE interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, note TEXT, delai INTEGER DEFAULT 7)");
    await sql\`INSERT INTO companies (nom, poste, annonce) VALUES ('MGDIS', 'Dev', 'https://x'), ('Vide', '', NULL)\`;
    await migrate();
    await migrate();
    const postes = await sql\`SELECT intitule, contrat, annonce FROM postes\`;
    const cols = (await sql\`PRAGMA table_info(interactions)\`).map((c) => c.name);
    console.log(JSON.stringify({ postes: [...postes], cols }));
  `;
  const p = Bun.spawn(["bun", "-e", script], { env: { ...process.env, DATABASE_URL: `sqlite://${file}` }, stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  expect(await p.exited, await new Response(p.stderr).text()).toBe(0);
  const { postes, cols } = JSON.parse(out);
  expect(postes).toEqual([{ intitule: "Dev", contrat: "alternance", annonce: "https://x" }]);
  expect(cols).toEqual(expect.arrayContaining(["poste_id", "statut", "prochaine", "auto"]));
});

test("bootError refuse SQLite sur Vercel", () => {
  expect(bootError({ VERCEL: "1" }, "sqlite")).toMatch(/SQLite.*Vercel/);
  expect(bootError({ VERCEL: "1" }, "postgres")).toBeNull();
  expect(bootError({}, "sqlite")).toBeNull();
});

test("import de db sur Vercel sans Postgres échoue avant tout accès disque", async () => {
  const p = Bun.spawn(["bun", "-e", 'await import("./src/db")'], {
    env: { ...process.env, VERCEL: "1", DATABASE_URL: "" },
    stderr: "pipe",
  });
  expect(await p.exited).not.toBe(0);
  expect(await new Response(p.stderr).text()).toMatch(/SQLite impossible sur Vercel/);
});

test.skipIf(process.platform === "win32")("sqlite file is private to the owner", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-"));
  const file = join(dir, "nested", "x.db");
  const p = Bun.spawn(["bun", "-e", 'const { migrate } = await import("./src/db"); await migrate();'], {
    env: { ...process.env, DATABASE_URL: `sqlite://${file}` },
  });
  expect(await p.exited).toBe(0);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(statSync(join(dir, "nested")).mode & 0o777).toBe(0o700);
});

// Bun.SQL Postgres errors carry the SQLSTATE in errno, code is generic.
test("isUniqueViolation reconnaît SQLite et Postgres (Bun)", () => {
  expect(isUniqueViolation({ code: "SQLITE_CONSTRAINT_PRIMARYKEY" })).toBe(true);
  expect(isUniqueViolation({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "23505" })).toBe(true);
  expect(isUniqueViolation({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "23503" })).toBe(false);
});

test("migrate réconcilie un statut posé à la main une seule fois", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "oa-")), "x.db");
  const script = `
    const { sql, migrate } = await import("./src/db");
    const { replayTracks } = await import("./src/logic");
    await migrate();
    await sql\`INSERT INTO companies (nom, statut) VALUES ('MGDIS', 'entretien')\`;
    const [{ id }] = await sql\`SELECT id FROM companies\`;
    await sql\`INSERT INTO interactions (company_id, type, date, delai) VALUES (\${id}, 'candidature', '2026-10-01', 7)\`;
    await migrate();
    await migrate();
    const [company] = await sql\`SELECT statut, prochaine_relance FROM companies\`;
    const events = await sql\`SELECT type, statut FROM interactions WHERE type = 'statut'\`;
    const rows = await sql\`SELECT type, date, delai, poste_id, statut, prochaine FROM interactions ORDER BY date, id\`;
    const replay = replayTracks([...rows], []);
    console.log(JSON.stringify({ company: { ...company }, events: [...events], replay: { statut: replay.statut, prochaine: replay.prochaine } }));
  `;
  const p = Bun.spawn(["bun", "-e", script], { env: { ...process.env, DATABASE_URL: `sqlite://${file}` }, stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  expect(await p.exited, await new Response(p.stderr).text()).toBe(0);
  const { company, events, replay } = JSON.parse(out);
  expect(company).toEqual({ statut: "entretien", prochaine_relance: null });
  expect(events).toEqual([{ type: "statut", statut: "entretien" }]);
  expect(replay).toEqual({ statut: "entretien", prochaine: null });
});
