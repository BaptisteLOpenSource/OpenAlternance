import { win32 } from "node:path";

const RELEASES_API = "https://api.github.com/repos/BaptisteLOpenSource/OpenAlternance/releases/latest";
const SETUP = "OpenAlternance-Setup.exe";
const RELEASE_ASSET = /^\/BaptisteLOpenSource\/OpenAlternance\/releases\/download\/v\d+\.\d+\.\d+\/OpenAlternance-Setup\.exe$/;

// Exact asset path: prefix checks are bypassed by ../ and %2f tricks.
function isReleaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === "https://github.com" && RELEASE_ASSET.test(u.pathname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, "").split(".").map((p) => Number(p.replace(/-.*$/, "")));
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Offline or bad shape -> null: update check must not block start.
export async function latestRelease(fetchFn: typeof fetch = fetch): Promise<{ version: string; url: string } | null> {
  try {
    const res = await fetchFn(RELEASES_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "OpenAlternance-desktop" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: unknown; assets?: unknown };
    if (typeof body.tag_name !== "string" || !Array.isArray(body.assets)) return null;
    const asset = body.assets.find((a: { name?: unknown }) => a?.name === SETUP) as
      | { browser_download_url?: unknown }
      | undefined;
    const url = asset?.browser_download_url;
    if (typeof url !== "string" || !isReleaseUrl(url)) return null;
    return { version: body.tag_name, url: new URL(url).href };
  } catch {
    return null;
  }
}

export async function downloadUpdate(url: string, tempDir: string, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!isReleaseUrl(url)) throw new Error("URL de mise à jour refusée");
  const file = win32.join(tempDir, SETUP);
  const res = await fetchFn(new URL(url).href, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Téléchargement de la mise à jour échoué (HTTP ${res.status})`);
  await Bun.write(file, res);
  return file;
}

export function runInstaller(file: string): void {
  Bun.spawn([file, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).unref();
  process.exit(0);
}
