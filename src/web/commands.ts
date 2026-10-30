import { type Profil, fillProfil, slug } from "../logic";
import type { CompanyRow, Lettre } from "../repo";
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

export const lettreOf = (company: CompanyRow, state: AppState) =>
  state.lettres.find((l) => l.type === "lettre" && l.entreprise.toLowerCase() === company.nom.toLowerCase());

export async function openLettre(company: CompanyRow, lettre: Lettre | null | undefined, send: Send, profil: Profil) {
  if (lettre) location.hash = `#/lettres/${encodeURIComponent(lettre.file)}`;
  else await createLettre(company, send, profil);
}

export async function createLettre(company: CompanyRow, send: Send, profil: Profil): Promise<string | null> {
  const { content } = await fetchLettre("_template.md");
  const draft = fillProfil(
    content
      .replace("type: template-lettre", `type: lettre
entreprise: ${company.nom}
statut: brouillon`)
      .replaceAll("{{entreprise}}", company.nom)
      .replaceAll("{{ville}}", company.ville || "{{ville}}")
      .replaceAll("{{poste}}", company.poste || "{{poste}}")
      .replaceAll("{{date}}", new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })),
    profil,
  );
  // same name as repo.writeLettre gives a new letter
  const file = `${slug(company.nom)}.md`;
  if (!(await send("lettre", { entreprise: company.nom, content: draft.trimEnd() }))) return null;
  location.hash = `#/lettres/${file}`;
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
    run: ({ send, company, lettre, state }) => company && openLettre(company, lettre, send, state.profil),
  },
  {
    id: "lettre-statut",
    label: "Basculer brouillon / envoyée",
    scope: ["company", "lettres"],
    run: ({ send, lettre }) =>
      lettre && send("lettre-statut", { entreprise: lettre.entreprise, statut: lettre.statut === "envoyee" ? "brouillon" : "envoyee" }),
  },
  {
    id: "lettre-supprimer",
    label: "Supprimer la lettre",
    scope: ["company"],
    run: ({ send, company, lettre }) =>
      company && lettre && confirm(`Supprimer la lettre de ${company.nom} ?`) && send("lettre-supprimer", { entreprise: company.nom }),
  },
  { id: "template", label: "Ouvrir le template", scope: ["lettres"], run: () => (location.hash = "#/lettres/_template.md") },
];

export const forScope = (scope: string) => COMMANDS.filter((c) => c.scope === "all" || c.scope.includes(scope));
