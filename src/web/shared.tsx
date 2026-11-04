import { Ban, Check, CircleCheck, CircleDashed, CircleX, Copy, FileUp, Handshake, Hourglass, Mail, MessageSquare, Phone, Redo2, Send, Trash2, Trophy, UserX, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { CLOSING_STATUTS, CONTRATS, type Contrat, FICHE_EXTRA, type FicheExtra, LETTRE_STATUTS, type InteractionType, type LettreStatut, STATUTS, type Statut, TYPES, today } from "../logic";
import type { Company, CompanyRow, Lettre } from "../repo";
import type { Action, AppState, CompanyEtat, PosteEtat } from "./store";
import { Select } from "./menus";
import { ToggleGroup, useToast } from "./fx";
import { Badge, type BadgeVariant, Button, Dialog, Input } from "./ui";

export const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

// Commands hidden from the right-click menu (ids). Stored so new commands show by default.
const HIDDEN_KEY = "commandes-masquees";
export const readHidden = (): string[] => {
  try {
    return JSON.parse(stored(HIDDEN_KEY) ?? "[]");
  } catch {
    return [];
  }
};
export const writeHidden = (ids: string[]) => store(HIDDEN_KEY, JSON.stringify(ids));

export const LETTRE_LABEL: Record<LettreStatut, string> = { brouillon: "Brouillon", envoyee: "Envoyée" };
export const lettreStatut = (lettre: Lettre): LettreStatut => (lettre.statut === "envoyee" ? "envoyee" : "brouillon");

// Semantic tone: success = positive, warning = waiting, destructive = negative, info = standard action.
type Tag = { label: string; variant: BadgeVariant; icon: typeof Mail };
const DOT: Record<BadgeVariant, string> = {
  default: "bg-primary",
  secondary: "bg-foreground",
  outline: "bg-muted-foreground",
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
};
export const dotOf = (tag: Tag) => DOT[tag.variant];

export const STATUT: Record<Statut, Tag> = {
  a_contacter: { label: "À contacter", variant: "outline", icon: CircleDashed },
  contacte: { label: "Contacté", variant: "info", icon: Send },
  relance: { label: "Relancé", variant: "warning", icon: Redo2 },
  entretien: { label: "Entretien", variant: "success", icon: Handshake },
  offre: { label: "Offre", variant: "success", icon: Trophy },
  refuse: { label: "Refusé", variant: "destructive", icon: CircleX },
  sans_reponse: { label: "Pas de réponse", variant: "warning", icon: Hourglass },
  indisponible: { label: "Pas d'alternant", variant: "outline", icon: UserX },
};

export const ECHANGE: Record<(typeof TYPES)[number], Tag> = {
  mail: { label: "Email", variant: "info", icon: Mail },
  appel: { label: "Appel", variant: "info", icon: Phone },
  candidature: { label: "Candidature", variant: "info", icon: Send },
  relance: { label: "Relance", variant: "warning", icon: Redo2 },
  entretien: { label: "Entretien", variant: "success", icon: Handshake },
  reponse: { label: "Réponse", variant: "outline", icon: MessageSquare },
  reponse_favorable: { label: "Réponse favorable", variant: "success", icon: CircleCheck },
  reponse_defavorable: { label: "Réponse défavorable", variant: "destructive", icon: CircleX },
  depot: { label: "CV déposé", variant: "info", icon: FileUp },
};
export const CONTRAT_LABEL: Record<Contrat, string> = { alternance: "Alternance", stage: "Stage", cdd: "CDD", cdi: "CDI", interim: "Intérim" };
export const CONTRAT_OPTIONS = CONTRATS.map((c) => ({ value: c, label: CONTRAT_LABEL[c] }));
export const echangeLabel = (type: string) => ECHANGE[type as (typeof TYPES)[number]]?.label ?? type;

export const TagBadge = ({ tag, class: className }: { tag: Tag; class?: string }) => (
  <Badge variant={tag.variant} class={className}>
    <tag.icon aria-hidden="true" />
    {tag.label}
  </Badge>
);
export const EchangeBadge = ({ type }: { type: string }) =>
  type in ECHANGE ? <TagBadge tag={ECHANGE[type as (typeof TYPES)[number]]} /> : <Badge variant="outline">{type}</Badge>;

export const formFields = (form: HTMLFormElement) =>
  Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));

// Resolves false on failure, true on success, or the created letter's file name.
export type Send = (action: Action, fields: Record<string, string>) => Promise<boolean | string>;
export type DialogState = {
  kind: "entreprise" | "personne" | "echange" | "modifier-personne" | "modifier-echange" | "lettre" | "document" | "profil" | "poste" | "modifier-poste" | "agence" | "fusion";
  company?: string;
  id?: number;
  type?: InteractionType;
} | null;
export type Open = (dialog: DialogState) => void;

