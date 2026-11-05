import { isUniqueViolation, sql } from "./db";
import { fetchLogo } from "./logo";
import {
  type Contrat,
  type DocFormat,
  type FicheExtra,
  type InteractionType,
  type Profil,
  PROFIL_VIDE,
  type Statut,
  carry,
  delaiDays,
  fileName,
  isWebUrl,
  type LettreStatut,
  isoDate,
  parseFrontmatter,
  replayTracks,
  type Row,
  setFrontmatter,
  slug,
  today,
} from "./logic";

const SAFE_NAME = /^[\w.-]+\.md$/;
const SAFE_DOCUMENT = /^[\w.-]+\.(md|txt|html|pdf)$/;

export type DocumentRow = { name: string; format: DocFormat; company_id: number | null; interaction_id: number | null };
export type DocumentLink = { companyId?: number; interactionId?: number };
const TEMPLATE_FILE = "_template.md";

export type Lettre = { file: string; type: string; entreprise: string; statut: string; date_envoi?: string; poste?: number };

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

export type Agence = {
  id: number;
  company_id: number;
  ville: string;
  adresse: string | null;
  code_postal: string | null;
};

export type Poste = {
  id: number;
  company_id: number;
  intitule: string;
  contrat: Contrat;
  annonce: string | null;
  publication: string | null;
  candidatures: string | null;
  reponses: string | null;
  agence_id: number | null;
};

export type PosteFields = { intitule: string; contrat?: Contrat; annonce?: string; publication?: string; agenceId?: number };
export type AgenceFields = { ville: string; adresse?: string; code_postal?: string };

