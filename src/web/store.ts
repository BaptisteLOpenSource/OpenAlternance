import { useEffect, useRef, useState } from "preact/hooks";
import { type Etat, type Profil, logoPalette } from "../logic";
import type { Agence, Company, CompanyRow, Contact, DocumentRow, Interaction, Lettre, Poste } from "../repo";

// Tracks replayed by the API from history: etat per poste, spontanee per company.
export type PosteEtat = Poste & { etat: Etat };
export type CompanyEtat = CompanyRow & { spontanee: Etat };

export type AppState = {
  today: string;
  companies: CompanyEtat[];
  contacts: Contact[];
  interactions: (Interaction & { nom: string })[];
  postes: PosteEtat[];
  agences: Agence[];
  lettres: Lettre[];
  pdfs: string[];
  documents: DocumentRow[];
  cv: boolean;
  profil: Profil;
};

export type Action =
  | "entreprise"
  | "entreprise-supprimer"
  | "entreprise-renommer"
  | "entreprise-fusionner"
  | "personne"
  | "personne-supprimer"
  | "personne-modifier"
  | "poste"
  | "poste-modifier"
  | "poste-supprimer"
  | "agence"
  | "agence-modifier"
  | "agence-supprimer"
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
  | "document-office"
  | "document-lier"
  | "document-texte"
  | "cv"
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

// file: set only by lettre creation (the server may suffix the name on collision).
const post = (path: string, fields: unknown) =>
  request<AppState & { file?: string }>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
  });

export const fetchDocument = (name: string) =>
  request<{ format: string; content: string; html: string }>(`/api/documents/${encodeURIComponent(name)}`);

const palettes = new Map<string, Promise<string[]>>();
export const fetchPalette = (companyId: number, logo: string): Promise<string[]> => {
  if (!logo) return Promise.resolve([]);
  const key = `${companyId}:${logo}`;
  let palette = palettes.get(key);
  if (!palette) palettes.set(key, (palette = decodePalette(companyId)));
  return palette;
};
const decodePalette = (companyId: number) =>
  new Promise<string[]>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve([]);
      ctx.drawImage(img, 0, 0, 64, 64);
      resolve(logoPalette(ctx.getImageData(0, 0, 64, 64).data));
    };
    img.onerror = () => resolve([]);
    img.src = `/api/logos/${companyId}`;
  });

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

export type Fiches = Record<number, Company>;

// null: the write names no company, so every fiche is dropped.
const touchedIds = (companies: CompanyRow[], fields: Record<string, string>): number[] | null => {
  const names = [fields.entreprise, fields.source, fields.cible].filter(Boolean);
  return names.length === 0 ? null : companies.filter((c) => names.includes(c.nom)).map((c) => c.id);
};

export type DesktopInfo = { mode: "local" | "online"; version: string; update: { version: string; url: string } | null };

export function useStore() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [desktop, setDesktop] = useState<DesktopInfo | null>(null);
  const [fiches, setFiches] = useState<Fiches>({});
  // A fetch overlapping a write may be stale: refetch instead of caching it.
  const writes = useRef(0);

  const failure = (e: unknown) => (e instanceof Unauthorized ? setLocked(true) : setError(String((e as Error).message)));
  const dropFiches = (ids: number[] | null) => {
    writes.current++;
    setFiches((all) => (ids === null ? {} : Object.fromEntries(Object.entries(all).filter(([id]) => !ids.includes(Number(id))))));
  };
  const loadFiche = (id: number): void => {
    const at = writes.current;
    request<Company>(`/api/fiches/${id}`)
      .then((fiche) => (writes.current === at ? setFiches((all) => ({ ...all, [id]: fiche })) : loadFiche(id)))
      .catch(failure);
  };
  const loadFiches = (): void => {
    const at = writes.current;
    request<Company[]>("/api/fiches")
      .then((all) => (writes.current === at ? setFiches(Object.fromEntries(all.map((c) => [c.id, c]))) : loadFiches()))
      .catch(failure);
  };

  // Overdue relances are pulled to today on load; server UPDATE is idempotent, so reloads are harmless.
  const load = () =>
    request<AppState>("/api/state")
      .then((next) => (next.companies.some((c) => c.prochaine_relance !== null && c.prochaine_relance < next.today) ? post("/api/reporter", {}) : next))
      .then((next) => {
        dropFiches(null);
        setState(next);
        setLocked(false);
      })
      .catch(failure);

  // 404 outside the desktop process: stay null, no error shown.
  useEffect(() => {
    request<DesktopInfo>("/api/desktop/info")
      .then(setDesktop)
      .catch(() => setDesktop(null));
  }, []);

  // No SSE: serverless cannot hold a stream. Refetch on tab focus.
  useEffect(() => {
    load();
    addEventListener("focus", load);
    return () => removeEventListener("focus", load);
  }, []);

  async function send(action: Action, fields: Record<string, string>): Promise<boolean | string> {
    const ids = touchedIds(state?.companies ?? [], fields);
    writes.current++;
    try {
      const next = await post(`/api/${action}`, fields);
      dropFiches(ids);
      setState(next);
      setError(null);
      return next.file ?? true;
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

  async function backup(): Promise<string | null> {
    try {
      return (await request<{ file: string }>("/api/desktop/backup", { method: "POST" })).file;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function update(): Promise<boolean> {
    try {
      await request<{ ok: true }>("/api/desktop/update", { method: "POST" });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  return { state, fiches, loadFiche, loadFiches, error, locked, desktop, login, logout, backup, update, clearError: () => setError(null), send, reload: load };
}
