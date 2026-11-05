import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import template from "../lettres/_template.md" with { type: "text" };
import { CLOSING_STATUTS, type Row, type Statut, replayTracks, today } from "./logic";

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

// Bun.SQL reports SQLite unique/primary-key hits with their own codes, not 23505.
export function isUniqueViolation(error: unknown): boolean {
  const { code, errno } = error as { code?: string; errno?: string };
  return errno === "23505" || /^(23505|SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY))$/.test(code ?? "");
}

const INTERACTION_COLUMNS = [
  "poste_id INTEGER REFERENCES postes(id) ON DELETE SET NULL",
  "statut TEXT",
  "prochaine TEXT",
  "auto TEXT",
];

const DOCUMENT_COLUMNS = [
  "company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL",
  "interaction_id INTEGER REFERENCES interactions(id) ON DELETE SET NULL",
];

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
    `CREATE TABLE IF NOT EXISTS agences (
    id ${ID},
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    ville TEXT NOT NULL,
    adresse TEXT,
    code_postal TEXT
  )`,
    `CREATE TABLE IF NOT EXISTS postes (
    id ${ID},
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    intitule TEXT NOT NULL,
    contrat TEXT NOT NULL DEFAULT 'alternance',
    annonce TEXT,
    publication TEXT,
    candidatures TEXT,
    reponses TEXT,
    agence_id INTEGER REFERENCES agences(id) ON DELETE SET NULL
  )`,
    `CREATE TABLE IF NOT EXISTS interactions (
    id ${ID},
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    delai INTEGER DEFAULT 7,
    ${INTERACTION_COLUMNS.join(",\n    ")}
  )`,
    `CREATE TABLE IF NOT EXISTS lettres (
    file TEXT PRIMARY KEY,
    content TEXT NOT NULL
  )`,
    `CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    format TEXT NOT NULL,
    content TEXT NOT NULL,
    ${DOCUMENT_COLUMNS.join(",\n    ")}
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


async function addColumn(table: string, column: string): Promise<void> {
  if (dialect === "postgres") return void (await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column}`));
  try {
    await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${column}`);
  } catch (error) {
    if (!/duplicate column name/i.test((error as Error).message)) throw error;
  }
}

async function historyOf(companyId: number) {
  const postes = await sql<{ id: number }[]>`SELECT id FROM postes WHERE company_id = ${companyId}`;
  const rows = await sql<Row[]>`SELECT type, date, delai, poste_id, statut, prochaine FROM interactions WHERE company_id = ${companyId} ORDER BY date, id`;
  return { rows, ...replayTracks(rows, postes.map((poste) => poste.id)) };
}

// Cache set before events existed: recorded once, guard keeps it idempotent.
async function reconcileHistory(): Promise<void> {
  const companies = await sql<{ id: number; statut: Statut; prochaine_relance: string | null }[]>`
    SELECT id, statut, prochaine_relance FROM companies
    WHERE id NOT IN (SELECT company_id FROM interactions WHERE type IN ('statut', 'planif'))`;
  for (const company of companies) {
    let history = await historyOf(company.id);
    const dated = history.rows.at(-1)?.date ?? today();
    if (history.statut !== company.statut) {
      await sql`INSERT INTO interactions (company_id, type, date, statut) VALUES (${company.id}, 'statut', ${dated}, ${company.statut})`;
      history = await historyOf(company.id);
    }
    const wanted = CLOSING_STATUTS.has(company.statut) ? null : company.prochaine_relance;
    // A relance the reporter moved to today is a carry, not a manual change.
    const carried = history.prochaine !== null && wanted !== null && history.prochaine < wanted && wanted <= today();
    if (history.prochaine !== wanted && !carried) {
      await sql`INSERT INTO interactions (company_id, type, date, prochaine) VALUES (${company.id}, 'planif', ${dated}, ${wanted})`;
    }
  }
}

export async function migrate(): Promise<void> {
  for (const statement of schema(dialect)) await sql.unsafe(statement);
  // Desktop never runs setup(): the letter template must ship with the schema.
  await sql`INSERT INTO lettres (file, content) VALUES ('_template.md', ${template}) ON CONFLICT (file) DO NOTHING`;
  for (const column of INTERACTION_COLUMNS) await addColumn("interactions", column);
  for (const column of DOCUMENT_COLUMNS) await addColumn("documents", column);
  await sql`INSERT INTO postes (company_id, intitule, annonce, publication, candidatures, reponses)
    SELECT id, poste, annonce, publication, candidatures, reponses FROM companies
    WHERE poste IS NOT NULL AND poste <> '' AND id NOT IN (SELECT company_id FROM postes)`;
  await reconcileHistory();
}
