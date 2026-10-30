import { useEffect, useState } from "preact/hooks";
import type { Profil } from "../logic";
import type { CompanyRow, Contact, DocumentRow, Interaction, Lettre } from "../repo";

export type AppState = {
  today: string;
  companies: CompanyRow[];
  contacts: Contact[];
  interactions: (Interaction & { nom: string })[];
  lettres: Lettre[];
  pdfs: string[];
  documents: DocumentRow[];
  profil: Profil;
};

export type Action =
  | "entreprise"
  | "entreprise-supprimer"
  | "entreprise-renommer"
  | "personne"
  | "personne-supprimer"
  | "personne-modifier"
  | "echange"
  | "echange-supprimer"
  | "echange-modifier"
  | "statut"
  | "sans-reponse"
  | "relance-date"
  | "profil"
  | "fiche"
  | "lettre"
  | "template"
  | "lettre-statut"
  | "lettre-supprimer"
  | "document"
  | "document-pdf"
  | "document-modifier"
  | "document-supprimer";

class Unauthorized extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (body === null) throw new Error(`HTTP ${res.status} sur ${path} (réponse non JSON)`);
  if (res.status === 401) throw new Unauthorized(body.error);
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

const post = (path: string, fields: unknown) =>
  request<AppState>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
  });

export const fetchDocument = (name: string) =>
  request<{ format: string; content: string; html: string }>(`/api/documents/${encodeURIComponent(name)}`);

export const fetchLettre = (file: string) =>
  request<{ content: string; html: string }>(`/api/lettres/${encodeURIComponent(file)}`);

// Sandboxed letter iframe has an opaque origin: no session cookie, so the logo goes in as a data URI.
let logo: Promise<string> | undefined;
export const fetchLogo = () =>
  (logo ??= fetch("/api/logo.png")
    .then((res) => (res.ok ? res.blob() : Promise.reject()))
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => ((logo = undefined), "")));

export function useStore() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  // Overdue relances are pulled to today on load; server UPDATE is idempotent, so reloads are harmless.
  const load = () =>
    request<AppState>("/api/state")
      .then((next) => (next.companies.some((c) => c.prochaine_relance !== null && c.prochaine_relance < next.today) ? post("/api/reporter", {}) : next))
      .then((next) => {
        setState(next);
        setLocked(false);
      })
      .catch((e) => (e instanceof Unauthorized ? setLocked(true) : setError(String(e.message))));

  // No SSE: serverless cannot hold a stream. Refetch when the tab regains focus.
  useEffect(() => {
    load();
    addEventListener("focus", load);
    return () => removeEventListener("focus", load);
  }, []);

  async function send(action: Action, fields: Record<string, string>): Promise<boolean> {
    try {
      setState(await post(`/api/${action}`, fields));
      setError(null);
      return true;
    } catch (e) {
      if (e instanceof Unauthorized) setLocked(true);
      else setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function login(password: string): Promise<void> {
    await request<{ ok: true }>("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    await load();
  }

  async function logout(): Promise<void> {
    await request<{ ok: true }>("/api/logout", { method: "POST" });
    setLocked(true);
  }

  return { state, error, locked, login, logout, clearError: () => setError(null), send, reload: load };
}
