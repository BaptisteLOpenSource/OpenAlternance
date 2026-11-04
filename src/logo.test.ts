import { describe, expect, test } from "bun:test";
import { fetchLogo, logoType, pinnedFetch } from "./logo";

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

  test("SVG: doit commencer par <svg ou <?xml", () => {
    expect(logoType(bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(logoType(bytes('  \n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(logoType(bytes("<html><body><svg></svg></body></html>"))).toBeNull();
    expect(logoType(bytes("texte puis <svg></svg>"))).toBeNull();
  });
});

describe("fetchLogo", () => {
  const noFetch = () => {
    throw new Error("fetch ne doit pas être appelé");
  };
  const deps = (address: string) => ({ lookup: async () => [address], fetch: noFetch as never });
  const serving = (res: () => Response, seen: { address?: string } = {}) => ({
    lookup: async () => ["93.184.216.34"],
    fetch: (async (_url: URL, address: string) => {
      seen.address = address;
      return res();
    }) as never,
  });

  test("URL non http(s) refusée avant tout appel", async () => {
    await expect(fetchLogo("file:///etc/passwd", deps("1.1.1.1"))).rejects.toThrow(/http/);
  });

  test("adresses internes refusées sans fetch", async () => {
    const internal = [
      "127.0.0.1", "169.254.169.254", "192.168.1.10", "10.0.0.1", "172.16.0.1", "0.0.0.0", "100.64.0.1", "100.127.255.255",
      "198.18.0.1", "198.19.255.255", "224.0.0.1", "239.255.255.255", "255.255.255.255",
      "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fd12::1", "fe80::1", "fec0::1", "ff02::1", "64:ff9b::7f00:1",
      "2002:c000:204::1", "2001::1", "2001:0:4136:e378::1", "192.0.0.1", "192.0.2.5",
    ];
    for (const address of internal) await expect(fetchLogo("http://h/x.png", deps(address))).rejects.toThrow(/interne/);
  });

  test("adresses publiques voisines des plages internes acceptées", async () => {
    for (const address of ["100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "172.32.0.1", "223.255.255.255", "2606:4700::1", "192.0.1.1", "192.0.3.1", "2001:1::1", "2001:4860::1"]) {
      expect(await fetchLogo("https://h/x.png", { ...serving(() => new Response(PNG)), lookup: async () => [address] })).toEqual(PNG);
    }
  });

  test("une adresse interne parmi plusieurs suffit à refuser", async () => {
    const mixed = { lookup: async () => ["93.184.216.34", "10.0.0.1"], fetch: noFetch as never };
    await expect(fetchLogo("http://h/x.png", mixed)).rejects.toThrow(/interne/);
  });

  test("l'adresse validée est celle qui est connectée", async () => {
    const seen: { address?: string } = {};
    expect(await fetchLogo("https://logo.example/x.png", serving(() => new Response(PNG), seen))).toEqual(PNG);
    expect(seen.address).toBe("93.184.216.34");
  });

  test("redirection jamais suivie", async () => {
    const redirect = serving(() => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    await expect(fetchLogo("https://logo.example/x.png", redirect)).rejects.toThrow(/HTTP 302/);
  });

  test("contenu non image -> erreur", async () => {
    await expect(fetchLogo("https://logo.example/x", serving(() => new Response("hello")))).rejects.toThrow(/format d'image non reconnu/);
  });

  test("content-length trop grand -> refusé sans lire le corps", async () => {
    let pulled = false;
    const body = new ReadableStream({ pull: () => void (pulled = true) }, { highWaterMark: 0 });
    const big = serving(() => new Response(body, { headers: { "content-length": "5000000" } }));
    await expect(fetchLogo("https://logo.example/x.png", big)).rejects.toThrow(/trop lourd/);
    expect(pulled).toBe(false);
  });

  test("flux dépassant la limite sans content-length -> coupé", async () => {
    let chunks = 0;
    const body = new ReadableStream({
      pull(controller) {
        chunks++;
        controller.enqueue(new Uint8Array(400_000));
      },
    });
    await expect(fetchLogo("https://logo.example/x.png", serving(() => new Response(body)))).rejects.toThrow(/trop lourd/);
    expect(chunks).toBeLessThan(10);
  });
});

describe("pinnedFetch", () => {
  test("se connecte à l'adresse imposée, sans résoudre le nom", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => new Response(`host=${req.headers.get("host")}`) });
    try {
      const res = await pinnedFetch(new URL(`http://pin.invalid:${server.port}/`), "127.0.0.1", AbortSignal.timeout(3000));
      expect(await res.text()).toBe(`host=pin.invalid:${server.port}`);
    } finally {
      server.stop(true);
    }
  });

  test("redirection renvoyée telle quelle", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 302, headers: { location: "/x" } }) });
    try {
      const res = await pinnedFetch(new URL(`http://pin.invalid:${server.port}/`), "127.0.0.1", AbortSignal.timeout(3000));
      expect(res.status).toBe(302);
    } finally {
      server.stop(true);
    }
  });
});
