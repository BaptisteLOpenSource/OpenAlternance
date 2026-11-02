import { expect, test } from "bun:test";

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
