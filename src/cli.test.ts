import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Own process: the seed must never reach a TEST_DATABASE_URL shared with other test files.
const script = `
const { setup } = await import("./src/setup");
const repo = await import("./src/repo");
const first = await setup();
const second = await setup();
console.log(JSON.stringify({ first, second, companies: (await repo.listCompanies()).length, docs: (await repo.listDocuments()).map((d) => d.name) }));`;

test("setup seeds example data once", async () => {
  const p = Bun.spawn(["bun", "-e", script], { env: { ...process.env, DATABASE_URL: "sqlite://:memory:" }, stdout: "pipe", stderr: "inherit" });
  const out = JSON.parse(await new Response(p.stdout).text());
  expect(await p.exited).toBe(0);
  expect(out.first).toEqual({ migrated: true, seeded: true });
  expect(out.second.seeded).toBe(false);
  expect(out.companies).toBe(3);
  expect(out.docs).toContain("cv-exemple.md");
});

test("sync-files skips doc- pdfs so they never overwrite stored documents", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-sync-"));
  mkdirSync(join(dir, "lettres"));
  writeFileSync(join(dir, "lettres", "doc-x.pdf"), "%PDF-evil");
  writeFileSync(join(dir, "lettres", "ok.pdf"), "%PDF-ok");
  const cli = join(import.meta.dir, "cli.ts");
  const env = { ...process.env, DATABASE_URL: `sqlite://${join(dir, "t.db").replaceAll("\\", "/")}` };
  await Bun.spawn(["bun", cli, "migrate"], { cwd: dir, env }).exited;
  const p = Bun.spawn(["bun", cli, "sync-files"], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  expect(await p.exited).toBe(0);
  expect(out).toContain("fichier: ok.pdf");
  expect(out).not.toContain("fichier: doc-x.pdf");
  expect(err).toContain("doc-x.pdf");
  rmSync(dir, { recursive: true });
});
