import { SESSION_DAYS, clearSessionCookie, newSessionToken, passwordMatches, sessionCookie, sessionTokenFrom } from "./auth";
import { sql } from "./db";
import { FICHE_TEXTES, LETTRE_STATUTS, MAIL_CANAUX, NOM_FICHIER_DEFAUT, STATUTS, SUIVIS, TYPES, delaiDays, documentFile, isoAgo, isoDate, oneOf, stripFrontmatter, today } from "./logic";
import { MAX_PDF_BASE64, pdfToHtml, renderDocument } from "./documents";
import * as repo from "./repo";

const PASSWORD = process.env.OPENALTERNANCE_PASSWORD ?? "";
const PLACEHOLDER = "change-me-min-16-chars";
const SAFE_FICHIER = /^[\w.-]+\.pdf$/;
const MAX_ATTEMPTS = 10;

export function passwordProblem(password: string): string | null {
  if (!password) return "OPENALTERNANCE_PASSWORD non configuré";
  if (password.length < 16 || password === PLACEHOLDER) return "OPENALTERNANCE_PASSWORD trop faible: 16 caractères minimum, hors valeur d'exemple";
  return null;
}

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });
const notFound = () => json({ error: "Introuvable" }, 404);

// Writes must come from the served origin (SameSite=Strict alone misses some cases). GET is read-only.
function isTrustedRequest(req: Request): boolean {
  return req.method === "GET" || req.headers.get("origin") === new URL(req.url).origin;
}

// Vercel appends the real client IP last; earlier entries are client-controlled.
// Elsewhere the header is spoofable: only the socket address (peer) counts.
const clientIp = (req: Request, peer?: string): string =>
  (process.env.VERCEL ? req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() : peer) || "local";

async function isAuthenticated(req: Request): Promise<boolean> {
  const token = sessionTokenFrom(req);
  if (!token) return false;
  const [session] = await sql`SELECT 1 AS ok FROM sessions WHERE token = ${token} AND created_at > ${isoAgo(new Date(), SESSION_DAYS * 86_400_000)}`;
  return session !== undefined;
}

const state = async () => {
  const [companies, contacts, interactions, lettres, pdfs, documents, profil] = await Promise.all([
    repo.listCompanies(),
    repo.listContacts(),
    repo.listInteractions(),
    repo.listLettres(),
    repo.listPdfs(),
    repo.listDocuments(),
    repo.getProfil(),
  ]);
  return { today: today(), companies, contacts, interactions, lettres, pdfs, documents, profil };
};

type Field = (name: string) => string;

// Relance optionnelle: champ présent mais vide = null (pas de relance); champ absent = défaut.
const delaiField = (body: Record<string, unknown>, optional: (name: string) => string | undefined) =>
  "delai" in body ? (optional("delai") ?? null) : undefined;

