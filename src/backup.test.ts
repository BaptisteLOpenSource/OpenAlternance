import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Own process: db.ts reads DATABASE_URL at import and must not touch a shared test DB.
const dir = mkdtempSync(join(tmpdir(), "oa-backup-"));
const target = join(dir, "backup.db");

const script = `
const { migrate, sql } = await import("./src/db");
const repo = await import("./src/repo");
const { backupToSqlite } = await import("./src/backup");
await migrate();
await repo.addCompany("Acme", { ville: "Lyon" });
await repo.addContact("Acme", { nom: "Jean" });
await repo.logInteraction("Acme", "appel", { note: "rappel" });
await repo.writeLettre("Acme", "Bonjour");
await repo.setProfil({ username: "Jean", email: "j@x.fr", telephone: "", adresse: "", site: "", nom_fichier: "Lettre_{username}-{entreprise}" });
await sql\`INSERT INTO fichiers (name, data) VALUES ('cv.pdf', \${new Uint8Array([1, 2, 3])})\`;
const result = await backupToSqlite(process.env.BACKUP_TARGET);
let refused = null;
try { await backupToSqlite(process.env.BACKUP_TARGET); } catch (e) { refused = e.message; }
console.log(JSON.stringify({ result, refused }));`;

test("backupToSqlite copies every table into a sqlite file", async () => {
  let copy: Bun.SQL | undefined;
  try {
    const p = Bun.spawn(["bun", "-e", script], {
      env: { ...process.env, DATABASE_URL: "sqlite://:memory:", BACKUP_TARGET: target },
      stdout: "pipe",
      stderr: "inherit",
    });
    const out = JSON.parse(await new Response(p.stdout).text());
    expect(await p.exited).toBe(0);
    expect(out.result.rows).toBe(6);
    expect(out.refused).toBe("fichier existe déjà");

    copy = new Bun.SQL("sqlite://" + target);

    const [company] = await copy`SELECT nom FROM companies`;
    expect(company.nom).toBe("Acme");
    const [interaction] = await copy`SELECT type, note FROM interactions`;
    expect(interaction).toEqual({ type: "appel", note: "rappel" });
    const [lettre] = await copy`SELECT content FROM lettres`;
    expect(lettre.content).toContain("Bonjour");
    const [profil] = await copy`SELECT username FROM profil`;
    expect(profil.username).toBe("Jean");
    const [fichier] = await copy`SELECT data FROM fichiers`;
    expect(Array.from(fichier.data as Uint8Array)).toEqual([1, 2, 3]);
  } finally {
    await copy?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
