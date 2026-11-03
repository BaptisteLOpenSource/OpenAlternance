#!/usr/bin/env bun
import { handle } from "./api";
import index from "./web/index.html";

// Local dev only: Vercel serves dist/ (built by scripts/build.ts) for these files.
const PUBLIC_DIR = "src/web/public";
const PUBLIC_FILE = /^\/[\w.-]+\.(svg|png|webmanifest|js)$/;

async function readPublicFile(path: string): Promise<Response> {
  const file = Bun.file(PUBLIC_DIR + path);
  return (await file.exists()) ? new Response(file) : Response.json({ error: "Introuvable" }, { status: 404 });
}

export function startServer(opts: {
  port: number;
  extra?: (req: Request, path: string) => Promise<Response> | null;
  publicFile?: (path: string) => Promise<Response>;
}): Bun.Server<undefined> {
  const allowedHosts = new Set([`127.0.0.1:${opts.port}`, `localhost:${opts.port}`]);
  const publicFile = opts.publicFile ?? readPublicFile;
  return Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    idleTimeout: 0,
    routes: { "/": index },
    fetch(req, server) {
      // DNS rebinding: a hostile domain resolving to 127.0.0.1 sends its own Host.
      if (!allowedHosts.has(req.headers.get("host") ?? "")) return new Response("Forbidden", { status: 403 });
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && PUBLIC_FILE.test(path)) return publicFile(path);
      const extra = opts.extra?.(req, path);
      if (extra) return extra;
      return handle(req, server.requestIP(req)?.address);
    },
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  startServer({ port });
  console.log(`dashboard: http://127.0.0.1:${port}`);
}
