import { Trash2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import type { DocumentRow } from "../repo";
import { Select } from "./menus";
import { ECHANGE, type Send } from "./shared";
import { type AppState, fetchDocument } from "./store";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from "./ui";

export const echangeLabel = (state: AppState, id: number | null) => {
  const echange = state.interactions.find((i) => i.id === id);
  const tag = echange && ECHANGE[echange.type as keyof typeof ECHANGE];
  return echange && tag ? `${tag.label} du ${echange.date}` : "";
};

// Hidden inputs named company/echange: works inside a form and standalone.
export function DocumentLinkFields({ state, company, echange, onChange }: { state: AppState; company: string; echange: string; onChange: (company: string, echange: string) => void }) {
  const echanges = state.interactions.filter((i) => String(i.company_id) === company && i.type in ECHANGE);
  return (
    <>
      <Label label="Entreprise liée (optionnel)">
        <Select name="company" value={company} onChange={(v) => onChange(v, "")} options={[{ value: "", label: "Aucune" }, ...state.companies.map((c) => ({ value: String(c.id), label: c.nom }))]} />
      </Label>
      {company && (
        <Label label="Échange lié (optionnel)">
          <Select name="echange" value={echange} onChange={(v) => onChange(company, v)} options={[{ value: "", label: "Aucun" }, ...echanges.map((i) => ({ value: String(i.id), label: echangeLabel(state, i.id) }))]} />
        </Label>
      )}
    </>
  );
}

function DocumentLink({ doc, state, send }: { doc: DocumentRow; state: AppState; send: Send }) {
  const link = (company: string, echange: string) => send("document-lier", { name: doc.name, company, echange });
  return (
    <div class="mb-4 grid gap-4 sm:grid-cols-2">
      <DocumentLinkFields state={state} company={doc.company_id ? String(doc.company_id) : ""} echange={doc.interaction_id ? String(doc.interaction_id) : ""} onChange={link} />
    </div>
  );
}

type View = "apercu" | "edition";

const removeDocument = async (doc: DocumentRow, send: Send) => {
  if (confirm(`Supprimer le document ${doc.name} ?`) && (await send("document-supprimer", { name: doc.name }))) location.hash = "#/documents";
};

// PDF shown by the browser's native viewer; no text is read, so nothing to edit here.
function PdfView({ doc, state, send }: { doc: DocumentRow; state: AppState; send: Send }) {
  const href = `/api/fichiers/${encodeURIComponent(doc.name)}`;
  const convert = async () => {
    if (await send("document-texte", { name: doc.name })) location.hash = `#/documents/${encodeURIComponent(doc.name.replace(/\.pdf$/, ".html"))}`;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">{doc.name}</CardTitle>
        <CardDescription>PDF</CardDescription>
        <CardAction class="flex flex-wrap items-center gap-2">
          <a href={href} download={doc.name} class="text-sm underline underline-offset-4">
            Télécharger
          </a>
          <a href={href} target="_blank" rel="noopener" class="text-sm underline underline-offset-4">
            Ouvrir
          </a>
          <Button variant="outline" size="sm" onClick={convert}>
            Convertir en texte éditable
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer le document" onClick={() => removeDocument(doc, send)}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DocumentLink doc={doc} state={state} send={send} />
        <iframe title={`Aperçu ${doc.name}`} src={href} class="h-[70vh] w-full rounded-lg border" />
      </CardContent>
    </Card>
  );
}

// Preview is the sandboxed render (no script). Edition only for md/txt; html is text extracted from a PDF.
function DocumentView({ doc, state, send }: { doc: DocumentRow; state: AppState; send: Send }) {
  const [data, setData] = useState<{ content: string; html: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<View>("apercu");
  const [error, setError] = useState("");
  const editable = doc.format !== "html";
  // Error stays out of data: a failed load must never reach the editor or Enregistrer.
  const load = () =>
    fetchDocument(doc.name).then(
      (d) => (setError(""), setData(d), setDraft(d.content)),
      (e) => setError(e instanceof Error ? e.message : "Chargement impossible"),
    );
  useEffect(() => {
    setData(null);
    setError("");
    load();
  }, [doc.name]);
  const dirty = !!data && draft !== data.content;
  const save = async () => {
    if (dirty && (await send("document-modifier", { name: doc.name, content: draft }))) load();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">{doc.name}</CardTitle>
        <CardDescription>{doc.format.toUpperCase()}</CardDescription>
        <CardAction class="flex flex-wrap items-center gap-2">
          {editable && (
            <div class="flex rounded-md border p-0.5" role="group" aria-label="Affichage du document">
              {(["apercu", "edition"] as const).map((v) => (
                <Button variant={view === v ? "secondary" : "ghost"} size="sm" class="sm:h-7" aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === "apercu" ? "Aperçu" : "Éditer"}
                </Button>
              ))}
            </div>
          )}
          {dirty && <span role="status" class="text-xs text-warning">Non enregistré</span>}
          {editable && view === "edition" && (
            <Button size="sm" disabled={!dirty} onClick={save}>
              Enregistrer
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer le document" onClick={() => removeDocument(doc, send)}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DocumentLink doc={doc} state={state} send={send} />
        {error ? (
          <p role="alert" class="text-sm text-destructive">
            Document indisponible : {error}
          </p>
        ) : !data ? (
          <p class="text-sm text-muted-foreground">Chargement...</p>
        ) : editable && view === "edition" ? (
          <textarea
            class="min-h-[60vh] w-full resize-y rounded-lg border bg-muted/40 p-4 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft}
            aria-label={`Contenu de ${doc.name}`}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                save();
              }
            }}
          />
        ) : (
          <iframe title={`Aperçu ${doc.name}`} sandbox="" srcdoc={data.html} class={cn("h-[70vh] w-full rounded-lg border")} />
        )}
      </CardContent>
    </Card>
  );
}

export function DocumentsPage({ state, send, selected }: { state: AppState; send: Send; selected?: string }) {
  const doc = state.documents.find((d) => d.name === selected);
  return (
    <div class="grid gap-4 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Stockés en base. Un PDF s'affiche tel quel ; « Convertir en texte éditable » en crée une copie HTML.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.documents.length === 0 ? (
            <p class="text-sm text-muted-foreground">Aucun document. Créez-en un avec « Nouvelle... » dans la barre latérale.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Lié à</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.documents.map((d) => (
                  <TableRow key={d.name} class={cn("cursor-pointer", d.name === selected && "bg-muted/50")} onClick={() => (location.hash = `#/documents/${encodeURIComponent(d.name)}`)}>
                    <TableCell>
                      <a href={`#/documents/${encodeURIComponent(d.name)}`} class="font-medium hover:underline" aria-current={d.name === selected ? "true" : undefined}>
                        {d.name}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell class="text-muted-foreground">
                      {d.company_id && (
                        <a href={`#/entreprises/${d.company_id}`} class="hover:underline" onClick={(e) => e.stopPropagation()}>
                          {state.companies.find((c) => c.id === d.company_id)?.nom}
                        </a>
                      )}
                      {d.interaction_id && ` · ${echangeLabel(state, d.interaction_id)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {doc && (doc.format === "pdf" ? <PdfView key={doc.name} doc={doc} state={state} send={send} /> : <DocumentView key={doc.name} doc={doc} state={state} send={send} />)}
    </div>
  );
}
