import { sql } from "./db";
import {
  CLOSING_STATUTS,
  type DocFormat,
  type FicheExtra,
  type InteractionType,
  type Profil,
  PROFIL_VIDE,
  type Statut,
  delaiDays,
  fileName,
  isWebUrl,
  type LettreStatut,
  isoDate,
  parseFrontmatter,
  relanceAfter,
  relanceForStatut,
  replayEchanges,
  setFrontmatter,
  slug,
  statutAfter,
  today,
  daysBetween,
} from "./logic";

const SAFE_NAME = /^[\w.-]+\.md$/;
const SAFE_DOCUMENT = /^[\w.-]+\.(md|txt|html)$/;

export type DocumentRow = { name: string; format: DocFormat };
const TEMPLATE_FILE = "_template.md";

export type Lettre = { file: string; type: string; entreprise: string; statut: string; date_envoi?: string };

export type Company = {
  id: number;
  nom: string;
  ville: string | null;
  site: string | null;
  statut: Statut;
  prochaine_relance: string | null;
  notes: string | null;
  logo: string | null;
  poste: string | null;
  publication: string | null;
  candidatures: string | null;
  reponses: string | null;
  mail: string | null;
  mail_objet: string | null;
  mail_canal: string | null;
  retard: number;
} & Record<FicheExtra, string | null>;

export type Contact = {
  id: number;
  company_id: number;
  nom: string;
  role: string | null;
  email: string | null;
  telephone: string | null;
  linkedin: string | null;
};

export type Interaction = {
  id: number;
  company_id: number;
  type: InteractionType;
  date: string;
  note: string | null;
  delai: number | null;
};

export async function findCompany(nom: string): Promise<Company> {
  const [company] = await sql<Company[]>`SELECT * FROM companies WHERE lower(nom) = lower(${nom})`;
  if (!company) throw new Error(`Entreprise introuvable: ${nom}`);
  return company;
}

const site = (url: string | undefined, label = "site") => {
  if (url && !isWebUrl(url)) throw new Error(`${label} invalide (http/https attendu): ${url}`);
  return url ?? null;
};

export async function addCompany(
  nom: string,
  fields: { ville?: string; site?: string; notes?: string },
): Promise<void> {
  try {
    await sql`INSERT INTO companies (nom, ville, site, notes) VALUES (${nom}, ${fields.ville ?? null}, ${site(fields.site)}, ${fields.notes ?? null})`;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error(`Entreprise déjà existante: ${nom}`);
    throw error;
  }
}

export async function addContact(
  companyNom: string,
  fields: { nom: string; role?: string; email?: string; tel?: string; linkedin?: string },
): Promise<void> {
  const company = await findCompany(companyNom);
  await sql`INSERT INTO contacts (company_id, nom, role, email, telephone, linkedin) VALUES (${company.id}, ${fields.nom}, ${fields.role ?? null}, ${fields.email ?? null}, ${fields.tel ?? null}, ${site(fields.linkedin, "linkedin")})`;
}

export async function logInteraction(
  companyNom: string,
  type: InteractionType,
  fields: { date?: string; delai?: string | null; note?: string },
): Promise<void> {
  const date = isoDate(fields.date ?? today());
  const delai = delaiDays(fields.delai);
  const company = await findCompany(companyNom);
  const statut = statutAfter(type, company.statut);
  const relance = relanceAfter(type, date, delai, company.prochaine_relance, statut);
  if (type === "relance") {
    const [dup] = await sql`SELECT 1 FROM interactions WHERE company_id = ${company.id} AND type = 'relance' AND date = ${date}`;
    if (dup) throw new Error(`relance déjà enregistrée le ${date} pour ${company.nom}`);
  }
  await sql.begin(async (tx) => {
    await tx`INSERT INTO interactions (company_id, type, date, note, delai) VALUES (${company.id}, ${type}, ${date}, ${fields.note ?? null}, ${delai})`;
    await tx`UPDATE companies SET statut = ${statut}, prochaine_relance = ${relance}, retard = 0 WHERE id = ${company.id}`;
  });
}

// Rebuilds statut and relance from the company's interactions (after any edit or delete of one).
async function replayCompany(tx: typeof sql, companyId: number): Promise<void> {
  const [company] = await tx<Company[]>`SELECT * FROM companies WHERE id = ${companyId}`;
  const rows = await tx<{ type: InteractionType; date: string; delai: number | null }[]>`
    SELECT type, date, delai FROM interactions WHERE company_id = ${companyId} ORDER BY date, id`;
  const { statut, prochaine } = replayEchanges(company.statut, rows);
  await tx`UPDATE companies SET statut = ${statut}, prochaine_relance = ${prochaine} WHERE id = ${companyId}`;
}

