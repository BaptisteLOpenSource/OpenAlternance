import { expect, test } from "bun:test";
import { startServer } from "./server";

test("Host inconnu -> 403 (DNS rebinding)", async () => {
  const port = 3290;
  const server = Bun.spawn(["bun", "src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: "sqlite://:memory:" },
    stdout: "pipe",
  });
  try {
    await server.stdout.getReader().read();
    const get = (host: string) => fetch(`http://127.0.0.1:${port}/api/state`, { headers: { host } });
    expect((await get("evil.example")).status).toBe(403);
    expect((await get("evil.example:3290")).status).toBe(403);
    expect((await get(`localhost:${port}`)).status).not.toBe(403);
    expect((await get(`127.0.0.1:${port}`)).status).not.toBe(403);
  } finally {
    server.kill();
  }
});

test("startServer: extra answers, null falls through to handle", async () => {
  const port = 3291;
  const server = startServer({
    port,
    extra: (_req, path) => (path === "/desktop" ? Promise.resolve(new Response("ok")) : null),
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    expect(await (await fetch(`${base}/desktop`)).text()).toBe("ok");
    expect((await fetch(`${base}/api/state`)).status).not.toBe(403);
    expect((await fetch(`${base}/api/state`, { headers: { host: "evil.example" } })).status).toBe(403);
  } finally {
    server.stop(true);
  }
});

test("startServer: en-têtes de sécurité de vercel.json, corps trop gros refusé", async () => {
  const port = 3292;
  const server = startServer({ port });
  try {
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/api/state`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const big = await fetch(`${base}/api/pdf`, { method: "POST", body: "x".repeat(5 * 1024 * 1024) }).catch(() => null);
    expect(big?.status ?? 413).toBe(413);
  } finally {
    server.stop(true);
  }
});
