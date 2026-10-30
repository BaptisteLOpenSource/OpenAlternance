import { ChevronLeft, ChevronRight, Download } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CLOSING_STATUTS, LETTRE_STATUTS, type Profil, MOIS_MIN, escapeHtml, fileName, toIso } from "../logic";
import type { Lettre } from "../repo";
import { createLettre, lettreOf } from "./commands";
import { Select } from "./menus";
import { CopyButton, LETTRE_LABEL, LettreStatutControl, type Send, isOpen, lettreStatut, shortDate } from "./shared";
import { type AppState, fetchLettre, fetchLogo } from "./store";
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

export function CalendarPage({ state, openCompany }: { state: AppState; openCompany: (id: number) => void }) {
  const [month, setMonth] = useState(state.today.slice(0, 7));
  const [year, monthIndex] = month.split("-").map(Number);
  const shift = (delta: number) => setMonth(toIso(new Date(year, monthIndex - 1 + delta, 1)).slice(0, 7));
  const events = useMemo(() => {
    const map = new Map<string, { relance: boolean; label: string; companyId: number }[]>();
    const push = (date: string, relance: boolean, label: string, companyId: number) =>
      map.set(date, [...(map.get(date) ?? []), { relance, label, companyId }]);
    for (const i of state.interactions) push(i.date, false, `${i.type} · ${i.nom}`, i.company_id);
    for (const c of state.companies.filter(isOpen)) push(c.prochaine_relance!, true, `relance · ${c.nom}`, c.id);
    return map;
  }, [state]);
  const offset = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, d) => toIso(new Date(year, monthIndex - 1, d + 1)))];
  const title = new Date(year, monthIndex - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const dayLabel = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  // Mobile: grid cells too narrow for labels, so days with events stack as an agenda.
  const agenda = cells.filter((iso): iso is string => iso !== null && events.has(iso));
  return (
    <Card>
      <CardHeader>
        <CardTitle class="capitalize">{title}</CardTitle>
        <CardDescription>
          <span class="mr-3 inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-warning" />relance</span>
          <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-info" />échange</span>
        </CardDescription>
        <CardAction class="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={month <= MOIS_MIN}
            title={month <= MOIS_MIN ? "Début des données" : undefined}
            onClick={() => shift(-1)}
            aria-label="Mois précédent"
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(state.today.slice(0, 7))}>
            Aujourd'hui
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Mois suivant">
            <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol class="grid gap-2 sm:hidden">
          {agenda.map((iso) => (
            <li key={iso} class="grid gap-2 rounded-lg border p-3">
              <p class="text-sm font-medium capitalize">{dayLabel(iso)}</p>
              <ul class="grid gap-1.5">
                {(events.get(iso) ?? []).map((e, k) => (
                  <li key={k} class="flex items-center gap-2 text-sm">
                    <span class={cn("size-2 shrink-0 rounded-full", e.relance ? "bg-warning" : "bg-info")} />
                    <button type="button" class="min-w-0 break-words py-2 text-left hover:underline" onClick={() => openCompany(e.companyId)}>
                      {e.label}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {agenda.length === 0 && <li class="text-sm text-muted-foreground">Aucun événement ce mois-ci.</li>}
        </ol>
        <div class="hidden grid-cols-7 overflow-hidden rounded-lg border sm:grid">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} class="border-b bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((iso, idx) => (
            <div
              key={iso ?? `pad-${idx}`}
              role={iso ? "group" : undefined}
              aria-label={iso ? `${dayLabel(iso)} : ${(events.get(iso) ?? []).length} événement(s)` : undefined}
              class={cn("min-h-24 min-w-0 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0", !iso && "bg-muted/30")}
            >
              {iso && (
                <>
                  <span
                    aria-current={iso === state.today ? "date" : undefined}
                    class={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                      iso === state.today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {Number(iso.slice(8))}
                  </span>
                  <ul class="mt-1 grid min-w-0 gap-1">
                    {(events.get(iso) ?? []).map((e, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          class={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs hover:underline", e.relance ? "bg-warning/20" : "bg-info/15")}
                          title={e.label}
                          onClick={() => openCompany(e.companyId)}
                        >
                          {e.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// A4 sheet in its own document: same markup for the preview and the PDF print.
const letterDoc = (title: string, body: string, logo: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;700;800&display=swap">
<style>
@page { size: A4; margin: 0 }
html { background: #d4d4d8 }
body { margin: 0; padding: 16px 0 }
.sheet { position: relative; display: flex; flex-direction: column; box-sizing: border-box; width: 210mm; min-height: 297mm;
  margin: 0 auto; padding: 22mm 20mm 18mm; background: #fff; color: #111; font: 300 10.5pt/1.6 Lexend, "Segoe UI", sans-serif;
  box-shadow: 0 4px 24px #0002 }
.logo { position: absolute; top: 20mm; right: 22mm; width: 30mm }
h1 { display: none }
p { margin: 0 0 1.1em; white-space: pre-line; text-align: justify }
strong { font-weight: 700 }
.sheet > p:nth-of-type(1) strong { display: block; max-width: 9em; font-size: 28pt; font-weight: 800; letter-spacing: .3em; line-height: 1.2 }
.sheet > p:nth-of-type(2) { font-weight: 700; line-height: 1.9; margin-bottom: 1.6em }
.sheet > p:nth-of-type(3), .sheet > p:nth-of-type(4) { margin: 0 0 .8em 2mm; font-size: 9pt; font-weight: 400; line-height: 1.3 }
.sheet > p:nth-of-type(5) { margin: 0 0 2.2em 2mm; padding-bottom: 3mm; border-bottom: 1.5px solid #111; font-size: 9pt; font-weight: 400 }
.sheet > p:last-child { display: flex; justify-content: space-between; align-items: flex-end; margin: auto 0 0 }
.sheet > p:last-child::after { content: ""; width: 75mm; border-bottom: 1.5px solid #111 }
@media screen and (max-width: 820px) { .sheet { width: auto; min-height: 0 } }
@media print { html { background: none } body { padding: 0 } .sheet { margin: 0; box-shadow: none } }
</style><script>onmessage = (e) => e.data === "print" && print()</script></head><body><div class="sheet">${logo && `<img class="logo" src="${logo}" alt="">`}${body}</div></body></html>`;

// Rendered markdown, no scripts: html comes from the editable .md file.
const proseDoc = (body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 16px; font: 14px/1.6 system-ui, sans-serif; color: #111; background: #fff }
p { margin: 0 0 1em; white-space: pre-line } h1 { font-size: 1.3em }
@media (prefers-color-scheme: dark) { body { color: #e4e4e7; background: #18181b } }
</style></head><body>${body}</body></html>`;

type View = "pdf" | "md" | "texte";
const VIEW_LABEL: Record<View, string> = { pdf: "Aperçu PDF", md: "Markdown", texte: "Texte" };

function LettreView({ lettre, send, onTemplate, profil, onDirty }: { lettre: Lettre; send: Send; onTemplate: () => void; profil: Profil; onDirty: (dirty: boolean) => void }) {
  const [data, setData] = useState<{ content: string; html: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<View>("pdf");
  const [logo, setLogo] = useState("");
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  // Error stays out of data: a failed load must never reach the editor or Enregistrer.
  const load = () =>
    fetchLettre(lettre.file).then(
      (d) => (setError(""), setData(d), setDraft(d.content.trimEnd())),
      (e) => setError(e instanceof Error ? e.message : "Chargement impossible"),
    );
  useEffect(() => {
    setData(null);
    setError("");
    load();
  }, [lettre.file]);
  useEffect(() => void fetchLogo().then(setLogo), []);
  const isTemplate = lettre.type === "template-lettre";
  const editable = isTemplate || (lettre.type === "lettre" && !!lettre.entreprise);
  const dirty = !!data && draft !== data.content.trimEnd();
  useEffect(() => onDirty(dirty), [dirty]);
  const save = async () => {
    if (!dirty) return true;
    const saved = isTemplate ? await send("template", { content: draft }) : await send("lettre", { entreprise: lettre.entreprise, content: draft });
    if (saved) load();
    return saved;
  };
  const text = useMemo(
    () => (data ? (new DOMParser().parseFromString(data.html, "text/html").body.textContent ?? "").trim() : ""),
    [data],
  );
  const title = fileName(profil.nom_fichier, { username: profil.username, entreprise: lettre.entreprise || lettre.file });
  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">{lettre.entreprise || lettre.file}</CardTitle>
        <CardDescription>lettres/{lettre.file}</CardDescription>
        <CardAction class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-md border p-0.5" role="group" aria-label="Affichage de la lettre">
            {(["pdf", "md", "texte"] as const).map((v) => (
              <Button variant={view === v ? "secondary" : "ghost"} size="sm" class="sm:h-7" aria-pressed={view === v} onClick={() => setView(v)}>
                {VIEW_LABEL[v]}
              </Button>
            ))}
          </div>
          {dirty && <span role="status" class="text-xs text-warning">Non enregistré</span>}
          {lettre.type === "lettre" && editable && <LettreStatutControl lettre={lettre} send={send} dirty={dirty} onSave={save} />}
          {view === "md" && editable && (
            <Button size="sm" disabled={!dirty} onClick={save}>
              Enregistrer
            </Button>
          )}
          {view === "texte" && <CopyButton value={text} />}
          {view !== "pdf" && !isTemplate && (
            <Button variant="outline" size="sm" onClick={onTemplate}>
              Template
            </Button>
          )}
          <Button size="sm" disabled={!data} onClick={() => (view === "pdf" ? frame.current?.contentWindow?.postMessage("print", "*") : setView("pdf"))}>
            <Download />
            {view === "pdf" ? "Imprimer" : "Aperçu PDF"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" class="text-sm text-destructive">
            Lettre indisponible : {error}
          </p>
        ) : !data ? (
          <p class="text-sm text-muted-foreground">Chargement...</p>
        ) : view === "pdf" ? (
          <iframe
            ref={frame}
            title={`Aperçu PDF ${lettre.entreprise}`}
            sandbox="allow-scripts allow-modals"
            srcdoc={letterDoc(title, data.html, logo)}
            class="h-[75dvh] w-full rounded-lg border md:h-[calc(297mm+32px)]"
          />
        ) : view === "md" ? (
          <textarea
            class="min-h-[60vh] w-full resize-y rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft}
            readOnly={!editable}
            aria-label={`Markdown ${lettre.entreprise || lettre.file}`}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                save();
              }
            }}
          />
        ) : (
          <iframe title={`Texte ${lettre.entreprise || lettre.file}`} sandbox="" srcdoc={proseDoc(data.html)} class="h-[60vh] w-full rounded-lg border" />
        )}
      </CardContent>
    </Card>
  );
}

export function LettresPage({ state, send, initial }: { state: AppState; send: Send; initial?: string }) {
  // Selection lives in the hash, so back/forward and deep links work.
  const file = initial ?? null;
  const setFile = (f: string) => (location.hash = `#/lettres/${encodeURIComponent(f)}`);
  const detail = useRef<HTMLDivElement>(null);
  // Focus only after a user pick; load and back/forward only scroll (mobile).
  const focusNext = useRef(false);
  const select = (f: string) => {
    if (f === file) return;
    focusNext.current = true;
    setFile(f);
  };
  useEffect(() => {
    const el = detail.current;
    if (!el) return;
    if (focusNext.current) el.focus({ preventScroll: true });
    focusNext.current = false;
    if (matchMedia("(max-width: 767px)").matches) el.scrollIntoView({ block: "start" });
  }, [file]);
  const letters = state.lettres.filter((l) => l.type === "lettre");
  const selected = state.lettres.find((l) => l.file === file);
  const [pick, setPick] = useState("");
  const [dirty, setDirty] = useState(false);
  const free = state.companies.filter((c) => !CLOSING_STATUTS.has(c.statut) && !lettreOf(c, state));
  const add = async () => {
    const company = state.companies.find((c) => c.nom === pick);
    const created = company && (await createLettre(company, send, state.profil));
    if (created) {
      select(created);
      setPick("");
    }
  };
  return (
    <div class="grid gap-4 md:gap-6">
      {state.pdfs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>PDF importés</CardTitle>
            <CardDescription>Lettres au format PDF stockées en base</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-wrap gap-2">
            {state.pdfs.map((name) => (
              <a href={`/api/fichiers/${encodeURIComponent(name)}`} target="_blank" rel="noopener" class="text-sm underline underline-offset-4">
                {name}
                <span class="sr-only"> (nouvel onglet)</span>
              </a>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Lettres de motivation</CardTitle>
          <CardDescription>Fichiers du dossier lettres/ · clic pour l'aperçu</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => select("_template.md")}>
              Template
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entreprise</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead class="hidden sm:table-cell">Envoyée le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {letters.map((l) => (
                <TableRow key={l.file} class={cn("cursor-pointer", l.file === file && "bg-muted/50")} onClick={(e) => !(e.target as Element).closest("button, [popover]") && select(l.file)}>
                  <TableCell>
                    <button
                      type="button"
                      class="text-left font-medium hover:underline"
                      aria-current={l.file === file ? "true" : undefined}
                      onClick={() => select(l.file)}
                    >
                      {l.entreprise}
                    </button>
                    <span class="block text-xs tabular-nums text-muted-foreground sm:hidden">{shortDate(l.date_envoi ?? null)}</span>
                  </TableCell>
                  <TableCell>
                    {/* open letter with unsaved text: its own control guards the change */}
                    {l.entreprise && !(dirty && l.file === file) ? (
                      <span class="inline-flex">
                        <Select
                          class="w-auto py-0 text-sm sm:h-8"
                          aria-label={`Statut de la lettre ${l.entreprise}`}
                          value={lettreStatut(l)}
                          options={LETTRE_STATUTS.map((s) => ({ value: s, label: LETTRE_LABEL[s] }))}
                          onChange={(statut) => send("lettre-statut", { entreprise: l.entreprise, statut })}
                        />
                      </span>
                    ) : (
                      <Badge variant={lettreStatut(l) === "envoyee" ? "success" : "outline"}>
                        {LETTRE_LABEL[lettreStatut(l)]}
                        {dirty && l.file === file && <span class="sr-only"> (enregistrez avant de changer le statut)</span>}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell class="hidden tabular-nums sm:table-cell">{shortDate(l.date_envoi ?? null)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {letters.length === 0 && <p class="mt-2 text-sm text-muted-foreground">Aucune lettre.</p>}
          {free.length === 0 ? (
            <p class="mt-4 text-sm text-muted-foreground">Aucune entreprise sans lettre. Ajoutez une entreprise ou rouvrez-en une fermée.</p>
          ) : (
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <Select
                class="w-auto py-0 text-sm sm:h-8"
                aria-label="Entreprise de la nouvelle lettre"
                value={pick}
                onChange={setPick}
                options={[{ value: "", label: "Choisir une entreprise" }, ...free.map((c) => c.nom)]}
              />
              <Button size="sm" disabled={!pick} onClick={add}>
                Ajouter lettre de motivation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {selected && (
        <div ref={detail} tabIndex={-1} class="focus:outline-none">
          <LettreView
            key={`${selected.file}-${selected.statut}-${selected.date_envoi}`}
            lettre={selected}
            send={send}
            profil={state.profil}
            onDirty={setDirty}
            onTemplate={() => select("_template.md")}
          />
        </div>
      )}
    </div>
  );
}