export type Interaction = {
  id: number;
  company_id: number;
  type: InteractionType;
  date: string;
  note: string | null;
  delai: number | null;
  poste_id: number | null;
  statut: Statut | null;
  prochaine: string | null;
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
    if (isUniqueViolation(error)) throw new Error(`Entreprise déjà existante: ${nom}`);
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

// Foreign keys alone accept another company's row: check ownership here.
async function assertPoste(tx: typeof sql, companyId: number, posteId: number | null | undefined): Promise<void> {
  if (posteId == null) return;
  const [poste] = await tx`SELECT 1 AS ok FROM postes WHERE id = ${posteId} AND company_id = ${companyId}`;
  if (!poste) throw new Error("Poste introuvable");
}

async function assertAgence(tx: typeof sql, companyId: number, agenceId: number | null | undefined): Promise<void> {
  if (agenceId == null) return;
  const [agence] = await tx`SELECT 1 AS ok FROM agences WHERE id = ${agenceId} AND company_id = ${companyId}`;
  if (!agence) throw new Error("Agence introuvable");
}

export async function logInteraction(
  companyNom: string,
  type: InteractionType,
  fields: { date?: string; delai?: string | null; note?: string; posteId?: number; auto?: string },
): Promise<void> {
  const date = isoDate(fields.date ?? today());
  const delai = delaiDays(fields.delai);
  const company = await findCompany(companyNom);
  if (type === "relance") {
    const sameDay = await sql<{ poste_id: number | null }[]>`SELECT poste_id FROM interactions WHERE company_id = ${company.id} AND type = 'relance' AND date = ${date}`;
    if (sameDay.some((row) => row.poste_id === (fields.posteId ?? null))) throw new Error(`relance déjà enregistrée le ${date} pour ${company.nom}`);
  }
  await sql.begin(async (tx) => {
    await assertPoste(tx, company.id, fields.posteId);
    await tx`INSERT INTO interactions (company_id, type, date, note, delai, poste_id, auto) VALUES (${company.id}, ${type}, ${date}, ${fields.note ?? null}, ${delai}, ${fields.posteId ?? null}, ${fields.auto ?? null})`;
    await replayCompany(tx, company.id);
  });
}

async function replayCompany(tx: typeof sql, companyId: number): Promise<void> {
  const postes = await tx<{ id: number }[]>`SELECT id FROM postes WHERE company_id = ${companyId}`;
  const rows = await tx<Row[]>`
    SELECT type, date, delai, poste_id, statut, prochaine FROM interactions WHERE company_id = ${companyId} ORDER BY date, id`;
  const replay = replayTracks(rows, postes.map((poste) => poste.id));
  const relance = carry(replay.prochaine, replay.statut, today());
  await tx`UPDATE companies SET statut = ${replay.statut}, prochaine_relance = ${relance.prochaine}, retard = ${relance.retard} WHERE id = ${companyId}`;
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
  fields: { type: InteractionType; date: string; delai: number | null; note?: string; posteId?: number },
): Promise<void> {
  await sql.begin(async (tx) => {
    const [updated] = await tx<{ company_id: number }[]>`
      UPDATE interactions SET type = ${fields.type}, date = ${fields.date}, delai = ${fields.delai}, note = ${fields.note ?? null}, poste_id = ${fields.posteId ?? null}
      WHERE id = ${id} RETURNING company_id`;
    if (!updated) throw new Error(`échange introuvable: ${id}`);
    await assertPoste(tx, updated.company_id, fields.posteId);
    await replayCompany(tx, updated.company_id);
  });
}

// Table is a literal from this module, never user input.
async function deleteById(table: "contacts" | "agences", id: number, label: string): Promise<void> {
  const [deleted] = await sql<{ id: number }[]>`DELETE FROM ${sql(table)} WHERE id = ${id} RETURNING id`;
  if (!deleted) throw new Error(`${label} introuvable: ${id}`);
}

export async function deleteContact(id: number): Promise<void> {
  await deleteById("contacts", id, "contact");
}

export async function addPoste(companyNom: string, fields: PosteFields): Promise<number> {
  const company = await findCompany(companyNom);
  await assertAgence(sql, company.id, fields.agenceId);
  const [row] = await sql<{ id: number }[]>`INSERT INTO postes (company_id, intitule, contrat, annonce, publication, agence_id)
    VALUES (${company.id}, ${fields.intitule}, ${fields.contrat ?? "alternance"}, ${site(fields.annonce, "annonce")}, ${fields.publication ?? null}, ${fields.agenceId ?? null})
    RETURNING id`;
  return row.id;
}

export async function updatePoste(id: number, fields: PosteFields): Promise<void> {
  const [poste] = await sql<{ company_id: number }[]>`SELECT company_id FROM postes WHERE id = ${id}`;
  if (!poste) throw new Error(`poste introuvable: ${id}`);
  await assertAgence(sql, poste.company_id, fields.agenceId);
  await sql`UPDATE postes SET intitule = ${fields.intitule}, contrat = ${fields.contrat ?? "alternance"}, annonce = ${site(fields.annonce, "annonce")},
    publication = ${fields.publication ?? null}, agence_id = ${fields.agenceId ?? null} WHERE id = ${id}`;
}

// ON DELETE SET NULL moves its rows to the spontanée track: replay.
export async function deletePoste(id: number): Promise<void> {
  await sql.begin(async (tx) => {
    const [deleted] = await tx<{ company_id: number }[]>`DELETE FROM postes WHERE id = ${id} RETURNING company_id`;
    if (!deleted) throw new Error(`poste introuvable: ${id}`);
    await replayCompany(tx, deleted.company_id);
  });
}

export async function listPostes(): Promise<Poste[]> {
  return sql<Poste[]>`SELECT id, company_id, intitule, contrat, annonce, publication, candidatures, reponses, agence_id FROM postes ORDER BY intitule`;
}

export async function addAgence(companyNom: string, fields: AgenceFields): Promise<number> {
  const company = await findCompany(companyNom);
  const [row] = await sql<{ id: number }[]>`INSERT INTO agences (company_id, ville, adresse, code_postal)
    VALUES (${company.id}, ${fields.ville}, ${fields.adresse ?? null}, ${fields.code_postal ?? null}) RETURNING id`;
  return row.id;
}

export async function updateAgence(id: number, fields: AgenceFields): Promise<void> {
  const [updated] = await sql<{ id: number }[]>`
    UPDATE agences SET ville = ${fields.ville}, adresse = ${fields.adresse ?? null}, code_postal = ${fields.code_postal ?? null}
    WHERE id = ${id} RETURNING id`;
  if (!updated) throw new Error(`agence introuvable: ${id}`);
}

export const deleteAgence = (id: number) => deleteById("agences", id, "agence");

export async function listAgences(): Promise<Agence[]> {
  return sql<Agence[]>`SELECT id, company_id, ville, adresse, code_postal FROM agences ORDER BY ville`;
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
  await sql.begin(async (tx) => {
    await tx`DELETE FROM fichiers WHERE name = ${`logo-${company.id}`}`;
    await tx`DELETE FROM companies WHERE id = ${company.id}`;
  });
}

type Suivi = { type: "statut"; statut: Statut } | { type: "planif"; prochaine: string | null };

// Manual change = event row, cache replayed from history.
async function recordSuivi(companyNom: string, posteId: number | undefined, suivi: Suivi): Promise<void> {
  const company = await findCompany(companyNom);
  await sql.begin(async (tx) => {
    await assertPoste(tx, company.id, posteId);
    const statut = suivi.type === "statut" ? suivi.statut : null;
    const prochaine = suivi.type === "planif" ? suivi.prochaine : null;
    await tx`INSERT INTO interactions (company_id, type, date, poste_id, statut, prochaine) VALUES (${company.id}, ${suivi.type}, ${today()}, ${posteId ?? null}, ${statut}, ${prochaine})`;
    await replayCompany(tx, company.id);
  });
}

export async function setStatut(companyNom: string, statut: Statut, posteId?: number): Promise<void> {
  await recordSuivi(companyNom, posteId, { type: "statut", statut });
}

// Annuler la relance prévue: stop chasing, keep the statut.
export async function closeRelance(companyNom: string, posteId?: number): Promise<void> {
  await recordSuivi(companyNom, posteId, { type: "planif", prochaine: null });
}

// Décaler / modifier la relance prévue à la main: la date saisie remplace le retard.
export async function setRelance(companyNom: string, date: string, posteId?: number): Promise<void> {
  await recordSuivi(companyNom, posteId, { type: "planif", prochaine: isoDate(date) });
}

// Relance due before today and not handled: pulled to today, retard counts the days carried.
// Idempotent: once moved, prochaine_relance = today and the WHERE no longer matches.
export async function reporterRelances(): Promise<void> {
  const now = today();
  await sql.begin(async (tx) => {
    const due = await tx<{ id: number; prochaine_relance: string; statut: Statut }[]>`
      SELECT id, prochaine_relance, statut FROM companies WHERE prochaine_relance < ${now}`;
    for (const r of due) {
      const moved = carry(r.prochaine_relance, r.statut, now);
      await tx`UPDATE companies SET retard = retard + ${moved.retard}, prochaine_relance = ${moved.prochaine} WHERE id = ${r.id} AND prochaine_relance = ${r.prochaine_relance}`;
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

// Logo bytes are copied on save: the page never loads the remote URL.
async function storeLogo(companyId: number, url: string | null): Promise<void> {
  const name = `logo-${companyId}`;
  if (url === null) await sql`DELETE FROM fichiers WHERE name = ${name}`;
  else await writeFichier(name, await fetchLogo(url));
}

// ponytail: per-process memory, lost on restart; persist if restarts make refetching hurt
const LOGO_RETRY_MS = 10 * 60_000;
const logoFailures = new Map<string, number>();

// Logos set before they were stored have no row: fetch once on first view.
export async function readCompanyLogo(companyId: number): Promise<Uint8Array | null> {
  const name = `logo-${companyId}`;
  const stored = await readFichier(name);
  if (stored) return stored;
  const [row] = await sql<{ logo: string | null }[]>`SELECT logo FROM companies WHERE id = ${companyId}`;
  if (!row?.logo) return null;
  const key = `${companyId}:${row.logo}`;
  if (Date.now() - (logoFailures.get(key) ?? -LOGO_RETRY_MS) < LOGO_RETRY_MS) return null;
  const data = await fetchLogo(row.logo).catch(() => null);
  if (data) await writeFichier(name, data);
  else logoFailures.set(key, Date.now());
  return data;
}

export async function updateCompany(companyNom: string, fields: Fiche): Promise<void> {
  const company = await findCompany(companyNom);
  const logo = site(fields.logo);
  if (logo !== company.logo) await storeLogo(company.id, logo);
  await sql`UPDATE companies SET
    ville = ${fields.ville ?? null},
    site = ${site(fields.site)},
    notes = ${fields.notes ?? null},
    logo = ${logo},
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

const lettresDe = async (companyNom: string) =>
  (await listLettres()).filter((l) => l.type === "lettre" && l.entreprise.toLowerCase() === companyNom.toLowerCase());

async function setLettresEntreprise(tx: typeof sql, letters: Lettre[], nom: string): Promise<void> {
  for (const letter of letters) {
    const content = await readLettre(letter.file);
    await tx`UPDATE lettres SET content = ${setFrontmatter(content ?? "", { entreprise: nom })} WHERE file = ${letter.file}`;
  }
}

// Letter follows the rename: its frontmatter names the company, and letters are matched by that name.
export async function renameCompany(companyNom: string, nom: string): Promise<void> {
  const company = await findCompany(companyNom);
  const letters = await lettresDe(company.nom);
  try {
    await sql.begin(async (tx) => {
      await tx`UPDATE companies SET nom = ${nom} WHERE id = ${company.id}`;
      await setLettresEntreprise(tx, letters, nom);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Entreprise déjà existante: ${nom}`);
    throw error;
  }
}

// Source siège becomes an agence of target. Relance is replayed from the merged history.
export async function mergeCompanies(sourceNom: string, targetNom: string): Promise<void> {
  const source = await findCompany(sourceNom);
  const target = await findCompany(targetNom);
  if (source.id === target.id) throw new Error("Fusion impossible: même entreprise");
  const letters = await lettresDe(source.nom);
  await sql.begin(async (tx) => {
    if (source.ville)
      await tx`INSERT INTO agences (company_id, ville, adresse, code_postal) VALUES (${target.id}, ${source.ville}, ${source.adresse}, ${source.code_postal})`;
    await tx`UPDATE contacts SET company_id = ${target.id} WHERE company_id = ${source.id}`;
    await tx`UPDATE interactions SET company_id = ${target.id} WHERE company_id = ${source.id}`;
    await tx`UPDATE postes SET company_id = ${target.id} WHERE company_id = ${source.id}`;
    await tx`UPDATE agences SET company_id = ${target.id} WHERE company_id = ${source.id}`;
    await tx`UPDATE documents SET company_id = ${target.id} WHERE company_id = ${source.id}`;
    const notes = [target.notes, source.notes].filter(Boolean).join("\n\n") || null;
    await tx`UPDATE companies SET notes = ${notes} WHERE id = ${target.id}`;
    await setLettresEntreprise(tx, letters, target.nom);
    await replayCompany(tx, target.id);
    await tx`DELETE FROM fichiers WHERE name = ${`logo-${source.id}`}`;
    await tx`DELETE FROM companies WHERE id = ${source.id}`;
  });
}

// Lean on purpose: /api/state ships every company on each write.
export type CompanyRow = Pick<Company, "id" | "nom" | "ville" | "site" | "statut" | "prochaine_relance" | "retard" | "logo" | "poste"> & {
  derniere_interaction: string | null;
  contacts: string[];
};

export async function listCompanies(): Promise<CompanyRow[]> {
  const companies = await sql<Omit<CompanyRow, "contacts">[]>`
    SELECT c.id, c.nom, c.ville, c.site, c.statut, c.prochaine_relance, c.retard, c.logo, c.poste,
      (SELECT MAX(date) FROM interactions i WHERE i.company_id = c.id) AS derniere_interaction
    FROM companies c ORDER BY c.nom`;
  const contacts = await listContacts();
  return companies.map((company) => ({
    ...company,
    contacts: contacts.filter((contact) => contact.company_id === company.id).map((contact) => contact.nom),
  }));
}

export async function listFiches(): Promise<Company[]> {
  return sql<Company[]>`SELECT * FROM companies ORDER BY nom`;
}

export async function getFiche(id: number): Promise<Company | null> {
  const [company] = await sql<Company[]>`SELECT * FROM companies WHERE id = ${id}`;
  return company ?? null;
}

export async function listContacts(): Promise<Contact[]> {
  return sql<Contact[]>`SELECT id, company_id, nom, role, email, telephone, linkedin FROM contacts ORDER BY nom`;
}

export async function listInteractions(): Promise<(Interaction & { nom: string })[]> {
  return sql<(Interaction & { nom: string })[]>`
    SELECT i.id, i.company_id, i.type, i.date, i.note, i.delai, i.poste_id, i.statut, i.prochaine, c.nom
    FROM interactions i JOIN companies c ON c.id = i.company_id ORDER BY i.date`;
}

const toLettre = (file: string, content: string): Lettre => {
  const fields = parseFrontmatter(content);
  // a dated letter without statut was sent: derive it instead of showing brouillon
  const statut = fields.statut || (fields.date_envoi ? "envoyee" : "");
  // legacy rows stored "YYYY-MM-DD HH:MM": keep the date part, the UI parses it as ISO
  return {
    file,
    type: fields.type ?? "",
    entreprise: fields.entreprise ?? "",
    statut,
    date_envoi: fields.date_envoi?.slice(0, 10),
    poste: fields.poste ? Number(fields.poste) : undefined,
  };
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

// Letter whose poste was deleted reads as spontanée.
const posteOf = (letter: Lettre, postes: Set<number>) => (letter.poste !== undefined && postes.has(letter.poste) ? letter.poste : undefined);

// letters outlive deleted companies: match by name before findCompany
async function lettreFile(companyNom: string, posteId?: number): Promise<string> {
  const letters = await lettresDe(companyNom);
  const postes = new Set(
    (await sql<{ id: number }[]>`SELECT p.id FROM postes p JOIN companies c ON c.id = p.company_id WHERE lower(c.nom) = lower(${companyNom})`).map((p) => p.id),
  );
  const existing = letters.find((l) => posteOf(l, postes) === posteId);
  if (existing) return existing.file;
  const company = await findCompany(companyNom);
  if (posteId === undefined) return `${slug(company.nom)}.md`;
  const [poste] = await sql<{ intitule: string }[]>`SELECT intitule FROM postes WHERE id = ${posteId} AND company_id = ${company.id}`;
  if (!poste) throw new Error("Poste introuvable");
  const base = `${slug(company.nom)}-${slug(poste.intitule)}`;
  const [taken] = await sql`SELECT 1 AS ok FROM lettres WHERE file = ${`${base}.md`}`;
  return taken ? `${base}-${posteId}.md` : `${base}.md`;
}

const upsertLettre = (file: string, content: string) =>
  sql`INSERT INTO lettres (file, content) VALUES (${file}, ${`${content}\n`})
    ON CONFLICT (file) DO UPDATE SET content = EXCLUDED.content`;

export async function writeLettre(companyNom: string, content: string, posteId?: number): Promise<string> {
  const file = await lettreFile(companyNom, posteId);
  await upsertLettre(file, posteId === undefined ? content : setFrontmatter(content, { poste: String(posteId) }));
  return file;
}

export async function writeLettreFile(file: string, content: string): Promise<void> {
  if (!SAFE_NAME.test(file) || file === TEMPLATE_FILE) throw new Error(`Lettre introuvable: ${file}`);
  const rows = await sql`UPDATE lettres SET content = ${`${content}
`} WHERE file = ${file} RETURNING file`;
  if (!rows.length) throw new Error(`Lettre introuvable: ${file}`);
}

export async function writeTemplate(content: string): Promise<void> {
  await upsertLettre(TEMPLATE_FILE, content);
}

// Envoyee stamps date_envoi (default today); brouillon clears it.
export async function setLettreStatut(companyNom: string, statut: LettreStatut, date?: string, posteId?: number): Promise<void> {
  const file = await lettreFile(companyNom, posteId);
  const content = await readLettre(file);
  if (content === null) throw new Error(`Lettre introuvable: ${companyNom}`);
  const envoi = statut === "envoyee" ? isoDate(date ?? today()) : "";
  await sql`UPDATE lettres SET content = ${setFrontmatter(content, { statut, date_envoi: envoi })} WHERE file = ${file}`;
  if (statut === "envoyee") await logCandidature(companyNom, envoi, file, posteId);
  else await unlogCandidature(file);
}

// Sent letter = candidature: logged once per poste, tagged with its letter so brouillon can undo it.
async function logCandidature(companyNom: string, date: string, file: string, posteId?: number): Promise<void> {
  const [company] = await sql<{ id: number }[]>`SELECT id FROM companies WHERE lower(nom) = lower(${companyNom})`;
  if (!company) return;
  const logged = await sql<{ poste_id: number | null }[]>`SELECT poste_id FROM interactions WHERE company_id = ${company.id} AND type = 'candidature'`;
  if (!logged.some((row) => row.poste_id === (posteId ?? null)))
    await logInteraction(companyNom, "candidature", { date, auto: `lettre:${file}`, posteId });
}

// Hand-logged candidatures carry no tag, so they survive.
async function unlogCandidature(file: string): Promise<void> {
  await sql.begin(async (tx) => {
    const removed = await tx<{ company_id: number }[]>`DELETE FROM interactions WHERE auto = ${`lettre:${file}`} RETURNING company_id`;
    for (const { company_id } of removed) await replayCompany(tx, company_id);
  });
}

// Keyed by file: a letter outlives its company, so the name cannot find it.
export async function deleteLettre(file: string): Promise<void> {
  if (!SAFE_NAME.test(file) || file === TEMPLATE_FILE) throw new Error(`Lettre introuvable: ${file}`);
  const [deleted] = await sql<{ file: string }[]>`DELETE FROM lettres WHERE file = ${file} RETURNING file`;
  if (!deleted) throw new Error(`Lettre introuvable: ${file}`);
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
  const rows = await sql<{ name: string }[]>`SELECT name FROM fichiers
    WHERE name LIKE '%.pdf' AND name <> 'cv.pdf' AND name NOT LIKE 'doc-%' AND name NOT IN (SELECT name FROM documents)
    ORDER BY name`;
  return rows.map((row) => row.name);
}

export async function writeFichier(name: string, data: Uint8Array): Promise<void> {
  await sql`INSERT INTO fichiers (name, data) VALUES (${name}, ${data})
    ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data`;
}

export async function hasFichier(name: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 AS ok FROM fichiers WHERE name = ${name}`;
  return row !== undefined;
}

export async function readFichier(name: string): Promise<Uint8Array | null> {
  const [row] = await sql<{ data: Uint8Array }[]>`SELECT data FROM fichiers WHERE name = ${name}`;
  return row?.data ?? null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return sql<DocumentRow[]>`SELECT name, format, company_id, interaction_id FROM documents ORDER BY name`;
}

type StoredDocument = DocumentRow & { content: string };

export async function readDocument(name: string): Promise<StoredDocument | null> {
  if (!SAFE_DOCUMENT.test(name)) return null;
  const [row] = await sql<StoredDocument[]>`SELECT name, format, content, company_id, interaction_id FROM documents WHERE name = ${name}`;
  return row ?? null;
}

// An échange carries its company: link stays consistent whatever the caller sends.
async function resolveLink({ companyId, interactionId }: DocumentLink) {
  if (interactionId) {
    const [echange] = await sql<{ company_id: number }[]>`SELECT company_id FROM interactions WHERE id = ${interactionId}`;
    if (!echange) throw new Error(`échange introuvable: ${interactionId}`);
    return { company_id: echange.company_id, interaction_id: interactionId };
  }
  if (companyId && (await sql`SELECT 1 FROM companies WHERE id = ${companyId}`).length === 0) throw new Error(`entreprise introuvable: ${companyId}`);
  return { company_id: companyId ?? null, interaction_id: null };
}

export async function linkDocument(name: string, link: DocumentLink): Promise<void> {
  const { company_id, interaction_id } = await resolveLink(link);
  const [updated] = await sql<{ name: string }[]>`UPDATE documents SET company_id = ${company_id}, interaction_id = ${interaction_id} WHERE name = ${name} RETURNING name`;
  if (!updated) throw new Error(`Document introuvable: ${name}`);
}

// Values go through tagged parameters only: no string built into SQL.
export async function addDocument(name: string, format: DocFormat, content: string, link: DocumentLink = {}): Promise<void> {
  if (!SAFE_DOCUMENT.test(name)) throw new Error(`nom de document invalide: ${name}`);
  const { company_id, interaction_id } = await resolveLink(link);
  try {
    await sql`INSERT INTO documents (name, format, content, company_id, interaction_id) VALUES (${name}, ${format}, ${content}, ${company_id}, ${interaction_id})`;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Document déjà existant: ${name}`);
    throw error;
  }
}

// Bytes sit under doc-<name> so a document can never overwrite or delete cv.pdf or a lettre PDF.
const docFichier = (name: string) => `doc-${name}`;

export async function readPdf(name: string): Promise<Uint8Array | null> {
  return (await readFichier(docFichier(name))) ?? (await readFichier(name));
}

export async function addPdfDocument(name: string, data: Uint8Array, link: DocumentLink = {}): Promise<void> {
  if (!SAFE_DOCUMENT.test(name)) throw new Error(`nom de document invalide: ${name}`);
  const { company_id, interaction_id } = await resolveLink(link);
  try {
    await sql.begin(async (tx) => {
      if ((await tx`SELECT 1 FROM fichiers WHERE name = ${name}`).length > 0) throw new Error(`Document déjà existant: ${name}`);
      await tx`INSERT INTO documents (name, format, content, company_id, interaction_id) VALUES (${name}, 'pdf', '', ${company_id}, ${interaction_id})`;
      await tx`INSERT INTO fichiers (name, data) VALUES (${docFichier(name)}, ${data})`;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Document déjà existant: ${name}`);
    throw error;
  }
}

export async function updateDocument(name: string, content: string): Promise<void> {
  const [updated] = await sql<{ name: string }[]>`UPDATE documents SET content = ${content} WHERE name = ${name} RETURNING name`;
  if (!updated) throw new Error(`Document introuvable: ${name}`);
}

export async function deleteDocument(name: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [deleted] = await tx<DocumentRow[]>`DELETE FROM documents WHERE name = ${name} RETURNING name, format`;
    if (!deleted) throw new Error(`Document introuvable: ${name}`);
    if (deleted.format === "pdf") await tx`DELETE FROM fichiers WHERE name = ${docFichier(name)}`;
  });
}
