import { mkdirSync, readdirSync, rmSync } from "node:fs";
import type { BunPlugin } from "bun";
import tailwind from "bun-plugin-tailwind";

// sw.js must be a file blob: a .js entrypoint is bundled as code.
const publicJsAsFile: BunPlugin = {
  name: "public-js-as-file",
  setup(build) {
    build.onLoad({ filter: /web[\\/]public[\\/].*\.js$/ }, async ({ path }) => ({
      loader: "file",
      contents: await Bun.file(path).text(),
    }));
  },
};

// Exact names: embeddedPublicFile (desktop/main.ts) matches them.
const out = "dist-desktop";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const publicFiles = readdirSync("src/web/public").map((f) => `src/web/public/${f}`);
const result = await Bun.build({
  entrypoints: ["src/desktop/main.ts", ...publicFiles],
  plugins: [tailwind, publicJsAsFile],
  naming: { asset: "[name].[ext]" },
  compile: {
    target: "bun-windows-x64",
    outfile: `${out}/OpenAlternance.exe`,
    windows: { hideConsole: true, icon: "installer/openalternance.ico" },
  },
  throw: false,
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
console.log(`build ok: ${out}/OpenAlternance.exe`);
