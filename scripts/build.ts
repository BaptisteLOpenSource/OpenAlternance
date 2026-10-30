import tailwind from "bun-plugin-tailwind";
import { cpSync, rmSync } from "node:fs";

// Static front for Vercel: bundled app + PWA files (manifest, icons, sw.js) at dist root.
// bunfig's serve.static plugin only applies to `bun serve`, so Tailwind must be passed here.
rmSync("dist", { recursive: true, force: true });
const result = await Bun.build({ entrypoints: ["src/web/index.html"], outdir: "dist", minify: true, plugins: [tailwind] });
if (!result.success) throw new AggregateError(result.logs, "build échoué");
cpSync("src/web/public", "dist", { recursive: true });
