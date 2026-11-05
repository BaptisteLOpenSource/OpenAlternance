import { ChevronLeft, ChevronRight, Printer, Save, Trash2, X } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CLOSING_STATUTS, LETTRE_STATUTS, type Profil, MOIS_MIN, escapeHtml, fileName, parseFrontmatter, placeholders, setFrontmatter, stripFrontmatter, toIso } from "../logic";
import type { Lettre } from "../repo";
import { createLettre, deleteLettre, lettreOf } from "./commands";
import { Toggle, VariablesPanel, VisualEditor } from "./lettre";
import { Select } from "./menus";
import { CopyButton, LETTRE_LABEL, ECHANGE, LettreStatutControl, type Send, TagBadge, type Tag, dotOf, isEchange, isOpen, lettreStatut, shortDate } from "./shared";
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
    const map = new Map<string, { tag: Tag; nom: string; companyId: number }[]>();
    const push = (date: string, tag: Tag, nom: string, companyId: number) => map.set(date, [...(map.get(date) ?? []), { tag, nom, companyId }]);
    for (const i of state.interactions) if (isEchange(i.type)) push(i.date, ECHANGE[i.type], i.nom, i.company_id);
    for (const c of state.companies.filter(isOpen)) push(c.prochaine_relance!, { ...ECHANGE.relance, label: "Relance prévue" }, c.nom, c.id);
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
          {(
            [
              ["Positif", ECHANGE.reponse_favorable],
              ["En attente", ECHANGE.relance],
              ["Négatif", ECHANGE.reponse_defavorable],
              ["Action", ECHANGE.candidature],
            ] as const
          ).map(([label, tag]) => (
            <span key={label} class="mr-3 inline-flex items-center gap-1.5">
              <span class={cn("size-2 rounded-full", dotOf(tag))} />
              {label}
            </span>
          ))}
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
                    <TagBadge tag={e.tag} />
                    <button type="button" class="min-w-0 break-words py-2 text-left hover:underline" onClick={() => openCompany(e.companyId)}>
                      {e.nom}
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
                  <ul class="mt-1 grid min-w-0 gap-0.5">
                    {(events.get(iso) ?? []).slice(0, 2).map((e, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          class="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-foreground hover:bg-muted"
                          title={`${e.tag.label} · ${e.nom}`}
                          onClick={() => openCompany(e.companyId)}
                        >
                          <span class={cn("size-1.5 shrink-0 rounded-full", dotOf(e.tag))} />
                          <e.tag.icon aria-hidden="true" class="size-3 shrink-0" />
                          <span class="truncate">{e.nom}</span>
                        </button>
                      </li>
                    ))}
                    {(events.get(iso) ?? []).length > 2 && (
                      <li>
                        <button type="button" popovertarget={`cal-${iso}`} aria-label={`${(events.get(iso) ?? []).length - 2} autres événements, ${dayLabel(iso)}`} class="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted">
                          +{(events.get(iso) ?? []).length - 2}
                        </button>
                        <div role="dialog" id={`cal-${iso}`} popover aria-label={dayLabel(iso)} class="m-auto grid max-w-sm gap-1.5 rounded-lg border bg-card p-3 text-card-foreground shadow-lg">
                          <p class="text-sm font-medium capitalize">{dayLabel(iso)}</p>
                          {(events.get(iso) ?? []).map((e, k) => (
                            <div key={k} class="flex items-center gap-2 text-sm">
                              <TagBadge tag={e.tag} />
                              <button
                                type="button"
                                class="min-w-0 break-words text-left hover:underline"
                                onClick={(ev) => {
                                  ev.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
                                  openCompany(e.companyId);
                                }}
                              >
                                {e.nom}
                              </button>
                            </div>
                          ))}
                        </div>
                      </li>
                    )}
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
h2 { margin: 1.2em 0 .5em; font-size: 12pt; font-weight: 700 }
ul, ol { margin: 0 0 1.1em; padding-left: 1.4em }
blockquote { margin: 0 0 1.1em; padding: .6em 1em; border-left: 3px solid #111; background: #f4f4f5 }
blockquote p { margin: 0 }
a { color: inherit }
@media screen and (max-width: 820px) { .sheet { width: auto; min-height: 0 } }
@media print { html { background: none } body { padding: 0 } .sheet { margin: 0; box-shadow: none } }
</style><script>onmessage = (e) => e.data === "print" && print()</script></head><body><div class="sheet">${logo && `<img class="logo" src="${logo}" alt="">`}${body}</div></body></html>`;

type View = "pdf" | "visuel" | "md";
const VIEW_LABEL: Record<View, string> = { pdf: "Aperçu PDF", visuel: "Visuel", md: "Markdown" };
const META_KEY = "lettre-meta";
const readMeta = () => {
  try {
    return localStorage.getItem(META_KEY) === "1";
  } catch {
    return false;
  }
};

function LettreView({ lettre, send, onTemplate, profil, onDirty }: { lettre: Lettre; send: Send; onTemplate: () => void; profil: Profil; onDirty: (dirty: boolean) => void }) {
  const [data, setData] = useState<{ content: string; html: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<View>("pdf");
  const [logo, setLogo] = useState("");
  const [error, setError] = useState("");
  const [showMeta, setShowMeta] = useState(readMeta);
  const frame = useRef<HTMLIFrameElement>(null);
  const printNext = useRef(false);
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
  const editable = isTemplate || lettre.type === "lettre";
  const dirty = !!data && draft !== data.content.trimEnd();
  useEffect(() => onDirty(dirty), [dirty]);
  const save = async (content = draft) => {
    if (!data || content === data.content.trimEnd()) return true;
    setDraft(content);
    const saved = (isTemplate ? await send("template", { content }) : await send("lettre", { file: lettre.file, content })) !== false;
    if (saved) load();
    return saved;
  };
  const body = stripFrontmatter(draft);
  const head = draft.slice(0, draft.length - body.length);
  const withBody = (md: string) => (head ? `${head}\n${md}` : md);
  const fields = parseFrontmatter(draft);
  const logoOn = fields.logo !== "masque";
  const missing = isTemplate ? [] : placeholders(draft);
  // Visual and PDF render the saved html, so a pending edit is saved before switching.
  const switchView = async (next: View) => {
    if (next === view || !(await save())) return;
    setView(next);
  };
  const print = () => {
    if (view === "pdf") return frame.current?.contentWindow?.postMessage("print", "*");
    printNext.current = true;
    switchView("pdf");
  };
  const toggleMeta = (on: boolean) => {
    setShowMeta(on);
    try {
      localStorage.setItem(META_KEY, on ? "1" : "0");
    } catch {}
  };
  const text = useMemo(
    () => (data ? (new DOMParser().parseFromString(data.html, "text/html").body.textContent ?? "").trim() : ""),
    [data],
  );
  const title = fileName(profil.nom_fichier, { username: profil.username, entreprise: lettre.entreprise || lettre.file });
  // Print names the PDF after the top document's title, not the iframe's <title>.
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
  const remove = async () => {
    if (await deleteLettre(lettre, send)) location.hash = "#/lettres";
  };
  const name = lettre.entreprise || lettre.file;
  return (
    <Card class="gap-0">
      <CardHeader class="pb-4">
        <CardTitle class="text-base">{name}</CardTitle>
        <CardDescription class="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span role="status" class="text-xs text-warning">
              Non enregistré
            </span>
          ) : (
            <span class="text-xs">Enregistré</span>
          )}
          {showMeta && (
            <span class="font-mono text-xs">
              lettres/{lettre.file}
              {Object.entries(fields)
                .map(([k, v]) => ` · ${k}: ${v}`)
                .join("")}
            </span>
          )}
        </CardDescription>
        <CardAction class="flex flex-wrap items-center gap-2">
          {lettre.type === "lettre" && !!lettre.entreprise && <LettreStatutControl lettre={lettre} send={send} dirty={dirty} onSave={save} />}
          {editable && (
            <Button size="sm" variant="outline" disabled={!dirty} onClick={() => save()}>
              <Save />
              Enregistrer
            </Button>
          )}
          <Button size="sm" disabled={!data} onClick={print}>
            <Printer />
            Imprimer
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer l'aperçu" onClick={() => (location.hash = "#/lettres")}>
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <div class="flex flex-wrap items-center justify-between gap-3 border-y bg-muted/30 px-6 py-2">
        <div class="flex rounded-md border bg-background p-0.5" role="group" aria-label="Mode d'affichage">
          {(["pdf", "visuel", "md"] as const).map((v) => (
            <Button key={v} variant={view === v ? "default" : "ghost"} size="sm" class="sm:h-7" aria-pressed={view === v} onClick={() => switchView(v)}>
              {VIEW_LABEL[v]}
            </Button>
          ))}
        </div>
        <div class="flex flex-wrap items-center gap-4">
          {editable && <Toggle label="Logo" checked={logoOn} onChange={(on) => save(setFrontmatter(draft, { logo: on ? "" : "masque" }))} />}
          <Toggle label="Métadonnées" checked={showMeta} onChange={toggleMeta} />
          <span class="h-5 w-px bg-border" />
          <CopyButton value={text} />
          {!isTemplate && (
            <Button variant="ghost" size="sm" onClick={onTemplate}>
              Template
            </Button>
          )}
          {lettre.type === "lettre" && (
            <Button variant="ghost" size="icon-sm" aria-label="Supprimer la lettre" onClick={remove}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <CardContent class="pt-4">
        {error ? (
          <p role="alert" class="text-sm text-destructive">
            Lettre indisponible : {error}
          </p>
        ) : !data ? (
          <p class="text-sm text-muted-foreground">Chargement...</p>
        ) : view === "pdf" ? (
          <div class="grid gap-2">
            {missing.length > 0 && (
              <p role="status" class="text-sm text-warning">
                {missing.length} variable(s) à compléter avant envoi.{" "}
                <button type="button" class="underline underline-offset-4" onClick={() => switchView("visuel")}>
                  Compléter
                </button>
              </p>
            )}
            <iframe
              ref={frame}
              title={`Aperçu PDF ${lettre.entreprise}`}
              sandbox="allow-scripts allow-modals"
              srcdoc={letterDoc(title, data.html, logoOn ? logo : "")}
              onLoad={() => {
                if (!printNext.current) return;
                printNext.current = false;
                frame.current?.contentWindow?.postMessage("print", "*");
              }}
              class="h-[75dvh] w-full rounded-lg border md:h-[calc(297mm+32px)]"
            />
          </div>
        ) : (
          <div class={cn("grid gap-4", editable && !isTemplate && "lg:grid-cols-[1fr_18rem]")}>
            {view === "visuel" ? (
              <VisualEditor key={data.html} html={data.html} label={`Lettre ${name}`} readOnly={!editable} onChange={(md) => setDraft(withBody(md))} onSave={() => save()} />
            ) : (
              <textarea
                class="min-h-[60vh] w-full resize-y rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={showMeta ? draft : body.replace(/^\n/, "")}
                readOnly={!editable}
                aria-label={`Markdown ${name}`}
                onInput={(e) => setDraft(showMeta ? e.currentTarget.value : withBody(e.currentTarget.value))}
                onBlur={() => save()}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    e.preventDefault();
                    save();
                  }
                }}
              />
            )}
            {editable && !isTemplate && <VariablesPanel content={draft} onChange={save} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TABS = ["toutes", "envoyees", "brouillons"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { toutes: "Toutes", brouillons: "Brouillons", envoyees: "Envoyées" };

function LettreList({ list, file, dirty, select, label, send }: { list: Lettre[]; file: string | null; dirty: boolean; select: (f: string) => void; label: (l: Lettre) => string; send: Send }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Entreprise</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead class="hidden sm:table-cell">Envoyée le</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
          {list.map((l) => (
            <TableRow key={l.file} data-lettre={l.file} class={cn("cursor-pointer", l.file === file && "bg-muted/50")} onClick={(e) => !(e.target as Element).closest("button, [popover]") && select(l.file)}>
              <TableCell>
                <button
                  type="button"
                  class="text-left font-medium hover:underline"
                  aria-current={l.file === file ? "true" : undefined}
                  onClick={() => select(l.file)}
                >
                  {label(l)}
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
  const lettreLabel = (l: Lettre) => {
    const intitule = state.postes.find((p) => p.id === l.poste)?.intitule;
    return intitule ? `${l.entreprise} · ${intitule}` : l.entreprise;
  };
  const selected = state.lettres.find((l) => l.file === file);
  const [pick, setPick] = useState("");
  const [tab, setTab] = useState<Tab>("toutes");
  const [dirty, setDirty] = useState(false);
  const free = state.companies.filter((c) => !CLOSING_STATUTS.has(c.statut) && !lettreOf(c, state));
  const add = async () => {
    const company = state.companies.find((c) => c.nom === pick);
    const created = company && (await createLettre(company, send, state));
    if (created) {
      select(created);
      setPick("");
    }
  };
  const groups = [
    { tab: "brouillons", title: "Brouillons", list: letters.filter((l) => lettreStatut(l) === "brouillon") },
    { tab: "envoyees", title: "Envoyées", list: letters.filter((l) => lettreStatut(l) === "envoyee") },
  ] as const;
  const count = (t: Tab) => (t === "toutes" ? letters.length : groups.find((g) => g.tab === t)!.list.length);
  return (
    <div class={cn("grid items-start gap-4 md:gap-6", selected && "lg:grid-cols-2")}>
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
            <CardDescription>
              Nom du PDF : {fileName(state.profil.nom_fichier, { username: state.profil.username || "Prenom_Nom", entreprise: "Entreprise" })}.pdf ·{" "}
              <a href="#/compte" class="underline underline-offset-4">
                Modifier
              </a>
            </CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => select("_template.md")}>
                Template
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div class="flex w-fit max-w-full flex-wrap rounded-md border p-0.5" role="group" aria-label="Filtrer les lettres">
              {TABS.map((t) => (
                <Button variant={tab === t ? "secondary" : "ghost"} size="sm" class="sm:h-7" aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABEL[t]} ({count(t)})
                </Button>
              ))}
            </div>
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
        {groups.map(
          (g) =>
            (tab === "toutes" ? g.list.length > 0 : tab === g.tab) && (
              <Card key={g.tab}>
                <CardHeader>
                  <CardTitle class="text-base">{g.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {g.list.length === 0 ? (
                    <p class="text-sm text-muted-foreground">Aucune lettre.</p>
                  ) : (
                    <LettreList list={g.list} file={file} dirty={dirty} select={select} label={lettreLabel} send={send} />
                  )}
                </CardContent>
              </Card>
            ),
        )}
        {tab === "toutes" && letters.length === 0 && <p class="text-sm text-muted-foreground">Aucune lettre.</p>}
      </div>
      {selected && (
        <div ref={detail} tabIndex={-1} class="focus:outline-none lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
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
