#!/usr/bin/env bun
// Static imports stay db-free: db.ts reads DATABASE_URL at import.
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { win32 } from "node:path";
import type { Subprocess } from "bun";
import pkg from "../../package.json";
import { pad } from "../logic";
import { desktopPaths, resolveDatabaseUrl } from "./config";
import { downloadUpdate, isNewer, latestRelease, runInstaller } from "./update";

const PORT = Number(process.env.OPENALTERNANCE_DESKTOP_PORT ?? 3737);
const BASE = `http://127.0.0.1:${PORT}`;
const GUIDE = "https://openalternance.baptisteledev.fr/installation-desktop/";
const IDLE_MS = 60 * 60_000;
const MEMORY_DB = "sqlite://:memory:";
const DB_UNREACHABLE =
  "Base de données injoignable : vérifie ta connexion internet ou ta clé Neon";

const paths = desktopPaths(process.env);
// api.ts reads these at import: auth and Vercel mode must stay off.
delete process.env.OPENALTERNANCE_PASSWORD;
delete process.env.VERCEL;

function log(error: unknown): void {
  mkdirSync(paths.data, { recursive: true });
  const msg = error instanceof Error ? error.message : String(error);
  appendFileSync(paths.log, `${new Date().toISOString()} ${msg}\n`);
}

let startupError: string | null = null;
try {
  process.env.DATABASE_URL = await resolveDatabaseUrl(paths);
} catch (error) {
  log(error);
  startupError = error instanceof Error ? error.message : String(error);
  process.env.DATABASE_URL = MEMORY_DB;
}

const db = await import("../db");
if (!startupError) {
  try {
    await db.migrate();
  } catch (error) {
    // Driver text may carry the Neon host: keep it in the log only.
    log(error);
    startupError = DB_UNREACHABLE;
  }
}

const { startServer } = await import("../server");
const { isTrustedRequest } = await import("../api");
const { backupToSqlite } = await import("../backup");

const mode = process.env.DATABASE_URL?.startsWith("postgres") ? "online" : "local";
// Awaited by /info: the window can load before GitHub answers.
let update: Promise<{ version: string; url: string } | null> = Promise.resolve(null);
let last = Date.now();

const json = (body: unknown, status = 200) => Response.json(body, { status });

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function desktopRoute(req: Request, path: string): Promise<Response> {
  if (req.method === "GET" && path === "/api/desktop/info") {
    return json({ mode, version: pkg.version, update: await update });
  }
  if (req.method === "POST" && path === "/api/desktop/backup") {
    if (!isTrustedRequest(req)) return json({ error: "Forbidden" }, 403);
    if (mode !== "online") return json({ error: "sauvegarde: mode en ligne uniquement" }, 400);
    const file = win32.join(paths.backups, `openalternance-${stamp()}.db`);
    await backupToSqlite(file);
    return json({ file });
  }
  if (req.method === "POST" && path === "/api/desktop/update") {
    if (!isTrustedRequest(req)) return json({ error: "Forbidden" }, 403);
    const latest = await update;
    if (!latest) return json({ error: "aucune mise à jour" }, 400);
    const file = await downloadUpdate(latest.url, tmpdir());
    // ponytail: fixed delay lets the reply flush; ack-based is exact.
    setTimeout(() => {
      try {
        // Stale window would poll a dead server and, sharing the browser
        // profile, swallow the relaunched app's window.
        win?.kill();
        runInstaller(file);
      } catch (error) {
        log(error);
      }
    }, 500);
    return json({ ok: true });
  }
  return json({ error: "Introuvable" }, 404);
}

// Sync null = fall through to api.ts; a Promise<null> would not.
function extra(req: Request, path: string): Promise<Response> | null {
  last = Date.now();
  if (!path.startsWith("/api/")) return null;
  if (startupError) return Promise.resolve(json({ error: `${startupError}. Guide : ${GUIDE}` }, 503));
  if (!path.startsWith("/api/desktop/")) return null;
  return desktopRoute(req, path).catch((error) => {
    log(error);
    return json({ error: "Erreur serveur" }, 500);
  });
}

const embedded = Bun.embeddedFiles as (Blob & { name: string })[];
// Bundler may hash blob names: exact name, then stem-hash.ext.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function embeddedPublicFile(path: string): Promise<Response> {
  const name = path.slice(1);
  const stem = name.replace(/\.\w+$/, "");
  const hashed = new RegExp(`^${escapeRe(stem)}(-\\w+)?${escapeRe(name.slice(stem.length))}$`);
  const blob = embedded.find((b) => b.name === name) ?? embedded.find((b) => hashed.test(b.name));
  return blob ? new Response(blob) : json({ error: "Introuvable" }, 404);
}

// Own profile = own browser process: its exit means the window closed.
function openWindow(url: string): Subprocess | null {
  if (process.env.OPENALTERNANCE_NO_WINDOW) return null;
  const io = { stdin: "ignore", stdout: "ignore", stderr: "ignore" } as const;
  // `start msedge` pops a blocking dialog when Edge is not registered
  const dirs = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const exes = [
    ["Microsoft", "Edge", "Application", "msedge.exe"],
    ["Google", "Chrome", "Application", "chrome.exe"],
    ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
  ];
  const browser = exes
    .flatMap((exe) => dirs.map((dir) => win32.join(dir!, ...exe)))
    .find((exe) => existsSync(exe));
  if (browser) {
    try {
      const profile = `--user-data-dir=${win32.join(paths.data, "browser")}`;
      return Bun.spawn([browser, `--app=${url}`, profile, "--no-first-run"], io);
    } catch (error) {
      log(error);
    }
  }
  Bun.spawn(["cmd", "/c", "start", "", url], io);
  return null;
}

async function isOurServer(): Promise<boolean> {
  // > update check timeout (5s): /info waits on it.
  return fetch(`${BASE}/api/desktop/info`, { signal: AbortSignal.timeout(7000) })
    .then((res) => res.ok)
    .catch(() => false);
}

try {
  startServer({ port: PORT, extra, publicFile: embedded.length > 0 ? embeddedPublicFile : undefined });
} catch (error) {
  const code = (error as { code?: string }).code;
  if (code === "EADDRINUSE" && (await isOurServer())) {
    openWindow(BASE);
    process.exit(0);
  }
  log(error);
  process.exit(1);
}

console.log(`desktop: ${BASE}`);
if (!process.env.OPENALTERNANCE_NO_UPDATE_CHECK) {
  update = latestRelease().then((latest) => (latest && isNewer(latest.version, pkg.version) ? latest : null));
}
const win = openWindow(BASE);
if (win) {
  await win.exited;
  process.exit(0);
}
// No tracked window (no Chromium): idle exit is the only way down.
setInterval(() => {
  if (Date.now() - last > IDLE_MS) process.exit(0);
}, 60_000);
