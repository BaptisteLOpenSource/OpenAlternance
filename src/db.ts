// Neon Postgres is the only source of truth. Bun.SQL connects lazily, so importing this in tests is safe.
// tls: Neon refuses plaintext connections; forced here rather than trusting the URL's sslmode.
// prepare: false, cached SELECT * plans break after ALTER TABLE (column count mismatch).
export const sql = new Bun.SQL({ url: process.env.DATABASE_URL ?? "", tls: true, prepare: false });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS companies (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    reponses TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    role TEXT,
    email TEXT,
    telephone TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT
  )`,
  `ALTER TABLE interactions ADD COLUMN IF NOT EXISTS delai INTEGER NOT NULL DEFAULT 7`,
  `ALTER TABLE interactions ALTER COLUMN delai DROP NOT NULL`,
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
    data BYTEA NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS ip TEXT`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS retard INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS mail TEXT`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS mail_objet TEXT`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS mail_canal TEXT`,
  `ALTER TABLE companies ADD COLUMN IF NOT EXISTS secteur TEXT, ADD COLUMN IF NOT EXISTS adresse TEXT,
    ADD COLUMN IF NOT EXISTS code_postal TEXT, ADD COLUMN IF NOT EXISTS domaine TEXT, ADD COLUMN IF NOT EXISTS effectif TEXT,
    ADD COLUMN IF NOT EXISTS note_google TEXT, ADD COLUMN IF NOT EXISTS actualite TEXT, ADD COLUMN IF NOT EXISTS annonce TEXT,
    ADD COLUMN IF NOT EXISTS contact_cv TEXT, ADD COLUMN IF NOT EXISTS suivi_linkedin TEXT, ADD COLUMN IF NOT EXISTS suivi_insta TEXT,
    ADD COLUMN IF NOT EXISTS suivi_facebook TEXT, ADD COLUMN IF NOT EXISTS suivi_tiktok TEXT`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS companies_nom_lower ON companies (lower(nom))`,
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

export async function migrate(): Promise<void> {
  for (const statement of SCHEMA) await sql.unsafe(statement);
}