export async function deleteInteraction(id: number): Promise<void> {
  await sql.begin(async (tx) => {
    const [deleted] = await tx<{ company_id: number }[]>`DELETE FROM interactions WHERE id = ${id} RETURNING company_id`;
    if (!deleted) throw new Error(`échange introuvable: ${id}`);
    await replayCompany(tx, deleted.company_id);
  });
}

export async function updateInteraction(
  id: number,
  fields: { type: InteractionType; date: string; delai: number | null; note?: string },
): Promise<void> {
  await sql.begin(async (tx) => {
    const [updated] = await tx<{ company_id: number }[]>`
      UPDATE interactions SET type = ${fields.type}, date = ${fields.date}, delai = ${fields.delai}, note = ${fields.note ?? null}
      WHERE id = ${id} RETURNING company_id`;
    if (!updated) throw new Error(`échange introuvable: ${id}`);
    await replayCompany(tx, updated.company_id);
  });
}

export async function deleteContact(id: number): Promise<void> {
  const [deleted] = await sql<{ id: number }[]>`DELETE FROM contacts WHERE id = ${id} RETURNING id`;
  if (!deleted) throw new Error(`contact introuvable: ${id}`);
}

export async function updateContact(
  id: number,
  fields: { nom: string; role?: string; email?: string; tel?: string; linkedin?: string },
): Promise<void> {
  const [updated] = await sql<{ id: number }[]>`
    UPDATE contacts SET nom = ${fields.nom}, role = ${fields.role ?? null}, email = ${fields.email ?? null}, telephone = ${fields.tel ?? null}, linkedin = ${site(fields.linkedin, "linkedin")}
    WHERE id = ${id} RETURNING id`;
  if (!updated) throw new Error(`contact introuvable: ${id}`);
}

// Contacts and interactions go with it: ON DELETE CASCADE in src/db.ts.
export async function deleteCompany(companyNom: string): Promise<void> {
  const company = await findCompany(companyNom);
  await sql`DELETE FROM companies WHERE id = ${company.id}`;
}

export async function setStatut(companyNom: string, statut: Statut): Promise<void> {
  const company = await findCompany(companyNom);
  const relance = relanceForStatut(statut, company.prochaine_relance, today());
  await sql`UPDATE companies SET statut = ${statut}, prochaine_relance = ${relance}, retard = 0 WHERE id = ${company.id}`;
}

// Annuler la relance prévue: stop chasing, keep the statut.
export async function closeRelance(companyNom: string): Promise<void> {
  const company = await findCompany(companyNom);
  await sql`UPDATE companies SET prochaine_relance = NULL, retard = 0 WHERE id = ${company.id}`;
}

// Décaler / modifier la relance prévue à la main: la date saisie remplace le retard.
export async function setRelance(companyNom: string, date: string): Promise<void> {
  const company = await findCompany(companyNom);
  await sql`UPDATE companies SET prochaine_relance = ${isoDate(date)}, retard = 0 WHERE id = ${company.id}`;
}

// Relance due before today and not handled: pulled to today, retard counts the days carried.
// Idempotent: once moved, prochaine_relance = today and the WHERE no longer matches.
export async function reporterRelances(): Promise<void> {
  const now = today();
  await sql.begin(async (tx) => {
    const due = await tx<{ id: number; prochaine_relance: string; statut: string }[]>`
      SELECT id, prochaine_relance, statut FROM companies WHERE prochaine_relance < ${now}`;
    for (const r of due) {
      if ((CLOSING_STATUTS as ReadonlySet<string>).has(r.statut)) continue;
      await tx`UPDATE companies SET retard = retard + ${daysBetween(r.prochaine_relance, now)}, prochaine_relance = ${now} WHERE id = ${r.id}`;
    }
  });
}

export type Fiche = {
  ville?: string;
  site?: string;
  notes?: string;
  logo?: string;
  poste?: string;
  publication?: string;
  candidatures?: string;
  reponses?: string;
  mail?: string;
  mail_objet?: string;
  mail_canal?: string;
} & Partial<Record<FicheExtra, string>>;

