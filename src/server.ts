#!/usr/bin/env bun
import { handle } from "./api";
import index from "./web/index.html";

const PORT = Number(process.env.PORT ?? 3000);

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

// Local dev only: Vercel serves dist/ (built by scripts/build.ts) for these files.
const PUBLIC_DIR = "src/web/public";
const PUBLIC_FILE = /^\/[\w.-]+\.(svg|png|webmanifest|js)$/;

async function publicFile(path: string): Promise<Response> {
  const file = Bun.file(PUBLIC_DIR + path);
  return (await file.exists()) ? new Response(file) : Response.json({ error: "Introuvable" }, { status: 404 });
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  idleTimeout: 0,
  routes: { "/": index },
  fetch(req, server) {
    // DNS rebinding: a hostile domain resolving to 127.0.0.1 sends its own Host.
    if (!ALLOWED_HOSTS.has(req.headers.get("host") ?? "")) return new Response("Forbidden", { status: 403 });
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && PUBLIC_FILE.test(path)) return publicFile(path);
    return handle(req, server.requestIP(req)?.address);
  },
});

console.log(`dashboard: http://127.0.0.1:${PORT}`);
