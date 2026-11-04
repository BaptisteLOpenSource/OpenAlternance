import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { schema, sql } from "./db";

// FK order. sessions and login_attempts are transient, not user data.
const TABLES = ["companies", "agences", "postes", "contacts", "interactions", "lettres", "documents", "fichiers", "profil"];

export async function backupToSqlite(target: string): Promise<{ rows: number }> {
  if (existsSync(target)) throw new Error("fichier existe déjà");
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const copy = new Bun.SQL("sqlite://" + target);
  let rows = 0;
  try {
    for (const statement of schema("sqlite")) await copy.unsafe(statement);
    for (const table of TABLES) {
      // ponytail: row-by-row insert, batch if DB grows
      for (const row of await sql.unsafe(`SELECT * FROM ${table}`)) {
        await copy`INSERT INTO ${copy(table)} ${copy(row)}`;
        rows++;
      }
    }
  } catch (error) {
    // A half-filled file would pass for a valid backup.
    await copy.close().catch(() => {});
    rmSync(target, { force: true });
    throw error;
  }
  await copy.close();
  chmodSync(target, 0o600);
  return { rows };
}
