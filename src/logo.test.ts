import { describe, expect, test } from "bun:test";
import { fetchLogo, logoType } from "./logo";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const bytes = (text: string) => new TextEncoder().encode(text);

describe("logoType", () => {
  test("reconnaît PNG, JPEG, GIF, WEBP, SVG par leur signature", () => {
    expect(logoType(PNG)).toBe("image/png");
    expect(logoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(logoType(bytes("GIF89a"))).toBe("image/gif");
    expect(logoType(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(logoType(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
  });

  test("texte quelconque -> null", () => {
    expect(logoType(bytes("hello"))).toBeNull();
  });
});

describe("fetchLogo", () => {
  const noFetch = () => {
    throw new Error("fetch ne doit pas être appelé");
  };
  const deps = (address: string) => ({ lookup: async () => [address], fetch: noFetch as unknown as typeof fetch });

  test("URL non http(s) refusée avant tout appel", async () => {
    await expect(fetchLogo("file:///etc/passwd", deps("1.1.1.1"))).rejects.toThrow(/http/);
  });

  test("adresse loopback, lien-local (métadonnées cloud) ou privée refusée sans fetch", async () => {
    await expect(fetchLogo("http://127.0.0.1/x.png", deps("127.0.0.1"))).rejects.toThrow(/interne/);
    await expect(fetchLogo("http://169.254.169.254/", deps("169.254.169.254"))).rejects.toThrow(/interne/);
    await expect(fetchLogo("http://intranet/x.png", deps("192.168.1.10"))).rejects.toThrow(/interne/);
    await expect(fetchLogo("http://v6/x.png", deps("::1"))).rejects.toThrow(/interne/);
  });

  test("image valide -> octets renvoyés, redirection jamais suivie", async () => {
    let seen: RequestInit | undefined;
    const ok = {
      lookup: async () => ["93.184.216.34"],
      fetch: (async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response(PNG, { status: 200 });
      }) as unknown as typeof fetch,
    };
    expect(await fetchLogo("https://logo.example/x.png", ok)).toEqual(PNG);
    expect(seen?.redirect).toBe("manual");
  });

  test("contenu non image -> erreur", async () => {
    const notImage = { lookup: async () => ["93.184.216.34"], fetch: (async () => new Response("hello", { status: 200 })) as unknown as typeof fetch };
    await expect(fetchLogo("https://logo.example/x", notImage)).rejects.toThrow(/format d'image non reconnu/);
  });
});
