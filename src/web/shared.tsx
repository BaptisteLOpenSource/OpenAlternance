import { Ban, Check, Copy, Trash2, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { CLOSING_STATUTS, FICHE_EXTRA, type FicheExtra, LETTRE_STATUTS, type InteractionType, type LettreStatut, STATUTS, type Statut, today } from "../logic";
import type { CompanyRow, Lettre } from "../repo";
import type { Action } from "./store";
import { Select } from "./menus";
import { ToggleGroup, useToast } from "./fx";
import { Badge, type BadgeVariant, Button, Dialog, Input, cn } from "./ui";

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

export const STATUT: Record<Statut, { label: string; variant: BadgeVariant; dot: string }> = {
  a_contacter: { label: "À contacter", variant: "outline", dot: "bg-muted-foreground" },
  contacte: { label: "Contacté", variant: "info", dot: "bg-info" },
  relance: { label: "Relancé", variant: "warning", dot: "bg-warning" },
  entretien: { label: "Entretien", variant: "secondary", dot: "bg-foreground" },
  offre: { label: "Offre", variant: "success", dot: "bg-success" },
  refuse: { label: "Refusé", variant: "destructive", dot: "bg-destructive" },
  sans_reponse: { label: "Pas de réponse", variant: "outline", dot: "bg-muted-foreground" },
  indisponible: { label: "Pas d'alternant", variant: "outline", dot: "bg-muted-foreground" },
};

export const formFields = (form: HTMLFormElement) =>
  Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));

export type Send = (action: Action, fields: Record<string, string>) => Promise<boolean>;
export type DialogState = {
  kind: "entreprise" | "personne" | "echange" | "modifier-personne" | "modifier-echange" | "lettre" | "document" | "profil";
  company?: string;
  id?: number;
  type?: InteractionType;
} | null;
export type Open = (dialog: DialogState) => void;

export const isOpen = (c: CompanyRow) => c.prochaine_relance !== null && !CLOSING_STATUTS.has(c.statut);
export const isTodo = (c: CompanyRow, today: string) => isOpen(c) && c.prochaine_relance! <= today;

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "-";

export const ficheOf = (company: CompanyRow) => ({
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
export async function sendFiche(send: Send, company: CompanyRow, changes: Record<string, string>): Promise<boolean> {
  const payload = { entreprise: company.nom, ...ficheOf(company), ...inFlight.get(company.nom), ...changes };
  inFlight.set(company.nom, payload);
  const ok = await send("fiche", payload);
  if (inFlight.get(company.nom) === payload) inFlight.delete(company.nom);
  return ok;
}

export const relanceEnvoyee = (send: Send, nom: string) => send("echange", { entreprise: nom, type: "relance" });

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
export function RelanceControls({ company, send }: { company: CompanyRow; send: Send }) {
  return (
    <span class="inline-flex flex-wrap items-center gap-2">
      <Input
        type="date"
        class="w-auto text-sm sm:h-8"
        aria-label={`Décaler la relance de ${company.nom}`}
        value={company.prochaine_relance ?? ""}
        onChange={(e) => e.currentTarget.value && send("relance-date", { entreprise: company.nom, date: e.currentTarget.value })}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => confirm(`Annuler la relance de ${company.nom} ? Le statut est conservé.`) && send("sans-reponse", { entreprise: company.nom })}
      >
        <Ban />
        Annuler la relance
      </Button>
    </span>
  );
}

export const StatutBadge = ({ statut, class: className }: { statut: Statut; class?: string }) => (
  <Badge variant={STATUT[statut].variant} class={className}>
    <span class={cn("size-1.5 rounded-full", STATUT[statut].dot)} />
    {STATUT[statut].label}
  </Badge>
);

export function DeleteEchange({ echange, send }: { echange: { id: number; type: string; date: string }; send: Send }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Supprimer l'échange"
      onClick={(e) => {
        e.stopPropagation();
        if (confirm(`Supprimer l'échange « ${echange.type} » du ${shortDate(echange.date)} ?`)) {
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

export const StatutSelect = ({ company, send }: { company: CompanyRow; send: Send }) => (
  <Select
    value={company.statut}
    aria-label={`Statut de ${company.nom}`}
    options={STATUTS.map((s) => ({ value: s, label: STATUT[s].label }))}
    renderValue={(s) => <StatutBadge statut={s as Statut} class="pr-1.5" />}
    onChange={(statut) => send("statut", { entreprise: company.nom, statut })}
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