export async function updateCompany(companyNom: string, fields: Fiche): Promise<void> {
  const company = await findCompany(companyNom);
  await sql`UPDATE companies SET
    ville = ${fields.ville ?? null},
    site = ${site(fields.site)},
    notes = ${fields.notes ?? null},
    logo = ${site(fields.logo)},
    poste = ${fields.poste ?? null},
    publication = ${fields.publication ?? null},
    candidatures = ${fields.candidatures ?? null},
    reponses = ${fields.reponses ?? null},
    mail = ${fields.mail ?? null},
    mail_objet = ${fields.mail_objet ?? null},
    mail_canal = ${fields.mail_canal ?? null},
    secteur = ${fields.secteur ?? null},
    adresse = ${fields.adresse ?? null},
    code_postal = ${fields.code_postal ?? null},
    domaine = ${fields.domaine ?? null},
    effectif = ${fields.effectif ?? null},
    note_google = ${fields.note_google ?? null},
    actualite = ${fields.actualite ?? null},
    annonce = ${fields.annonce ?? null},
    contact_cv = ${fields.contact_cv ?? null},
    suivi_linkedin = ${fields.suivi_linkedin ?? null},
    suivi_insta = ${fields.suivi_insta ?? null},
    suivi_facebook = ${fields.suivi_facebook ?? null},
    suivi_tiktok = ${fields.suivi_tiktok ?? null}
    WHERE id = ${company.id}`;
}

