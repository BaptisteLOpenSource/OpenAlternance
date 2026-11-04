import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 5_000;
const PRIVATE_V6 = /^(::|64:ff9b:|2002:|2001:0{0,4}:|f[cd]|fe[89a-f]|ff)/i;

type Fetcher = (url: URL, address: string, signal: AbortSignal) => Promise<Response>;
type Deps = { lookup?: (host: string) => Promise<string[]>; fetch?: Fetcher };

export const logoDeps: Deps = {};

const lookupAll = async (host: string) => (await lookup(host, { all: true })).map((entry) => entry.address);

function isPrivate(address: string): boolean {
  if (isIP(address) === 6) return PRIVATE_V6.test(address);
  const [a, b, c] = address.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c <= 2 && c !== 1) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

// Magic bytes only: the type we serve comes from the content, never from the remote header.
export function logoType(bytes: Uint8Array): string | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (head.startsWith("GIF8")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  if (/^\s*(<svg[\s>]|<\?xml[\s\S]*?<svg[\s>])/.test(head)) return "image/svg+xml";
  return null;
}

// Connects to the address already checked: no second DNS resolution to rebind. TLS still verifies the hostname.
export const pinnedFetch: Fetcher = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const family = isIP(address);
    const pin = (_host: string, options: { all?: boolean }, done: (...args: unknown[]) => void) =>
      options.all ? done(null, [{ address, family }]) : done(null, address, family);
    const request = (url.protocol === "https:" ? https : http).request(url, { signal, lookup: pin as never }, (res) => {
      const status = res.statusCode ?? 502;
      if (status < 200 || status > 299 || status === 204 || status === 205) {
        res.destroy();
        return resolve(new Response(null, { status }));
      }
      const headers = new Headers();
      if (res.headers["content-length"]) headers.set("content-length", res.headers["content-length"]);
      resolve(new Response(Readable.toWeb(res) as unknown as ReadableStream, { status, headers }));
    });
    request.on("error", reject);
    request.end();
  });

async function readCapped(res: Response): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length")) > MAX_BYTES) {
    await res.body?.cancel();
    throw new Error("logo trop lourd (1 Mo max)");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (!reader) throw new Error("format d'image non reconnu");
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    total += part.value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("logo trop lourd (1 Mo max)");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

export async function fetchLogo(url: string, given: Deps = {}): Promise<Uint8Array> {
  const deps = { ...logoDeps, ...given };
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("logo: http(s) seulement");
  const addresses = await (deps.lookup ?? lookupAll)(target.hostname);
  if (addresses.length === 0 || addresses.some(isPrivate)) throw new Error("logo: adresse interne refusée");
  const res = await (deps.fetch ?? pinnedFetch)(target, addresses[0]!, AbortSignal.timeout(TIMEOUT_MS));
  if (!res.ok) throw new Error(`logo inaccessible: HTTP ${res.status}`);
  const bytes = await readCapped(res);
  if (!logoType(bytes)) throw new Error("format d'image non reconnu");
  return bytes;
}
