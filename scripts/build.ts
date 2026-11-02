import { rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

rmSync("dist", { recursive: true, force: true });

// HTML entrypoint breaks on Vercel's bun (index.html parsed as JS), so bundle
// the two entry files directly and rewrite index.html by hand.
const result = await Bun.build({
  entrypoints: ["src/web/app.tsx", "src/web/styles.css"],
  outdir: "dist",
  minify: true,
  plugins: [tailwind],
  throw: false,
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

const entries = result.outputs.filter((o) => o.kind === "entry-point");
const js = entries.find((o) => o.path.endsWith(".js"));
const css = result.outputs.find((o) => o.path.endsWith(".css"));
if (!js || !css) {
  console.error("sortie js/css manquante:", entries.map((o) => o.path));
  process.exit(1);
}
const name = (p: string) => p.split(/[\\/]/).pop()!;

// public/ is served from the root: serviceWorker.register("/sw.js").
for (const file of await readdir("src/web/public")) {
  await Bun.write(`dist/${file}`, Bun.file(`src/web/public/${file}`));
}

const html = (await Bun.file("src/web/index.html").text())
  .replace("./app.tsx", `./${name(js.path)}`)
  .replace("./styles.css", `./${name(css.path)}`)
  .replaceAll("./public/", "./");
await Bun.write("dist/index.html", html);
console.log(`build ok: ${name(js.path)}, ${name(css.path)}`);
