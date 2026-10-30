import { CircleCheck, ExternalLink } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type ContactField, type Statut, TABLEUR_COLUMNS, contactWrite, isRh, isWebUrl, missingFields, tableurRow, toTsv } from "../logic";
import type { CompanyRow, Contact } from "../repo";
import { CopyButton, type Send, StatutFilter, StatutSelect, sendFiche } from "./shared";
import type { AppState } from "./store";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from "./ui";

type Row = { company: CompanyRow; contacts: Contact[]; missing: string[]; cells: string[] };
type FicheKey = "secteur" | "adresse" | "code_postal" | "ville" | "domaine" | "annonce" | "actualite" | "note_google" | "contact_cv" | "notes";

// Sheet index -> fiche field. Annonce edits the raw value, not the "Candidature spontanée" fallback.
const FICHE_COLUMN: Record<number, FicheKey> = {
  1: "secteur", 2: "adresse", 3: "code_postal", 4: "ville", 5: "domaine",
  15: "annonce", 16: "actualite", 17: "note_google", 24: "contact_cv", 30: "notes",
};
const SUIVI_COLUMN: Record<number, "suivi_linkedin" | "suivi_insta" | "suivi_facebook" | "suivi_tiktok"> = {
  18: "suivi_linkedin", 19: "suivi_insta", 20: "suivi_facebook", 21: "suivi_tiktok",
};
// Contact cols 6-10, RH cols 11-14 (no linkedin): same order as the sheet.
const CONTACT_FIELD: ContactField[] = ["nom", "prenom", "email", "tel", "linkedin"];
const HEAD = "sticky top-0 z-20 bg-card whitespace-nowrap";

const saveFiche = (send: Send, c: CompanyRow, key: string, value: string) =>
  sendFiche(send, c, { [key]: value });

function saveContact(row: Row, rh: boolean, field: ContactField, value: string, send: Send) {
  const base = rh ? 11 : 6;
  const target = row.contacts.find((x) => isRh(x.role) === rh);
  const { action, fields } = contactWrite({
    company: row.company.nom,
    rh,
    field,
    value,
    nom: row.cells[base],
    prenom: row.cells[base + 1],
    target,
  });
  send(action, fields);
}

const focusOnMount = (el: HTMLElement | null) => el?.focus();

// Click or Enter opens the field. Enter (Ctrl+Enter in textarea) or blur saves if changed, Escape cancels.
function EditableCell({ value, label, multiline = false, onSave }: { value: string; label: string; multiline?: boolean; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const open = useRef(false);
  const back = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!editing && back.current) button.current?.focus();
    back.current = false;
  }, [editing]);
  // Guard: Enter unmounts the field, which may fire a blur too.
  const finish = (next: string | null, refocus: boolean) => {
    if (!open.current) return;
    open.current = false;
    back.current = refocus;
    setEditing(false);
    if (next !== null && next.trim() !== value) onSave(next.trim());
  };
  const link = isWebUrl(value) && (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      aria-label="Ouvrir le lien"
      class="inline-flex size-10 shrink-0 items-center justify-center rounded hover:bg-muted sm:size-8"
    >
      <ExternalLink class="size-4" />
    </a>
  );
  if (editing) {
    const valueOf = (el: EventTarget | null) => (el as HTMLInputElement | HTMLTextAreaElement).value;
    const props = {
      "aria-label": label,
      defaultValue: value,
      ref: focusOnMount,
      onBlur: (e: FocusEvent) => finish(valueOf(e.currentTarget), false),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(null, true);
        } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finish(valueOf(e.currentTarget), true);
        }
      },
    };
    return multiline ? <Textarea class="w-64 text-sm" {...props} /> : <Input class="w-64 text-sm" {...props} />;
  }
  return (
    <span class="inline-flex items-center gap-1">
      <button
        ref={button}
        type="button"
        title={value || undefined}
        onClick={() => {
          open.current = true;
          setEditing(true);
        }}
        class="min-h-10 max-w-56 truncate rounded px-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-8"
      >
        {value || <span class="text-muted-foreground">-</span>}
      </button>
      {link}
    </span>
  );
}

