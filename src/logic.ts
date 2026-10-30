export const STATUTS = ["a_contacter", "contacte", "relance", "entretien", "offre", "refuse", "sans_reponse", "indisponible"] as const;
export const TYPES = ["mail", "appel", "candidature", "relance", "entretien", "reponse", "reponse_favorable", "reponse_defavorable", "depot"] as const;
export const MAIL_CANAUX = ["email", "formulaire", "linkedin"] as const;
export const FICHE_TEXTES = ["secteur", "adresse", "code_postal", "domaine", "effectif", "note_google", "actualite", "annonce", "contact_cv"] as const;
export const SUIVIS = ["suivi_linkedin", "suivi_insta", "suivi_facebook", "suivi_tiktok"] as const;
export const FICHE_EXTRA = [...FICHE_TEXTES, ...SUIVIS] as const;
export type FicheExtra = (typeof FICHE_EXTRA)[number];
export const LETTRE_STATUTS = ["brouillon", "envoyee"] as const;
export type LettreStatut = (typeof LETTRE_STATUTS)[number];

export type Statut = (typeof STATUTS)[number];
export type InteractionType = (typeof TYPES)[number];

export const CLOSING_STATUTS: ReadonlySet<Statut> = new Set(["offre", "refuse", "sans_reponse", "indisponible"]);
export const DOC_FORMATS = ["md", "txt", "html"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

// Statut set by hand: a chasing statut without a date gets one a week out (reopening a closed company).
export function relanceForStatut(statut: Statut, current: string | null, today: string): string | null {
  if (CLOSING_STATUTS.has(statut) || (statut !== "contacte" && statut !== "relance")) return null;
  return current ?? addDays(today, 7);
}

export function documentFile(titre: string, format: "md" | "txt" | "html"): string {
  const base = slug(titre);
  if (!base) throw new Error("titre invalide");
  return `${base}.${format}`;
}

const STATUT_BY_TYPE: Partial<Record<InteractionType, Statut>> = {
  candidature: "contacte",
  mail: "contacte",
  appel: "contacte",
  relance: "relance",
  entretien: "entretien",
  reponse_favorable: "entretien",
  reponse_defavorable: "refuse",
  depot: "contacte",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today(): string {
  return toIso(new Date());
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${label} invalide: ${value} (attendu: ${allowed.join(", ")})`);
  }
  return value as T;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return toIso(new Date(year, month - 1, day + days));
}

export const isoAgo = (now: Date, ms: number): string => new Date(now.getTime() - ms).toISOString();

export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || addDays(value, 0) !== value) {
    throw new Error(`date invalide (YYYY-MM-DD attendu): ${value}`);
  }
  return value;
}

// undefined = défaut 7 j, null = pas de relance planifiée.
export function delaiDays(value: string | null | undefined): number | null {
  if (value === null) return null;
  const days = Number(value ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(`délai invalide (1 à 365 jours): ${value}`);
  return days;
}

export function relanceAfter(
  type: InteractionType,
  date: string,
  delai: number | null,
  current: string | null,
  statut: Statut,
): string | null {
  if (CLOSING_STATUTS.has(statut) || statut === "entretien") return null;
  if (type === "reponse") return current;
  if (delai === null) return null;
  return addDays(date, delai);
}

// Identity kept by the user, injected into the letter template. Empty = optional, not set.
export type Profil = { username: string; email: string; telephone: string; adresse: string; site: string; nom_fichier: string };
export const NOM_FICHIER_DEFAUT = "Lettre_Motivation_{username}-{entreprise}";
export const PROFIL_VIDE: Profil = { username: "", email: "", telephone: "", adresse: "", site: "", nom_fichier: NOM_FICHIER_DEFAUT };

// Pattern placeholders filled, then cut to a safe filename (no spaces, no path or symbol chars).
export function fileName(pattern: string, values: Record<string, string>): string {
  const filled = pattern.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
  return filled.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_.-]/gu, "");
}

// {{nom}} {{adresse}} {{telephone}} {{email}} {{site}}: a line whose value is empty is dropped, not left blank.
export function fillProfil(content: string, profil: Profil): string {
  return content
    .split("\n")
    .flatMap((line) => {
      if (!/\{\{(nom|adresse|telephone|email|site)\}\}/.test(line)) return [line];
      const filled = line.replace(/\{\{(nom|adresse|telephone|email|site)\}\}/g, (_, key: string) => (key === "nom" ? profil.username : profil[key as keyof Profil]));
      return filled.trim() ? [filled] : [];
    })
    .join("\n");
}

export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export const MOIS_MIN = "2026-07";

export function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return {};
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

// Sets keys in place, appends new ones, drops keys given an empty value.
export function setFrontmatter(content: string, fields: Record<string, string>): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  const body = match ? content.slice(match[0].length) : content;
  const written = new Set<string>();
  const kept = (match ? match[1].split(/\r?\n/) : []).flatMap((line) => {
    const key = /^([\w-]+):/.exec(line)?.[1];
    if (!key || !(key in fields)) return [line];
    written.add(key);
    return fields[key] ? [`${key}: ${fields[key]}`] : [];
  });
  for (const [key, value] of Object.entries(fields)) if (value && !written.has(key)) kept.push(`${key}: ${value}`);
  return `---\n${kept.join("\n")}\n---\n${body}`;
}

export function stripFrontmatter(content: string): string {
  if (Object.keys(parseFrontmatter(content)).length === 0) return content;
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function statutAfter(type: InteractionType, current: Statut): Statut {
  if (CLOSING_STATUTS.has(current)) return current;
  return STATUT_BY_TYPE[type] ?? current;
}

// Rebuilds statut + prochaine relance from interactions, oldest first (after a delete).
export function replayEchanges(
  statut: Statut,
  rows: { type: InteractionType; date: string; delai: number | null }[],
): { statut: Statut; prochaine: string | null } {
  let current: Statut = CLOSING_STATUTS.has(statut) ? statut : "a_contacter";
  let prochaine: string | null = null;
  for (const row of rows) {
    current = statutAfter(row.type, current);
    prochaine = relanceAfter(row.type, row.date, row.delai, prochaine, current);
  }
  return { statut: current, prochaine: CLOSING_STATUTS.has(current) ? null : prochaine };
}

export function weekStart(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return addDays(iso, -((new Date(year, month - 1, day).getDay() + 6) % 7));
}

export function weeklyCounts(dates: string[], today: string, weeks: number): { week: string; count: number }[] {
  const current = weekStart(today);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ week: addDays(current, (i - weeks + 1) * 7), count: 0 }));
  for (const date of dates) {
    const bucket = buckets.find((b) => b.week === weekStart(date));
    if (bucket) bucket.count++;
  }
  return buckets;
}

export const TABLEUR_COLUMNS = [
  "Nom de l'entreprise", "Secteur", "Adresse", "Code Postal", "Ville", "Domaine d'activité",
  "Nom du contact", "Prénom du contact", "Mail du contact", "Numéro du contact", "Lien linkedin du contact",
  "Nom du RH", "Prénom du RH", "Mail du RH", "Numéro du RH",
  "Candidature Spontanée / Lien vers l'annonce", "Actualité de l'entreprise", "Note sur Google",
  "Compte Linkedin suivi (oui / non)", "Abonnement au compta Insta (oui / non)", "Abonnement au compta Facebook (oui / non)", "Abonnement au compte Tiktok (oui / non)",
  "CV déposé en physique", "CV envoyé par mail", "Contact de la personne qui a récupéré le CV", "Mail envoyé suite au dépôt physique",
  "Appel de relance", "Entretien décroché", "Entretien réalisé", "Réponse positive ou négative", "Commentaire",
] as const;

export type TableurCompany = Record<FicheExtra, string | null> & { nom: string; ville: string | null; notes: string | null; statut: Statut };
export type TableurContact = { nom: string; role: string | null; email: string | null; telephone: string | null; linkedin: string | null };

export const isRh = (role: string | null) => /(^|\W)(d?rh|recrut|talent)/i.test(role ?? "");

// Labels of the fiche gaps, in display order. Blank string counts as missing.
export function missingFields(company: TableurCompany & { site: string | null }, contacts: TableurContact[]): string[] {
  const blank = (value: string | null) => !value?.trim();
  const checks: [string, boolean][] = [
    ["site", blank(company.site)],
    ["ville", blank(company.ville)],
    ["secteur", blank(company.secteur)],
    ["domaine", blank(company.domaine)],
    ["adresse", blank(company.adresse)],
    ["mail", !contacts.some((c) => !blank(c.email))],
    ["téléphone", !contacts.some((c) => !blank(c.telephone))],
    ["contact RH", !contacts.some((c) => isRh(c.role))],
  ];
  return checks.filter(([, missing]) => missing).map(([label]) => label);
}

// One nom field in base ("Jane Doe"), the sheet wants nom then prénom.
function nomPrenom(full: string | undefined): [string, string] {
  const [prenom = "", ...nom] = (full ?? "").trim().split(/\s+/);
  return [nom.join(" "), prenom];
}

const ouiNon = (value: string | null) => (value === "oui" ? "oui" : "non");

export function tableurRow(
  company: TableurCompany,
  contacts: TableurContact[],
  echanges: { type: InteractionType; date: string }[],
  today: string,
): string[] {
  const sorted = [...echanges].sort((a, b) => a.date.localeCompare(b.date));
  const first = (...types: InteractionType[]) => sorted.find((e) => types.includes(e.type))?.date ?? "";
  const contact = contacts.find((c) => !isRh(c.role));
  const rh = contacts.find((c) => isRh(c.role));
  const depot = first("depot");
  const entretiens = sorted.filter((e) => e.type === "entretien");
  const decroche = entretiens[0]?.date ?? (company.statut === "entretien" || company.statut === "offre" ? "oui" : "");
  const derniereReponse = sorted.filter((e) => e.type === "reponse_favorable" || e.type === "reponse_defavorable").at(-1)?.type;
  const reponse =
    company.statut === "offre" ? "Positive"
    : company.statut === "refuse" ? "Négative"
    : derniereReponse === "reponse_favorable" ? "Positive"
    : derniereReponse === "reponse_defavorable" ? "Négative"
    : "";
  return [
    company.nom, company.secteur, company.adresse, company.code_postal, company.ville, company.domaine,
    ...nomPrenom(contact?.nom), contact?.email, contact?.telephone, contact?.linkedin,
    ...nomPrenom(rh?.nom), rh?.email, rh?.telephone,
    company.annonce || "Candidature spontanée", company.actualite, company.note_google,
    ouiNon(company.suivi_linkedin), ouiNon(company.suivi_insta), ouiNon(company.suivi_facebook), ouiNon(company.suivi_tiktok),
    depot, first("mail", "candidature"), company.contact_cv,
    depot ? (sorted.find((e) => e.type === "mail" && e.date >= depot)?.date ?? "") : "",
    first("appel", "relance"), decroche, entretiens.filter((e) => e.date <= today).at(-1)?.date ?? "",
    reponse, company.notes,
  ].map((cell) => cell ?? "");
}

export type ContactField = "nom" | "prenom" | "email" | "tel" | "linkedin";

// Tableur edit of one contact cell: nom + prénom recombined into the stored nom. No target = create.
export function contactWrite(edit: {
  company: string;
  rh: boolean;
  field: ContactField;
  value: string;
  nom: string;
  prenom: string;
  target?: TableurContact & { id: number };
}): { action: "personne" | "personne-modifier"; fields: Record<string, string> } {
  const prenom = edit.field === "prenom" ? edit.value : edit.prenom;
  const nomPart = edit.field === "nom" ? edit.value : edit.nom;
  const t = edit.target;
  const nom = `${prenom} ${nomPart}`.trim() || (t?.nom ?? (edit.rh ? "RH" : "Contact"));
  if (!t) {
    const extra = edit.field === "email" || edit.field === "tel" || edit.field === "linkedin" ? { [edit.field]: edit.value } : {};
    return { action: "personne", fields: { entreprise: edit.company, nom, role: edit.rh ? "RH" : "", ...extra } };
  }
  return {
    action: "personne-modifier",
    fields: {
      id: String(t.id),
      nom,
      role: t.role ?? "",
      email: edit.field === "email" ? edit.value : (t.email ?? ""),
      tel: edit.field === "tel" ? edit.value : (t.telephone ?? ""),
      linkedin: edit.field === "linkedin" ? edit.value : (t.linkedin ?? ""),
    },
  };
}

// Excel paste: quoted cell may hold tabs, newlines and "" escaped quotes.
const tsvCell = (value: string) => (/[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
export const toTsv = (rows: readonly (readonly string[])[]) => rows.map((row) => row.map(tsvCell).join("\t")).join("\n");

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITY[c]);
