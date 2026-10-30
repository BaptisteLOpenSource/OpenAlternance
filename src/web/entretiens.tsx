import { Pencil } from "lucide-preact";
import { type Open, StatutBadge, shortDate } from "./shared";
import type { AppState } from "./store";
import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui";

type Entretien = AppState["interactions"][number];

// Year shown: "Passés" spans years and "À venir" can cross New Year.
const dateLabel = (iso: string) => `${shortDate(iso)} ${iso.slice(0, 4)}`;

function EntretienSection({
  id,
  title,
  rows,
  companies,
  onOpen,
  openCompany,
}: {
  id: string;
  title: string;
  rows: Entretien[];
  companies: AppState["companies"];
  onOpen: Open;
  openCompany: (id: number) => void;
}) {
  // Table (desktop) and cards (mobile) render the same cells.
  const cells = (i: Entretien) => {
    const c = companies.find((x) => x.id === i.company_id);
    return {
      date: <time dateTime={i.date}>{dateLabel(i.date)}</time>,
      company: (
        <button
          type="button"
          class="inline-flex min-h-10 items-center rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:min-h-6"
          onClick={() => openCompany(i.company_id)}
        >
          {i.nom}
        </button>
      ),
      statut: c ? <StatutBadge statut={c.statut} /> : "-",
      note: i.note || "-",
      edit: (
        <Button variant="ghost" size="icon-sm" aria-label="Modifier l'entretien" onClick={() => onOpen({ kind: "modifier-echange", id: i.id })}>
          <Pencil />
        </Button>
      ),
    };
  };
  return (
    <section class="grid gap-2" aria-labelledby={id}>
      <h2 id={id} class="text-sm font-semibold text-foreground">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p class="text-sm text-muted-foreground">Aucun entretien</p>
      ) : (
        <>
          <div class="hidden sm:block">
            <Table aria-label={title}>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead scope="col">Date</TableHead>
                  <TableHead scope="col">Entreprise</TableHead>
                  <TableHead scope="col">Statut</TableHead>
                  <TableHead scope="col">Note</TableHead>
                  <TableHead scope="col" class="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => {
                  const p = cells(i);
                  return (
                    <TableRow key={i.id}>
                      <TableCell class="tabular-nums">{p.date}</TableCell>
                      <TableCell>{p.company}</TableCell>
                      <TableCell>{p.statut}</TableCell>
                      <TableCell class="max-w-64 truncate text-muted-foreground" title={i.note || undefined}>
                        {p.note}
                      </TableCell>
                      <TableCell class="text-right">{p.edit}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ul class="grid gap-2 sm:hidden">
            {rows.map((i) => {
              const p = cells(i);
              return (
                <li key={i.id} class="grid gap-2 rounded-lg border p-3">
                  <div class="flex items-start justify-between gap-2">
                    {p.company}
                    {p.edit}
                  </div>
                  <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {p.date}
                    {p.statut}
                  </div>
                  <p class="line-clamp-2 text-sm text-muted-foreground" title={i.note || undefined}>
                    {p.note}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function EntretiensPage({
  state,
  onOpen,
  openCompany,
}: {
  state: AppState;
  onOpen: Open;
  openCompany: (id: number) => void;
}) {
  const entretiens = state.interactions.filter((i) => i.type === "entretien");
  const aVenir = entretiens.filter((i) => i.date >= state.today).sort((a, b) => a.date.localeCompare(b.date));
  const passes = entretiens.filter((i) => i.date < state.today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card>
      <CardHeader>
        <CardDescription>Chaque entretien est un échange lié à une entreprise.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => onOpen({ kind: "echange", type: "entretien" })}>
            Nouvel entretien
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="grid gap-6">
        <EntretienSection id="entretiens-a-venir" title="À venir" rows={aVenir} companies={state.companies} onOpen={onOpen} openCompany={openCompany} />
        <EntretienSection id="entretiens-passes" title="Passés" rows={passes} companies={state.companies} onOpen={onOpen} openCompany={openCompany} />
      </CardContent>
    </Card>
  );
}
