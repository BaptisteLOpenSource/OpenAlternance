import { BarChart3, ChevronRight, Bell, Building2, Mail, Table2, Trophy } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { STATUTS, type Statut, TYPES, fileName, weeklyCounts } from "../logic";
import { BarChart, BarList, DataTable, type Datum } from "./charts";
import { DeleteEchange, RelanceBadge, STATUT, type Open, type Send, StatutBadge, isOpen, relanceEnvoyee, shortDate } from "./shared";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "./ui";

function StatCard({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: typeof Bell; tone?: string }) {
  return (
    <Card class="gap-3">
      <CardHeader>
        <CardDescription class="font-medium">{label}</CardDescription>
        <CardAction>
          <div class={cn("flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary", tone)}>
            <Icon class="size-5" />
          </div>
        </CardAction>
        <p class="text-3xl leading-none font-bold tabular-nums">{value}</p>
      </CardHeader>
      <CardContent class="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  data,
  labelHead,
  class: className,
  children,
}: {
  title: string;
  description: string;
  data: Datum[];
  labelHead: string;
  class?: string;
  children: ComponentChildren;
}) {
  const [table, setTable] = useState(false);
  return (
    <Card class={className}>
      <CardHeader>
        <CardTitle class="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction class="flex rounded-md border p-0.5">
          <Button
            variant={table ? "ghost" : "secondary"}
            size="icon-sm"
            class="sm:size-7"
            aria-label="Vue graphique"
            aria-pressed={!table}
            onClick={() => setTable(false)}
          >
            <BarChart3 />
          </Button>
          <Button
            variant={table ? "secondary" : "ghost"}
            size="icon-sm"
            class="sm:size-7"
            aria-label="Vue tableau"
            aria-pressed={table}
            onClick={() => setTable(true)}
          >
            <Table2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{table ? <DataTable data={data} labelHead={labelHead} valueHead="Nombre" /> : children}</CardContent>
    </Card>
  );
}

export function DashboardPage({ state, send, openCompany, onOpen }: { state: AppState; send: Send; openCompany: (id: number) => void; onOpen: Open }) {
  const { companies, interactions, today } = state;
  const [status, setStatus] = useState("");
  const due = companies.filter(isOpen).sort((a, b) => a.prochaine_relance!.localeCompare(b.prochaine_relance!));
  const late = due.filter((c) => c.prochaine_relance! <= today).length;
  const count = (s: Statut) => companies.filter((c) => c.statut === s).length;
  const relancer = async (nom: string) => {
    if (await relanceEnvoyee(send, nom)) setStatus(`Relance enregistrée : ${nom}`);
  };

  const weekly: Datum[] = weeklyCounts(
    interactions.map((i) => i.date),
    today,
    12,
  ).map((w) => ({ label: shortDate(w.week), value: w.count }));
  const pipeline: Datum[] = STATUTS.map((s) => ({ label: STATUT[s].label, value: count(s) }));
  const types: Datum[] = TYPES.map((t) => ({ label: t, value: interactions.filter((i) => i.type === t).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div class="grid motion-safe:animate-fade-up grid-cols-1 gap-4 [animation-delay:100ms] md:gap-6">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Entreprises" value={companies.length} hint={`${count("a_contacter")} à contacter`} icon={Building2} />
        <StatCard label="En cours" value={count("contacte") + count("relance")} hint="contactées ou relancées" icon={Mail} tone="bg-info/15 text-info" />
        <StatCard label="Entretiens" value={count("entretien")} hint={`${count("offre")} offre(s)`} icon={Trophy} tone="bg-success/15 text-success" />
        <StatCard
          label="Relances dues"
          value={late}
          hint={`${due.length} relance(s) planifiée(s)`}
          icon={Bell}
          tone={late > 0 ? "bg-destructive/15 text-destructive" : undefined}
        />
      </div>

      <div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-7">
        <Card class="lg:col-span-4">
          <CardHeader>
            <CardTitle class="text-base">À relancer</CardTitle>
            <CardDescription>Par date, les retards en premier</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-3">
            <p role="status" aria-live="polite" class="text-sm text-muted-foreground empty:hidden">
              {status}
            </p>
            {due.length === 0 ? (
              <p class="text-sm text-muted-foreground">Aucune relance prévue.</p>
            ) : (
              <ul class="grid gap-2">
                {due.map((c) => (
                  <li key={c.id} class="flex flex-wrap items-center gap-3 rounded-lg border border-border/20 bg-background/40 p-3">
                    <button type="button" class="group/item flex min-w-[10rem] flex-1 items-center gap-2 text-left" onClick={() => openCompany(c.id)}>
                      <span class="block min-w-0 flex-1">
                        <span class="block truncate font-medium">{c.nom}</span>
                        <StatutBadge statut={c.statut} class="mt-1" />
                      </span>
                      <ChevronRight aria-hidden="true" class="size-4 text-foreground/40 transition-transform group-hover/item:translate-x-1" />
                    </button>
                    <RelanceBadge company={c} today={today} />
                    <Button variant="outline" size="sm" onClick={() => relancer(c.nom)}>
                      Relancé
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <ChartCard class="lg:col-span-3" title="Types d'échange" description="Tous les échanges enregistrés" data={types} labelHead="Type">
          {types.length === 0 ? <p class="text-sm text-muted-foreground">Aucun échange.</p> : <BarList data={types} />}
        </ChartCard>
      </div>

      <div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-7">
        <ChartCard class="lg:col-span-4" title="Échanges par semaine" description="12 dernières semaines" data={weekly} labelHead="Semaine du">
          <BarChart data={weekly} unit="échange(s)" />
        </ChartCard>
        <ChartCard class="lg:col-span-3" title="Pipeline" description="Entreprises par statut" data={pipeline} labelHead="Statut">
          <BarList data={pipeline} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Activité récente</CardTitle>
          <CardDescription>Derniers échanges enregistrés</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Type</TableHead>
                <TableHead class="hidden sm:table-cell">Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {interactions
                .slice(-8)
                .reverse()
                .map((i) => (
                  <TableRow key={i.id}>
                    <TableCell class="tabular-nums text-muted-foreground">{shortDate(i.date)}</TableCell>
                    <TableCell class="font-medium">
                      <button type="button" class="text-left hover:underline" onClick={() => openCompany(i.company_id)}>
                        {i.nom}
                      </button>
                      {i.note && <span class="block max-w-[10rem] truncate text-xs font-normal text-muted-foreground sm:hidden">{i.note}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{i.type}</Badge>
                    </TableCell>
                    <TableCell class="hidden max-w-[10rem] truncate text-muted-foreground sm:table-cell sm:max-w-md" title={i.note ?? undefined}>
                      {i.note}
                    </TableCell>
                    <TableCell>
                      <DeleteEchange echange={i} send={send} />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Nom du PDF de lettre</CardTitle>
          <CardDescription class="truncate">
            {fileName(state.profil.nom_fichier, { username: state.profil.username || "Prenom_Nom", entreprise: "Entreprise" })}.pdf
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => onOpen({ kind: "profil" })}>
              Modifier
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
    </div>
  );
}