const ACTIONS: Record<string, (required: Field, optional: (name: string) => string | undefined, body: Record<string, unknown>) => Promise<void>> = {
  entreprise: (required, optional) =>
    repo.addCompany(required("nom"), { ville: optional("ville"), site: optional("site"), notes: optional("notes") }),
  personne: (required, optional) =>
    repo.addContact(required("entreprise"), {
      nom: required("nom"),
      role: optional("role"),
      email: optional("email"),
      tel: optional("tel"),
      linkedin: optional("linkedin"),
    }),
  echange: (required, optional, body) =>
    repo.logInteraction(required("entreprise"), oneOf(required("type"), TYPES, "type"), {
      date: optional("date"),
      delai: delaiField(body, optional),
      note: optional("note"),
    }),
  fiche: (required, optional) =>
    repo.updateCompany(required("entreprise"), {
      ville: optional("ville"),
      site: optional("site"),
      notes: optional("notes"),
      logo: optional("logo"),
      poste: optional("poste"),
      publication: optional("publication"),
      candidatures: optional("candidatures"),
      reponses: optional("reponses"),
      mail: optional("mail"),
      mail_objet: optional("mail_objet"),
      mail_canal: optional("mail_canal") && oneOf(optional("mail_canal")!, MAIL_CANAUX, "mail_canal"),
      ...Object.fromEntries(FICHE_TEXTES.map((key) => [key, optional(key)])),
      ...Object.fromEntries(SUIVIS.map((key) => [key, optional(key) && oneOf(optional(key)!, ["oui"] as const, key)])),
    }),
  "echange-supprimer": (required) => repo.deleteInteraction(Number(required("id"))),
  "echange-modifier": (required, optional, body) =>
    repo.updateInteraction(Number(required("id")), {
      type: oneOf(required("type"), TYPES, "type"),
      date: isoDate(required("date")),
      delai: delaiDays(delaiField(body, optional)),
      note: optional("note"),
    }),
  "personne-supprimer": (required) => repo.deleteContact(Number(required("id"))),
  "personne-modifier": (required, optional) =>
    repo.updateContact(Number(required("id")), {
      nom: required("nom"),
      role: optional("role"),
      email: optional("email"),
      tel: optional("tel"),
      linkedin: optional("linkedin"),
    }),
  "entreprise-renommer": (required) => repo.renameCompany(required("entreprise"), required("nom")),
  document: (required, optional) => {
    const format = oneOf(required("format"), ["md", "txt"] as const, "format");
    return repo.addDocument(documentFile(required("titre"), format), format, optional("content") ?? "");
  },
  // PDF text becomes HTML here; nothing from the PDF is stored as markup.
  "document-pdf": async (required) => {
    const data = required("data");
    if (data.length > MAX_PDF_BASE64) throw new Error("PDF trop volumineux (3 Mo max)");
    const bytes = Buffer.from(data, "base64");
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("fichier PDF invalide");
    await repo.addDocument(documentFile(required("titre"), "html"), "html", await pdfToHtml(new Uint8Array(bytes)));
  },
  "document-modifier": (required) => repo.updateDocument(required("name"), required("content")),
  "document-supprimer": (required) => repo.deleteDocument(required("name")),
  "entreprise-supprimer": (required) => repo.deleteCompany(required("entreprise")),
  lettre: (required) => repo.writeLettre(required("entreprise"), required("content")),
  template: (required) => repo.writeTemplate(required("content")),
  "lettre-statut": (required, optional) =>
    repo.setLettreStatut(required("entreprise"), oneOf(required("statut"), LETTRE_STATUTS, "statut"), optional("date")),
  "lettre-supprimer": (required) => repo.deleteLettre(required("entreprise")),
  statut: (required) => repo.setStatut(required("entreprise"), oneOf(required("statut"), STATUTS, "statut")),
  "sans-reponse": (required) => repo.closeRelance(required("entreprise")),
  "relance-date": (required) => repo.setRelance(required("entreprise"), required("date")),
  profil: (required, optional) =>
    repo.setProfil({
      username: required("username"),
      email: optional("email") ?? "",
      telephone: optional("telephone") ?? "",
      adresse: optional("adresse") ?? "",
      site: optional("site") ?? "",
      nom_fichier: optional("nom_fichier") ?? NOM_FICHIER_DEFAUT,
    }),
  reporter: () => repo.reporterRelances(),
};

async function login(req: Request, peer?: string): Promise<Response> {
  const ip = clientIp(req, peer);
  const cutoff = isoAgo(new Date(), 15 * 60_000);
  // Record first, then count: concurrent guesses cannot all slip under the limit.
  await sql`DELETE FROM login_attempts WHERE at < ${cutoff}`;
  await sql`INSERT INTO login_attempts (ip, at) VALUES (${ip}, ${new Date().toISOString()})`;
  const [{ attempts }] = await sql<{ attempts: number | string }[]>`SELECT count(*) AS attempts FROM login_attempts WHERE ip = ${ip}`;
  if (Number(attempts) > MAX_ATTEMPTS) return json({ error: "Trop de tentatives, réessayez dans 15 minutes" }, 429);
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!passwordMatches(password, PASSWORD)) return json({ error: "Mot de passe incorrect" }, 401);
  await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;
  const token = newSessionToken();
  await sql`DELETE FROM sessions WHERE created_at < ${isoAgo(new Date(), SESSION_DAYS * 86_400_000)}`;
  await sql`INSERT INTO sessions (token, created_at) VALUES (${token}, ${new Date().toISOString()})`;
  const secure = new URL(req.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, secure) });
}

