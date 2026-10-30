import { expect, test } from "bun:test";

process.env.DATABASE_URL = "sqlite://:memory:";
const { setup } = await import("./setup");
const repo = await import("./repo");

test("setup seeds example data once", async () => {
  const first = await setup();
  expect(first).toEqual({ migrated: true, seeded: true });
  const second = await setup();
  expect(second.seeded).toBe(false);
  expect((await repo.listCompanies()).length).toBe(3);
  expect((await repo.listDocuments()).map((d) => d.name)).toContain("cv-exemple.md");
});
