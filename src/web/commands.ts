import { fillProfil } from "../logic";
import type { CompanyRow, Lettre, Poste } from "../repo";
import { type Open, type Send, relanceEnvoyee } from "./shared";
import { type AppState, fetchLettre } from "./store";

export type Ctx = {
  state: AppState;
  send: Send;
  open: Open;
  reload: () => void;
  company: CompanyRow | null;
  lettre: Lettre | null;
};

export type Command = {
  id: string;
  label: string;
  scope: "all" | string[];
  pinned?: boolean;
  run: (ctx: Ctx) => unknown;
};

// Letter of a poste; spontanée (no posteId) = letter without poste, or whose poste was deleted.
export const lettreOf = (company: CompanyRow, state: AppState, posteId?: number) =>
  state.lettres.find(
    (l) =>
      l.type === "lettre" &&
      l.entreprise.toLowerCase() === company.nom.toLowerCase() &&
      (l.poste !== undefined && state.postes.some((p) => p.id === l.poste) ? l.poste : undefined) === posteId,
  );

export const deleteLettre = async (lettre: Lettre, send: Send): Promise<boolean> =>
  confirm(`Supprimer la lettre de ${lettre.entreprise || lettre.file} ?`) && (await send("lettre-supprimer", { file: lettre.file })) !== false;

export async function openLettre(company: CompanyRow, lettre: Lettre | null | undefined, send: Send, state: AppState, poste?: Poste) {
  if (lettre) location.hash = `#/lettres/${encodeURIComponent(lettre.file)}`;
  else await createLettre(company, send, state, poste);
}

export async function createLettre(company: CompanyRow, send: Send, state: AppState, poste?: Poste): Promise<string | null> {
  const { content } = await fetchLettre("_template.md");
  const ville = state.agences.find((a) => a.id === poste?.agence_id)?.ville ?? company.ville;
  const draft = fillProfil(
    content
      .replace("type: template-lettre", `type: lettre
entreprise: ${company.nom}
${poste ? `poste: ${poste.id}\n` : ""}statut: brouillon`)
      .replaceAll("{{entreprise}}", company.nom)
      .replaceAll("{{ville}}", ville || "{{ville}}")
      .replaceAll("{{poste}}", poste?.intitule || company.poste || "{{poste}}")
      .replaceAll("{{contrat}}", poste?.contrat ?? "alternance")
      .replaceAll("{{date}}", new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })),
    state.profil,
  );
  const file = await send("lettre", { entreprise: company.nom, content: draft.trimEnd(), ...(poste ? { poste: String(poste.id) } : {}) });
  if (typeof file !== "string") return null;
  location.hash = `#/lettres/${encodeURIComponent(file)}`;
  return file;
}

const relance = ({ send, company }: Ctx) => company && relanceEnvoyee(send, company.nom);

export const COMMANDS: Command[] = [
  { id: "reload", label: "Actualiser", scope: "all", pinned: true, run: ({ reload }) => reload() },
  { id: "entreprise", label: "Nouvelle entreprise", scope: "all", run: ({ open }) => open({ kind: "entreprise" }) },
  { id: "echange", label: "Nouvel échange", scope: "all", run: ({ open, company }) => open({ kind: "echange", company: company?.nom }) },
  { id: "personne", label: "Nouveau contact", scope: "all", run: ({ open, company }) => open({ kind: "personne", company: company?.nom }) },
  { id: "relance", label: "Relancé aujourd'hui", scope: ["company"], run: relance },
  {
    id: "entretien",
    label: "Passer en entretien",
    scope: ["company"],
    run: ({ send, company }) => company && send("statut", { entreprise: company.nom, statut: "entretien" }),
  },
  {
    id: "refus",
    label: "Passer en refusé",
    scope: ["company"],
    run: ({ send, company }) => company && confirm(`Passer ${company.nom} en refusé ?`) && send("statut", { entreprise: company.nom, statut: "refuse" }),
  },
  {
    id: "sans-reponse",
    label: "Arrêter les relances",
    scope: ["company"],
    run: ({ send, company }) =>
      company && confirm(`Arrêter les relances de ${company.nom} (sans réponse) ?`) && send("sans-reponse", { entreprise: company.nom }),
  },
  {
    id: "lettre",
    label: "Lettre de motivation",
    scope: ["company"],
    run: ({ send, company, lettre, state }) => company && openLettre(company, lettre, send, state),
  },
  { id: "fusionner", label: "Fusionner avec une autre entreprise", scope: ["company"], run: ({ open, company }) => company && open({ kind: "fusion", company: company.nom }) },
  {
    id: "lettre-statut",
    label: "Basculer brouillon / envoyée",
    scope: ["company", "lettres"],
    run: ({ send, lettre }) =>
      lettre?.entreprise && send("lettre-statut", { entreprise: lettre.entreprise, statut: lettre.statut === "envoyee" ? "brouillon" : "envoyee" }),
  },
  {
    id: "lettre-supprimer",
    label: "Supprimer la lettre",
    scope: ["company", "lettres"],
    run: ({ send, lettre }) => lettre && deleteLettre(lettre, send),
  },
  {
    id: "site-web",
    label: "Ouvrir le site web",
    scope: ["company", "entreprises"],
    run: ({ company }) => company?.site && window.open(company.site, "_blank", "noopener"),
  },
  { id: "template", label: "Ouvrir le template", scope: ["lettres"], run: () => (location.hash = "#/lettres/_template.md") },
];

export const forScope = (scope: string) => COMMANDS.filter((c) => c.scope === "all" || c.scope.includes(scope));
