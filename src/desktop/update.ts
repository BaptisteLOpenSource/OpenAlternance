import { win32 } from "node:path";

const RELEASES_API = "https://api.github.com/repos/BaptisteLOpenSource/OpenAlternance/releases/latest";
// Only this prefix may ever be downloaded and run as an installer.
const RELEASE_PREFIX ="https://github.com/BaptisteLOpenSource/OpenAlternance/releases/download/";
const SETUP = "OpenAlternance-Setup.exe";

export function isNewer(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Offline or any shape surprise -> null: a failed update check must never block start.
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
    if (typeof url !== "string" || !url.startsWith(RELEASE_PREFIX)) return null;
    return { version: body.tag_name, url };
  } catch {
    return null;
  }
}

export async function installUpdate(url: string, tempDir: string): Promise<void> {
  if (!url.startsWith(RELEASE_PREFIX)) throw new Error("URL de mise à jour refusée");
  const file = win32.join(tempDir, SETUP);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement de la mise à jour échoué (HTTP ${res.status})`);
  await Bun.write(file, res);
  Bun.spawn([file, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  process.exit(0);
}
