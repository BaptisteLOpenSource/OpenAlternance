import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Dialect = "postgres" | "sqlite";

export function resolveDb(url: string | undefined): { dialect: Dialect; url: string } {
  if (url && /^postgres(ql)?:\/\//.test(url)) return { dialect: "postgres", url };
  return { dialect: "sqlite", url: url || "sqlite://data/openalternance.db" };
}

export function bootError(env: Record<string, string | undefined>, d: Dialect): string | null {
  return env.VERCEL && d === "sqlite" ? "SQLite impossible sur Vercel: définir DATABASE_URL (Postgres/Neon)" : null;
}

const resolved = resolveDb(process.env.DATABASE_URL);
export const dialect: Dialect = resolved.dialect;

function open(): Bun.SQL {
  if (dialect === "postgres") {
    // tls: Neon refuses plaintext connections; forced here rather than trusting the URL's sslmode.
    // prepare: false, cached SELECT * plans break after ALTER TABLE (column count mismatch).
    return new Bun.SQL({ url: resolved.url, tls: true, prepare: false });
  }
  const boot = bootError(process.env, dialect);
  if (boot) throw new Error(boot);
  const path = resolved.url.replace(/^sqlite:\/\//, "");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  return new Bun.SQL(resolved.url);
}
// Bun.SQL connects lazily, so importing this in tests is safe.
export const sql = open();
// SQLite ignores ON DELETE CASCADE unless enabled per connection.
if (dialect === "sqlite") {
  await sql.unsafe("PRAGMA foreign_keys = ON");
  const file = resolved.url.replace(/^sqlite:\/\//, "");
  if (file !== ":memory:") chmodSync(file, 0o600);
}

export function schema(d: Dialect): string[] {
  const pg = d === "postgres";
  const ID = pg ? "INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const BLOB = pg ? "BYTEA" : "BLOB";
  const TS = pg ? "TIMESTAMPTZ NOT NULL" : "TEXT NOT NULL";
  return [
    `CREATE TABLE IF NOT EXISTS companies (
    id ${ID},
    nom TEXT NOT NULL UNIQUE,
    ville TEXT,
    site TEXT,
    statut TEXT NOT NULL DEFAULT 'a_contacter',
    prochaine_relance TEXT,
    notes TEXT,
    logo TEXT,
    poste TEXT,
    publication TEXT,
    candidatures TEXT,
    reponses TEXT,
    retard INTEGER NOT NULL DEFAULT 0,
    mail TEXT,
    mail_objet TEXT,
    mail_canal TEXT,
    secteur TEXT,
    adresse TEXT,
    code_postal TEXT,
    domaine TEXT,
    effectif TEXT,
    note_google TEXT,
    actualite TEXT,
    annonce TEXT,
    contact_cv TEXT,
    suivi_linkedin TEXT,
    suivi_insta TEXT,
    suivi_facebook TEXT,
    suivi_tiktok TEXT
  )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS companies_nom_lower ON companies (lower(nom))`,
    `CREATE TABLE IF NOT EXISTS contacts (
    id ${ID},
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    role TEXT,
    email TEXT,
    telephone TEXT,
    linkedin TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS interactions (
    id ${ID},
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    delai INTEGER DEFAULT 7
  )`,
    `CREATE TABLE IF NOT EXISTS lettres (
    file TEXT PRIMARY KEY,
    content TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    format TEXT NOT NULL,
    content TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS fichiers (
    name TEXT PRIMARY KEY,
    data ${BLOB} NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
    at ${TS},
    ip TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at ${TS}
  )`,
    `CREATE TABLE IF NOT EXISTS profil (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL DEFAULT '',
    adresse TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    nom_fichier TEXT NOT NULL DEFAULT 'Lettre_Motivation_{username}-{entreprise}'
  )`,
  ];
}

export async function migrate(): Promise<void> {
  for (const statement of schema(dialect)) await sql.unsafe(statement);
}