export const isOpen = (c: CompanyRow) => c.prochaine_relance !== null && !CLOSING_STATUTS.has(c.statut);
export const isTodo = (c: CompanyRow, today: string) => isOpen(c) && c.prochaine_relance! <= today;

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "-";

export const ficheOf = (company: Company) => ({
  ville: company.ville ?? "",
  site: company.site ?? "",
  notes: company.notes ?? "",
  logo: company.logo ?? "",
  poste: company.poste ?? "",
  publication: company.publication ?? "",
  candidatures: company.candidatures ?? "",
  reponses: company.reponses ?? "",
  mail: company.mail ?? "",
  mail_objet: company.mail_objet ?? "",
  mail_canal: company.mail_canal ?? "email",
  ...(Object.fromEntries(FICHE_EXTRA.map((key) => [key, company[key] ?? ""])) as Record<FicheExtra, string>),
});

// fiche is a full replace. Stale render snapshot must not drop
// a field still in flight from the previous save.
const inFlight = new Map<string, Record<string, string>>();
export async function sendFiche(send: Send, company: Company, changes: Record<string, string>): Promise<boolean> {
  const payload = { entreprise: company.nom, ...ficheOf(company), ...inFlight.get(company.nom), ...changes };
  inFlight.set(company.nom, payload);
  const ok = (await send("fiche", payload)) !== false;
  if (inFlight.get(company.nom) === payload) inFlight.delete(company.nom);
  return ok;
}

export const posteParam = (poste?: { id: number }): Record<string, string> => (poste ? { poste: String(poste.id) } : {});

// Company-level actions hit the track holding company.prochaine_relance (undefined = spontanée).
export function dueTrack(state: AppState, company: CompanyEtat): PosteEtat | undefined {
  let due: PosteEtat | undefined;
  for (const p of state.postes)
    if (p.company_id === company.id && p.etat.prochaine !== null && (!due || p.etat.prochaine < due.etat.prochaine!)) due = p;
  const spontanee = company.spontanee.prochaine;
  return due && (spontanee === null || due.etat.prochaine! < spontanee) ? due : undefined;
}

export const relanceEnvoyee = (send: Send, nom: string, poste?: PosteEtat) => send("echange", { entreprise: nom, type: "relance", ...posteParam(poste) });

export function StatutFilter({
  companies,
  value,
  onChange,
}: {
  companies: { statut: Statut }[];
  value: Statut | "";
  onChange: (s: Statut | "") => void;
}) {
  return (
    <ToggleGroup
      label="Filtrer par statut"
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "Tous", count: companies.length },
        ...STATUTS.map((s) => ({ value: s, label: STATUT[s].label, count: companies.filter((c) => c.statut === s).length })),
      ]}
    />
  );
}

export function RelanceBadge({ company, today }: { company: CompanyRow; today: string }) {
  if (!isOpen(company)) return <span class="text-muted-foreground">-</span>;
  const date = company.prochaine_relance!;
  const badge =
    date < today ? <Badge variant="destructive">En retard · {shortDate(date)}</Badge> :
    date === today ? <Badge variant="warning">Aujourd'hui</Badge> :
    <Badge variant="outline">{shortDate(date)}</Badge>;
  if (company.retard === 0) return badge;
  return (
    <span class="inline-flex flex-wrap items-center gap-1.5">
      {badge}
      <Badge variant="destructive">+{company.retard} j de retard</Badge>
    </span>
  );
}

// Relance prévue: décaler (date) ou annuler. Même contrôle sur fiche entreprise, historique et todo.
export function RelanceControls({ company, send, poste }: { company: CompanyRow; send: Send; poste?: PosteEtat }) {
  const target = { entreprise: company.nom, ...posteParam(poste) };
  const label = poste ? `${company.nom} · ${poste.intitule}` : company.nom;
  return (
    <span class="inline-flex flex-wrap items-center gap-2">
      <Input
        type="date"
        class="w-auto text-sm sm:h-8"
        aria-label={`Décaler la relance de ${label}`}
        value={(poste ? poste.etat.prochaine : company.prochaine_relance) ?? ""}
        onChange={(e) => e.currentTarget.value && send("relance-date", { ...target, date: e.currentTarget.value })}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => confirm(`Annuler la relance de ${label} ? Le statut est conservé.`) && send("sans-reponse", target)}
      >
        <Ban />
        Annuler la relance
      </Button>
    </span>
  );
}