function SheetCell({ row, index, cell, send, openCompany }: { row: Row; index: number; cell: string; send: Send; openCompany: (id: number) => void }) {
  const c = row.company;
  const label = TABLEUR_COLUMNS[index];
  const fiche = FICHE_COLUMN[index];
  const suivi = SUIVI_COLUMN[index];
  if (index === 0)
    return (
      <TableCell class="sticky left-0 z-10 bg-card font-medium whitespace-nowrap">
        <span class="inline-flex items-center gap-1">
          <EditableCell
            value={cell}
            label={label}
            onSave={(nom) => {
              if (nom) send("entreprise-renommer", { entreprise: c.nom, nom });
            }}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Ouvrir la fiche" onClick={() => openCompany(c.id)}>
            <ExternalLink />
          </Button>
        </span>
      </TableCell>
    );
  if (fiche)
    return (
      <TableCell class="max-w-56 whitespace-nowrap">
        <EditableCell value={c[fiche] ?? ""} label={label} multiline={index === 30} onSave={(v) => saveFiche(send, c, fiche, v)} />
      </TableCell>
    );
  if (suivi)
    return (
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          aria-pressed={cell === "oui"}
          onClick={() => saveFiche(send, c, suivi, cell === "oui" ? "" : "oui")}
        >
          {cell}
        </Button>
      </TableCell>
    );
  if (index >= 6 && index <= 14) {
    const rh = index >= 11;
    const field = CONTACT_FIELD[index - (rh ? 11 : 6)];
    return (
      <TableCell class="max-w-56 whitespace-nowrap">
        <EditableCell value={cell} label={label} onSave={(v) => saveContact(row, rh, field, v, send)} />
      </TableCell>
    );
  }
  return (
    <TableCell class="max-w-56 truncate whitespace-nowrap" title={cell}>
      {isWebUrl(cell) ? (
        <a href={cell} target="_blank" rel="noreferrer" class="underline">
          {cell}
        </a>
      ) : (
        cell
      )}
    </TableCell>
  );
}

export function TableurPage({
  state,
  search,
  send,
  openCompany,
}: {
  state: AppState;
  search: string;
  send: Send;
  openCompany: (id: number) => void;
}) {
  const [query, setQuery] = useState(search);
  const [statut, setStatut] = useState<Statut | "">("");
  const [missingOnly, setMissingOnly] = useState(false);
  useEffect(() => setQuery(search), [search]);

  const items: Row[] = state.companies.map((c) => {
    const contacts = state.contacts.filter((x) => x.company_id === c.id);
    return {
      company: c,
      contacts,
      missing: missingFields(c, contacts),
      cells: tableurRow(c, contacts, state.interactions.filter((i) => i.company_id === c.id), state.today),
    };
  });
  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (r) =>
      (!statut || r.company.statut === statut) &&
      (!missingOnly || r.missing.length > 0) &&
      (!needle ||
        [r.company.nom, r.company.ville, r.company.secteur, r.company.domaine, ...r.contacts.flatMap((x) => [x.nom, x.email])]
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
  const missingCount = items.filter((r) => r.missing.length > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Tableur</CardTitle>
        <CardDescription>
          Une ligne par entreprise, mêmes colonnes que le tableau Excel. Les colonnes d'échanges se mettent à jour seules.
        </CardDescription>
        <CardAction>
          <span class="text-sm text-muted-foreground">Copier la vue</span>
          <CopyButton value={toTsv([TABLEUR_COLUMNS, ...shown.map((r) => r.cells)])} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div class="mb-4 flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              aria-label="Rechercher une entreprise"
              placeholder="Rechercher (nom, ville, contact...)"
              class="h-10 sm:h-9 sm:max-w-xs"
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <Button
              variant={missingOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={missingOnly}
              onClick={() => setMissingOnly(!missingOnly)}
            >
              Données manquantes
              <span class={cn("rounded px-1.5 text-xs tabular-nums", missingOnly ? "bg-primary-foreground/20" : "bg-muted")}>{missingCount}</span>
            </Button>
            <span aria-live="polite" class="text-sm text-muted-foreground sm:ml-auto">
              {shown.length} entreprise{shown.length > 1 ? "s" : ""}
            </span>
          </div>
          <StatutFilter companies={state.companies} value={statut} onChange={setStatut} />
        </div>
        <div class="max-h-[70dvh] overflow-auto">
          <table class="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class={HEAD} />
                <TableHead class={HEAD}>Statut</TableHead>
                <TableHead class={HEAD}>Manque</TableHead>
                {TABLEUR_COLUMNS.map((col, i) => (
                  <TableHead class={cn(HEAD, i === 0 && "left-0 z-30")}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={TABLEUR_COLUMNS.length + 3} class="py-10 text-center text-muted-foreground">
                    Aucune entreprise
                  </TableCell>
                </TableRow>
              )}
              {shown.map((r) => (
                <TableRow key={r.company.id}>
                  <TableCell>
                    <CopyButton value={toTsv([r.cells])} />
                  </TableCell>
                  <TableCell>
                    <StatutSelect company={r.company} send={send} />
                  </TableCell>
                  <TableCell>
                    {r.missing.length > 0 ? (
                      <div class="flex max-w-64 flex-wrap gap-1 whitespace-normal">
                        {r.missing.map((label) => (
                          <Badge key={label} variant="outline">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span class="inline-flex items-center gap-1 text-success">
                        <CircleCheck aria-hidden="true" class="size-4" />
                        <span class="sr-only">Complet</span>
                      </span>
                    )}
                  </TableCell>
                  {r.cells.map((cell, i) => (
                    <SheetCell key={i} row={r} index={i} cell={cell} send={send} openCompany={openCompany} />
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
