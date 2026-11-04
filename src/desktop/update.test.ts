import { expect, test } from "bun:test";
import { downloadUpdate, isNewer, latestRelease } from "./update";

const URL_OK = "https://github.com/BaptisteLOpenSource/OpenAlternance/releases/download/v0.2.0/OpenAlternance-Setup.exe";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("isNewer compares numeric parts, ignores leading v", () => {
  expect(isNewer("v0.2.0", "0.1.9")).toBe(true);
  expect(isNewer("0.1.0", "0.1.0")).toBe(false);
  expect(isNewer("0.10.0", "0.9.0")).toBe(true);
});

test("latestRelease returns version and setup asset url", async () => {
  const release = { tag_name: "v0.2.0", assets: [{ name: "OpenAlternance-Setup.exe", browser_download_url: URL_OK }] };
  expect(await latestRelease(fakeFetch(release))).toEqual({ version: "v0.2.0", url: URL_OK });
});

test("latestRelease returns null when fetch throws", async () => {
  const boom = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  expect(await latestRelease(boom)).toBeNull();
});

test("latestRelease returns null on HTTP error", async () => {
  expect(await latestRelease(fakeFetch({ message: "Not Found" }, 404))).toBeNull();
});

test("latestRelease returns null when release has no setup asset", async () => {
  expect(await latestRelease(fakeFetch({ tag_name: "v0.2.0", assets: [] }))).toBeNull();
});

test("latestRelease refuses a download url outside the project releases", async () => {
  const evil = { tag_name: "v0.2.0", assets: [{ name: "OpenAlternance-Setup.exe", browser_download_url: "https://evil.example/x.exe" }] };
  expect(await latestRelease(fakeFetch(evil))).toBeNull();
});

test("downloadUpdate refuses a url outside the project releases", async () => {
  await expect(downloadUpdate("https://evil.example/x.exe", "C:\\tmp")).rejects.toThrow("refusée");
});

test("downloadUpdate rejects on HTTP error so the reply is an error", async () => {
  await expect(downloadUpdate(URL_OK, "C:\\tmp", fakeFetch({ message: "boom" }, 500))).rejects.toThrow("HTTP 500");
});

test("dot-segment traversal and lookalike host are refused by both", async () => {
  const bad = [
    "https://github.com/BaptisteLOpenSource/OpenAlternance/releases/download/../../../../attacker/repo/raw/main/x.exe",
    "https://github.com.evil.example/BaptisteLOpenSource/OpenAlternance/releases/download/v0.2.0/OpenAlternance-Setup.exe",
    "https://github.com/BaptisteLOpenSource/OpenAlternance/releases/download/v0.2.0/..%2f..%2fattacker/x.exe",
  ];
  for (const url of bad) {
    expect(await latestRelease(fakeFetch({ tag_name: "v0.2.0", assets: [{ name: "OpenAlternance-Setup.exe", browser_download_url: url }] }))).toBeNull();
    await expect(downloadUpdate(url, "C:\\tmp")).rejects.toThrow("refusée");
  }
});

test("isNewer ignores prerelease suffix instead of NaN", () => {
  expect(isNewer("0.1.1-beta", "0.1.0")).toBe(true);
  expect(isNewer("0.1.1-beta", "0.1.1")).toBe(false);
});

// Regression: a non-detached child died with the app, update never installed.
test.skipIf(process.platform !== "win32")("runInstaller's installer outlives the app", async () => {
  const { mkdtempSync, existsSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join((await import("node:os")).tmpdir(), "oa-setup-"));
  const marker = join(dir, "installed.txt");
  const setup = join(dir, "setup.cmd");
  writeFileSync(setup, `@ping -n 2 127.0.0.1 >nul\r\n@echo ok> "${marker}"\r\n`);
  const app = Bun.spawn(["bun", "-e", `(await import(${JSON.stringify(import.meta.dir + "/update.ts")})).runInstaller(${JSON.stringify(setup)})`]);
  await app.exited;
  for (let i = 0; i < 50 && !existsSync(marker); i++) await Bun.sleep(100);
  expect(existsSync(marker)).toBe(true);
});