export const StatutBadge = ({ statut, class: className }: { statut: Statut; class?: string }) => (
  <TagBadge tag={STATUT[statut]} class={className} />
);

export function DeleteEchange({ echange, send }: { echange: { id: number; type: string; date: string }; send: Send }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Supprimer l'échange"
      onClick={(e) => {
        e.stopPropagation();
        if (confirm(`Supprimer l'échange « ${echangeLabel(echange.type)} » du ${shortDate(echange.date)} ?`)) {
          send("echange-supprimer", { id: String(echange.id) });
        }
      }}
    >
      <Trash2 />
    </Button>
  );
}

const COPY_STATE = {
  idle: { label: "Copier", Icon: Copy },
  ok: { label: "Copié", Icon: Check },
  fail: { label: "Copie impossible", Icon: X },
};

export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<keyof typeof COPY_STATE>("idle");
  const settle = (next: keyof typeof COPY_STATE) => {
    setState(next);
    setTimeout(() => setState("idle"), 1000);
  };
  const { label, Icon } = COPY_STATE[state];
  const notify = useToast();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() =>
        Promise.resolve()
          .then(() => navigator.clipboard.writeText(value))
          .then(
            () => (settle("ok"), notify("Copié")),
            () => (settle("fail"), notify("Copie impossible", "error")),
          )
      }
    >
      <Icon />
      <span class="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}

// Writes the poste's track, or the spontanée track without poste; statut = what that track shows.
export const StatutSelect = ({ company, statut, poste, send }: { company: Pick<CompanyRow, "nom">; statut: Statut; poste?: PosteEtat; send: Send }) => (
  <Select
    value={statut}
    aria-label={poste ? `Statut du poste ${poste.intitule}` : `Statut de ${company.nom}`}
    options={STATUTS.map((s) => ({ value: s, label: STATUT[s].label }))}
    renderOption={(s) => <StatutBadge statut={s as Statut} />}
    renderValue={(s) => <StatutBadge statut={s as Statut} class="pr-1.5" />}
    onChange={(statut) => send("statut", { entreprise: company.nom, statut, ...posteParam(poste) })}
  />
);

// Brouillon / envoyée + date d'envoi. The status write reloads the letter, so unsaved text must be saved or dropped first.
// Parent remounts on change (key) so the editor reloads the new frontmatter.
export function LettreStatutControl({
  lettre,
  send,
  dirty,
  onSave,
}: {
  lettre: Lettre;
  send: Send;
  dirty: boolean;
  onSave: () => Promise<boolean>;
}) {
  const statut = lettreStatut(lettre);
  const [pending, setPending] = useState<{ next: LettreStatut; date?: string } | null>(null);
  // bumping nonce remounts the controls, so a cancelled change shows the saved statut again
  const [nonce, setNonce] = useState(0);
  const apply = ({ next, date }: { next: LettreStatut; date?: string }) =>
    send("lettre-statut", { entreprise: lettre.entreprise, statut: next, ...(date ? { date } : {}) });
  const request = (next: LettreStatut, date?: string) => {
    if (dirty) setPending({ next, date });
    else apply({ next, date });
  };
  const cancel = () => {
    setPending(null);
    setNonce((n) => n + 1);
  };
  return (
    <div class="flex flex-wrap items-center gap-2">
      <Select
        key={`s${nonce}`}
        class="w-auto py-0 text-sm sm:h-8"
        aria-label="Statut de la lettre"
        value={statut}
        options={LETTRE_STATUTS.map((s) => ({ value: s, label: LETTRE_LABEL[s] }))}
        onChange={(s) => request(s as LettreStatut)}
      />
      <Input
        key={`d${nonce}`}
        type="date"
        class="w-auto text-sm sm:h-8"
        aria-label="Date d'envoi"
        value={lettre.date_envoi ?? ""}
        disabled={statut !== "envoyee"}
        onChange={(e) => e.currentTarget.value && request("envoyee", e.currentTarget.value)}
      />
      <Button variant="outline" size="sm" onClick={() => request("envoyee", today())}>
        Aujourd'hui
      </Button>
      <Dialog open={pending !== null} onClose={cancel} title="Modifications non enregistrées" description="Le statut est enregistré à part. Le texte non enregistré serait perdu.">
        <div class="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={cancel}>
            Annuler le changement
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const change = pending;
              setPending(null);
              if (change) apply(change);
            }}
          >
            Abandonner les modifications
          </Button>
          <Button
            onClick={async () => {
              const change = pending;
              setPending(null);
              if (change && (await onSave())) apply(change);
            }}
          >
            Enregistrer puis changer
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
