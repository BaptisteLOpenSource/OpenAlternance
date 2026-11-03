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
