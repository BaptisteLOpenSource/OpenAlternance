import { win32 } from "node:path";

export type DesktopConfig = { mode: "local" | "online"; databaseUrl?: string; databaseUrlProtected?: string };
export type DesktopPaths = { config: string; data: string; db: string; backups: string; log: string };

// win32.join: backslashes whatever the host OS, the desktop app only runs on Windows.
export function desktopPaths(env: Record<string, string | undefined>): DesktopPaths {
  const config = win32.join(env.APPDATA ?? "", "OpenAlternance", "config.json");
  const data = win32.join(env.LOCALAPPDATA ?? "", "OpenAlternance");
  return {
    config,
    data,
    db: win32.join(data, "openalternance.db"),
    backups: win32.join(data, "backups"),
    log: win32.join(data, "openalternance.log"),
  };
}

// Secret goes on stdin, never argv (visible in process listings).
async function powershell(script: string, input: string): Promise<string> {
  const proc = Bun.spawn(
    ["powershell", "-NoProfile", "-NonInteractive", "-Command", `[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;${script}`],
    { stdin: new Blob([input]), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`DPAPI (powershell) a échoué: ${err.trim()}`);
  return out.replace(/\r?\n$/, "");
}

export function protect(text: string): Promise<string> {
  return powershell(
    "$s=[Console]::In.ReadToEnd();ConvertFrom-SecureString (ConvertTo-SecureString -String $s -AsPlainText -Force)",
    text,
  );
}

export function unprotect(blob: string): Promise<string> {
  return powershell(
    "$ss=ConvertTo-SecureString -String ([Console]::In.ReadToEnd());$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}",
    blob,
  );
}

async function readConfig(path: string): Promise<DesktopConfig | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? ((await file.json()) as DesktopConfig) : null;
}

export async function resolveDatabaseUrl(paths: DesktopPaths): Promise<string> {
  const local = `sqlite://${paths.db}`;
  const cfg = await readConfig(paths.config);
  if (!cfg || cfg.mode === "local") return local;
  if (cfg.databaseUrl) {
    const url = cfg.databaseUrl;
    const { databaseUrl: _plain, ...rest } = cfg;
    await Bun.write(paths.config, JSON.stringify({ ...rest, databaseUrlProtected: await protect(url) }, null, 2));
    return url;
  }
  if (cfg.databaseUrlProtected) return unprotect(cfg.databaseUrlProtected);
  throw new Error("Clé Neon absente: relance l'installeur (voir guide)");
}