// Letter follows the rename: its frontmatter names the company, and letters are matched by that name.
export async function renameCompany(companyNom: string, nom: string): Promise<void> {
  const company = await findCompany(companyNom);
  const letter = (await listLettres()).find((l) => l.type === "lettre" && l.entreprise.toLowerCase() === company.nom.toLowerCase());
  try {
    await sql.begin(async (tx) => {
      await tx`UPDATE companies SET nom = ${nom} WHERE id = ${company.id}`;
      if (letter) {
        const content = await readLettre(letter.file);
        await tx`UPDATE lettres SET content = ${setFrontmatter(content ?? "", { entreprise: nom })} WHERE file = ${letter.file}`;
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error(`Entreprise déjà existante: ${nom}`);
    throw error;
  }
}

export type CompanyRow = Company & { derniere_interaction: string | null; contacts: string[] };

export async function listCompanies(): Promise<CompanyRow[]> {
  const companies = await sql<(Company & { derniere_interaction: string | null })[]>`
    SELECT c.*, (SELECT MAX(date) FROM interactions i WHERE i.company_id = c.id) AS derniere_interaction
    FROM companies c ORDER BY c.nom`;
  const contacts = await listContacts();
  return companies.map((company) => ({
    ...company,
    contacts: contacts.filter((contact) => contact.company_id === company.id).map((contact) => contact.nom),
  }));
}

export async function listContacts(): Promise<Contact[]> {
  return sql<Contact[]>`SELECT id, company_id, nom, role, email, telephone, linkedin FROM contacts ORDER BY nom`;
}

export async function listInteractions(): Promise<(Interaction & { nom: string })[]> {
  return sql<(Interaction & { nom: string })[]>`
    SELECT i.id, i.company_id, i.type, i.date, i.note, i.delai, c.nom
    FROM interactions i JOIN companies c ON c.id = i.company_id ORDER BY i.date`;
}

const toLettre = (file: string, content: string): Lettre => {
  const fields = parseFrontmatter(content);
  // a dated letter without statut was sent: derive it instead of showing brouillon
  const statut = fields.statut || (fields.date_envoi ? "envoyee" : "");
  // legacy rows stored "YYYY-MM-DD HH:MM": keep the date part, the UI parses it as ISO
  return { file, type: fields.type ?? "", entreprise: fields.entreprise ?? "", statut, date_envoi: fields.date_envoi?.slice(0, 10) };
};

export async function listLettres(): Promise<Lettre[]> {
  const rows = await sql<{ file: string; content: string }[]>`SELECT file, content FROM lettres ORDER BY file`;
  return rows.map((row) => toLettre(row.file, row.content));
}

export async function readLettre(file: string): Promise<string | null> {
  if (!SAFE_NAME.test(file)) return null;
  const [row] = await sql<{ content: string }[]>`SELECT content FROM lettres WHERE file = ${file}`;
  return row?.content ?? null;
}

// letters outlive deleted companies: match by name before findCompany
async function lettreFile(companyNom: string): Promise<string> {
  const existing = (await listLettres()).find((l) => l.type === "lettre" && l.entreprise.toLowerCase() === companyNom.toLowerCase());
  return existing?.file ?? `${slug((await findCompany(companyNom)).nom)}.md`;
}

const upsertLettre = (file: string, content: string) =>
  sql`INSERT INTO lettres (file, content) VALUES (${file}, ${`${content}\n`})
    ON CONFLICT (file) DO UPDATE SET content = EXCLUDED.content`;

export async function writeLettre(companyNom: string, content: string): Promise<void> {
  await upsertLettre(await lettreFile(companyNom), content);
}

export async function writeTemplate(content: string): Promise<void> {
  await upsertLettre(TEMPLATE_FILE, content);
}

// Envoyee stamps date_envoi (default today); brouillon clears it.
export async function setLettreStatut(companyNom: string, statut: LettreStatut, date?: string): Promise<void> {
  const file = await lettreFile(companyNom);
  const content = await readLettre(file);
  if (content === null) throw new Error(`Lettre introuvable: ${companyNom}`);
  const envoi = statut === "envoyee" ? isoDate(date ?? today()) : "";
  await sql`UPDATE lettres SET content = ${setFrontmatter(content, { statut, date_envoi: envoi })} WHERE file = ${file}`;
  if (statut === "envoyee") await logCandidature(companyNom, envoi);
}

// Sent letter = candidature: logged once, so the company turns contacte with its relance.
async function logCandidature(companyNom: string, date: string): Promise<void> {
  const [company] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE lower(nom) = lower(${companyNom})`;
  if (!company) return;
  const [logged] = await sql`SELECT 1 FROM interactions WHERE company_id = ${company.id} AND type = 'candidature'`;
  if (!logged) await logInteraction(companyNom, "candidature", { date });
}

export async function deleteLettre(companyNom: string): Promise<void> {
  const file = await lettreFile(companyNom);
  const [deleted] = await sql<{ file: string }[]>`DELETE FROM lettres WHERE file = ${file} RETURNING file`;
  if (!deleted) throw new Error(`Lettre introuvable: ${companyNom}`);
}

export async function getProfil(): Promise<Profil> {
  const [row] = await sql<Profil[]>`SELECT username, email, telephone, adresse, site, nom_fichier FROM profil WHERE id = 1`;
  return row ?? PROFIL_VIDE;
}

export async function setProfil(fields: Profil): Promise<void> {
  if (fields.site && !isWebUrl(fields.site)) throw new Error(`site invalide (http/https attendu): ${fields.site}`);
  if (!fileName(fields.nom_fichier, { username: fields.username, entreprise: "x" })) throw new Error("nom de fichier vide");
  await sql`INSERT INTO profil (id, username, email, telephone, adresse, site, nom_fichier)
    VALUES (1, ${fields.username}, ${fields.email}, ${fields.telephone}, ${fields.adresse}, ${fields.site}, ${fields.nom_fichier})
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, telephone = EXCLUDED.telephone,
      adresse = EXCLUDED.adresse, site = EXCLUDED.site, nom_fichier = EXCLUDED.nom_fichier`;
}

export async function listPdfs(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM fichiers WHERE name LIKE '%.pdf' ORDER BY name`;
  return rows.map((row) => row.name);
}

export async function readFichier(name: string): Promise<Uint8Array | null> {
  const [row] = await sql<{ data: Uint8Array }[]>`SELECT data FROM fichiers WHERE name = ${name}`;
  return row?.data ?? null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return sql<DocumentRow[]>`SELECT name, format FROM documents ORDER BY name`;
}

export async function readDocument(name: string): Promise<{ format: DocFormat; content: string } | null> {
  if (!SAFE_DOCUMENT.test(name)) return null;
  const [row] = await sql<{ format: DocFormat; content: string }[]>`SELECT format, content FROM documents WHERE name = ${name}`;
  return row ?? null;
}

// Values go through tagged parameters only: no string built into SQL.
export async function addDocument(name: string, format: DocFormat, content: string): Promise<void> {
  if (!SAFE_DOCUMENT.test(name)) throw new Error(`nom de document invalide: ${name}`);
  try {
    await sql`INSERT INTO documents (name, format, content) VALUES (${name}, ${format}, ${content})`;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error(`Document déjà existant: ${name}`);
    throw error;
  }
}

export async function updateDocument(name: string, content: string): Promise<void> {
  const [updated] = await sql<{ name: string }[]>`UPDATE documents SET content = ${content} WHERE name = ${name} RETURNING name`;
  if (!updated) throw new Error(`Document introuvable: ${name}`);
}

export async function deleteDocument(name: string): Promise<void> {
  const [deleted] = await sql<{ name: string }[]>`DELETE FROM documents WHERE name = ${name} RETURNING name`;
  if (!deleted) throw new Error(`Document introuvable: ${name}`);
}
