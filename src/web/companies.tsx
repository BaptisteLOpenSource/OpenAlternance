import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, UserPlus } from "lucide-preact";
import { useState } from "preact/hooks";
import { STATUTS, type Statut } from "../logic";
import type { CompanyRow } from "../repo";
import { type Open, RelanceBadge, type Send, StatutFilter, StatutSelect, shortDate } from "./shared";
import type { AppState } from "./store";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "./ui";

type SortKey = "nom" | "statut" | "derniere_interaction" | "prochaine_relance";

const sortValue = (c: CompanyRow, key: SortKey): string | number | null =>
  key === "statut" ? STATUTS.indexOf(c.statut) : key === "nom" ? c.nom.toLowerCase() : c[key];

function compare(a: CompanyRow, b: CompanyRow, key: SortKey, asc: boolean): number {
  const x = sortValue(a, key);
  const y = sortValue(b, key);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return (x < y ? -1 : 1) * (asc ? 1 : -1);
}

export function CompaniesPage({
  state,
  search,
  send,
  onOpen,
  openCompany,
}: {
  state: AppState;
  search: string;
  send: Send;
  onOpen: Open;
  openCompany: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Statut | "">("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "nom", asc: true });
  const query = search.trim().toLowerCase();
  const rows = state.companies
    .filter(
      (c) =>
        (!filter || c.statut === filter) &&
        (!query || `${c.nom} ${c.ville ?? ""} ${c.contacts.join(" ")}`.toLowerCase().includes(query)),
    )
    .sort((a, b) => compare(a, b, sort.key, sort.asc));

  // Plain function, not a component: a component defined here remounts on every render and drops focus.
  const sortHead = (k: SortKey, label: string, cls?: string) => {
    const Icon = sort.key !== k ? ChevronsUpDown : sort.asc ? ArrowUp : ArrowDown;
    return (
      <TableHead class={cls} aria-sort={sort.key === k ? (sort.asc ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          class="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
          onClick={() => setSort({ key: k, asc: sort.key === k ? !sort.asc : true })}
        >
          {label}
          <Icon class={cn("size-3.5", sort.key !== k && "opacity-40")} />
        </button>
      </TableHead>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardDescription role="status">
          {rows.length} sur {state.companies.length} · ouvrir une ligne pour le détail
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => onOpen({ kind: "entreprise" })}>
            <Plus />
            Ajouter
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="grid gap-4">
        <StatutFilter companies={state.companies} value={filter} onChange={setFilter} />
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              {sortHead("nom", "Entreprise", "sticky left-0 z-10 bg-card")}
              {sortHead("statut", "Statut")}
              {sortHead("derniere_interaction", "Dernier échange", "hidden md:table-cell")}
              {sortHead("prochaine_relance", "Relance", "hidden md:table-cell")}
              <TableHead class="hidden md:table-cell">Contacts</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} class="py-10 text-center text-muted-foreground">
                  <p>Aucune entreprise ne correspond.</p>
                  {filter !== "" && (
                    <Button variant="outline" size="sm" class="mt-3" onClick={() => setFilter("")}>
                      Réinitialiser le filtre
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => {
              const contacts = c.contacts.join(", ") || "-";
              return (
                <TableRow key={c.id} class="cursor-pointer" onClick={() => openCompany(c.id)}>
                  <TableCell class="sticky left-0 z-10 bg-card py-3">
                    <a
                      href={`#/entreprises/${c.id}`}
                      class="rounded-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {c.nom}
                    </a>
                    {c.ville && <p class="text-xs text-muted-foreground">{c.ville}</p>}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <StatutSelect company={c} send={send} />
                  </TableCell>
                  <TableCell class="hidden tabular-nums text-muted-foreground md:table-cell">{shortDate(c.derniere_interaction)}</TableCell>
                  <TableCell class="hidden md:table-cell">
                    <RelanceBadge company={c} today={state.today} />
                  </TableCell>
                  <TableCell class="hidden max-w-48 text-muted-foreground md:table-cell">
                    <span class="block truncate" title={contacts}>
                      {contacts}
                    </span>
                  </TableCell>
                  <TableCell class="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" title="Ajouter un échange" aria-label="Ajouter un échange" onClick={() => onOpen({ kind: "echange", company: c.nom })}>
                      <Plus />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title="Ajouter un contact" aria-label="Ajouter un contact" onClick={() => onOpen({ kind: "personne", company: c.nom })}>
                      <UserPlus />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
