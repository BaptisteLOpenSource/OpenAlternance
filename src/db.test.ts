import { expect, test } from "bun:test";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootError, resolveDb, schema } from "./db";

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

test("sqlite file is private to the owner", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-"));
  const file = join(dir, "nested", "x.db");
  const p = Bun.spawn(["bun", "-e", 'const { migrate } = await import("./src/db"); await migrate();'], {
    env: { ...process.env, DATABASE_URL: `sqlite://${file}` },
  });
  expect(await p.exited).toBe(0);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(statSync(join(dir, "nested")).mode & 0o777).toBe(0o700);
});
