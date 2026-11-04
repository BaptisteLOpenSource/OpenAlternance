import { lookup } from "node:dns/promises";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 5_000;
const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:|f[cd]|fe80:)/i;

type Deps = { lookup?: (host: string) => Promise<string[]>; fetch?: typeof fetch };

export const logoDeps: Deps = {};

const lookupAll = async (host: string) => (await lookup(host, { all: true })).map((entry) => entry.address);

// Magic bytes only: the type we serve comes from the content, never from the remote header.
export function logoType(bytes: Uint8Array): string | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (head.startsWith("GIF8")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  if (/<svg[\s>]/.test(head)) return "image/svg+xml";
  return null;
}

// ponytail: DNS checked, then fetched again; a rebinding race is possible. Pin the IP if the logo feature grows.
export async function fetchLogo(url: string, given: Deps = {}): Promise<Uint8Array> {
  const deps = { ...logoDeps, ...given };
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("logo: http(s) seulement");
  if ((await (deps.lookup ?? lookupAll)(target.hostname)).some((address) => PRIVATE.test(address))) throw new Error("logo: adresse interne refusée");
  const res = await (deps.fetch ?? fetch)(target, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`logo inaccessible: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("logo trop lourd (1 Mo max)");
  if (!logoType(bytes)) throw new Error("format d'image non reconnu");
  return bytes;
}
