import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopPaths, protect, resolveDatabaseUrl, unprotect } from "./config";

const dirs: string[] = [];
function tempEnv() {
  const dir = mkdtempSync(join(tmpdir(), "oa-cfg-"));
  dirs.push(dir);
  const paths = desktopPaths({ APPDATA: join(dir, "roaming"), LOCALAPPDATA: join(dir, "local") });
  mkdirSync(join(dir, "roaming", "OpenAlternance"), { recursive: true });
  return { paths, dir };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("desktopPaths builds win32 paths from APPDATA and LOCALAPPDATA", () => {
  expect(desktopPaths({ APPDATA: "A", LOCALAPPDATA: "L" }).db).toEndWith("L\\OpenAlternance\\openalternance.db");
});

test.skipIf(process.platform !== "win32")("protect/unprotect round-trips through DPAPI", async () => {
  const url = "postgresql://u:p@h/db";
  expect(await unprotect(await protect(url))).toBe(url);
});

test.skipIf(process.platform !== "win32")("plaintext databaseUrl is protected and removed from the file", async () => {
  const { paths } = tempEnv();
  const url = "postgresql://u:p@h/db";
  await Bun.write(paths.config, JSON.stringify({ mode: "online", databaseUrl: url }));
  expect(await resolveDatabaseUrl(paths)).toBe(url);
  const saved = JSON.parse(readFileSync(paths.config, "utf8"));
  expect(saved.databaseUrl).toBeUndefined();
  expect(saved.mode).toBe("online");
  expect(await unprotect(saved.databaseUrlProtected)).toBe(url);
  expect(existsSync(`${paths.config}.tmp`)).toBe(false);
  expect(await resolveDatabaseUrl(paths)).toBe(url);
});

test("malformed config throws without echoing content", async () => {
  const { paths } = tempEnv();
  await Bun.write(paths.config, "{not json");
  await expect(resolveDatabaseUrl(paths)).rejects.toThrow(/Configuration illisible/);
});

test("missing config means local sqlite, no file created", async () => {
  const { paths } = tempEnv();
  expect(await resolveDatabaseUrl(paths)).toBe(`sqlite://${paths.db}`);
  expect(await Bun.file(paths.config).exists()).toBe(false);
});

test("online without any url throws", async () => {
  const { paths } = tempEnv();
  await Bun.write(paths.config, JSON.stringify({ mode: "online" }));
  await expect(resolveDatabaseUrl(paths)).rejects.toThrow(/Clé Neon absente/);
});