// Deleting the row is what revokes the session: a copied cookie stops working at once.
async function logout(req: Request): Promise<Response> {
  await sql`DELETE FROM sessions WHERE token = ${sessionTokenFrom(req)}`;
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

async function file(name: string, type: string): Promise<Response> {
  const data = await repo.readFichier(name);
  return data ? new Response(new Uint8Array(data), { headers: { "content-type": type } }) : notFound();
}

async function handleGet(path: string): Promise<Response> {
  if (path === "/api/state") return json(await state());
  if (path === "/api/cv.pdf") return file("cv.pdf", "application/pdf");
  if (path === "/api/logo.png") return file("logo.png", "image/png");
  if (path === "/api/logo.svg") {
    const res = await file("logo.svg", "image/svg+xml");
    // Opened directly, an SVG runs its scripts on this origin: deny everything but inline style.
    res.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
    return res;
  }
  if (path.startsWith("/api/fichiers/")) {
    const name = decodeURIComponent(path.slice("/api/fichiers/".length));
    if (!SAFE_FICHIER.test(name)) return notFound();
    return file(name, "application/pdf");
  }
  if (path.startsWith("/api/documents/")) {
    const doc = await repo.readDocument(decodeURIComponent(path.slice("/api/documents/".length)));
    if (!doc) return notFound();
    return json({ format: doc.format, content: doc.content, html: renderDocument(doc.format, doc.content) });
  }
  if (!path.startsWith("/api/lettres/")) return notFound();
  const content = await repo.readLettre(decodeURIComponent(path.slice("/api/lettres/".length)));
  if (content === null) return notFound();
  // Raw HTML escaped; page renders it in an opaque-origin sandboxed iframe.
  const html = Bun.markdown.html(stripFrontmatter(content), { noHtmlBlocks: true, noHtmlSpans: true });
  return json({ content, html });
}

async function handlePost(req: Request, path: string): Promise<Response> {
  const name = path.slice("/api/".length);
  if (!Object.hasOwn(ACTIONS, name)) return notFound();
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) throw new Error("corps JSON attendu");
    const fields = body as Record<string, unknown>;
    const optional = (name: string) => String(fields[name] ?? "").trim() || undefined;
    const required = (name: string) => {
      const value = optional(name);
      if (!value) throw new Error(`champ requis: ${name}`);
      return value;
    };
    await ACTIONS[name](required, optional, fields);
    return json(await state());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

// Single entry point for every /api/* route. Local server and Vercel function both call it.
export async function handle(req: Request, peer?: string): Promise<Response> {
  try {
    return await route(req, peer);
  } catch (error) {
    console.error(error);
    return json({ error: "Erreur serveur" }, 500);
  }
}

async function route(req: Request, peer?: string): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (!path.startsWith("/api/")) return notFound();
  const weak = passwordProblem(PASSWORD);
  if (weak) return json({ error: weak }, 500);
  if (!isTrustedRequest(req)) return json({ error: "Forbidden" }, 403);
  if (req.method === "POST" && path === "/api/login") return login(req, peer);
  if (req.method === "POST" && path === "/api/logout") return logout(req);
  if (!(await isAuthenticated(req))) return json({ error: "Connexion requise" }, 401);
  if (req.method === "GET") return handleGet(path);
  if (req.method === "POST") return handlePost(req, path);
  return notFound();
}
