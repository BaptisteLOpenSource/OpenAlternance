import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAIN = join(import.meta.dir, "main.ts");
const ROOT = join(import.meta.dir, "..", "..");

async function untilReady(stdout: ReadableStream<Uint8Array>, line: string): Promise<void> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(line)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`no ready line, got: ${text}`);
    text += decoder.decode(value);
  }
  reader.releaseLock();
}

// Fixed ports collide with orphans of an interrupted run: main.ts sees
// "our server" there and exits 0 silently.
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

async function withApp(config: object | null, run: (base: string) => Promise<void>) {
  const port = freePort();
  const dir = mkdtempSync(join(tmpdir(), "oa-main-"));
  const appdata = join(dir, "roaming");
  const local = join(dir, "local");
  mkdirSync(join(appdata, "OpenAlternance"), { recursive: true });
  if (config) writeFileSync(join(appdata, "OpenAlternance", "config.json"), JSON.stringify(config));
  const proc = Bun.spawn(["bun", MAIN], {
    cwd: ROOT,
    env: {
      ...process.env,
      APPDATA: appdata,
      LOCALAPPDATA: local,
      OPENALTERNANCE_PASSWORD: "",
      VERCEL: "",
      DATABASE_URL: "",
      OPENALTERNANCE_NO_WINDOW: "1",
      OPENALTERNANCE_NO_UPDATE_CHECK: "1",
      OPENALTERNANCE_DESKTOP_PORT: String(port),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    await untilReady(proc.stdout, `desktop: http://127.0.0.1:${port}`);
    await run(`http://127.0.0.1:${port}`);
  } finally {
    proc.kill();
    await proc.exited;
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

test("local mode serves state and info without origin", async () => {
  await withApp(null, async (base) => {
    expect((await fetch(`${base}/api/state`)).status).toBe(200);
    const info = await (await fetch(`${base}/api/desktop/info`)).json();
    expect(info.mode).toBe("local");
    expect(typeof info.version).toBe("string");
  });
}, 30_000);

test("desktop POST rejects foreign origin", async () => {
  await withApp(null, async (base) => {
    const res = await fetch(`${base}/api/desktop/backup`, {
      method: "POST",
      headers: { origin: "http://evil.test" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
}, 30_000);

test("backup refused in local mode", async () => {
  await withApp(null, async (base) => {
    const res = await fetch(`${base}/api/desktop/backup`, { method: "POST", headers: { origin: base } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "sauvegarde: mode en ligne uniquement" });
  });
}, 30_000);

test("update without a known release answers 400", async () => {
  await withApp(null, async (base) => {
    const res = await fetch(`${base}/api/desktop/update`, { method: "POST", headers: { origin: base } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "aucune mise à jour" });
  });
}, 30_000);

// win32 config path; covered by the windows release job.
test.skipIf(process.platform !== "win32")("online without url answers 503 guide on every api route", async () => {
  await withApp({ mode: "online" }, async (base) => {
    const res = await fetch(`${base}/api/state`);
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toMatch(/Clé Neon absente/);
    expect(body).toMatch(/installation-desktop/);
  });
}, 30_000);

test("second instance on same port exits 0", async () => {
  await withApp(null, async (base) => {
    const dir = mkdtempSync(join(tmpdir(), "oa-main2-"));
    try {
      const proc = Bun.spawn(["bun", MAIN], {
        cwd: ROOT,
        env: {
          ...process.env,
          APPDATA: join(dir, "roaming"),
          LOCALAPPDATA: join(dir, "local"),
          OPENALTERNANCE_PASSWORD: "",
          VERCEL: "",
          DATABASE_URL: "",
          OPENALTERNANCE_NO_WINDOW: "1",
          OPENALTERNANCE_NO_UPDATE_CHECK: "1",
          OPENALTERNANCE_DESKTOP_PORT: new URL(base).port,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await proc.exited).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });
}, 60_000);
