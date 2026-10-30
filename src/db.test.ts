import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDb, schema } from "./db";

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
