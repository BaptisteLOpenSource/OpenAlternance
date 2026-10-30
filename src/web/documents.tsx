import { Trash2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import type { DocumentRow } from "../repo";
import type { Send } from "./shared";
import { type AppState, fetchDocument } from "./store";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from "./ui";

type View = "apercu" | "edition";

// Preview is the sandboxed render (no script). Edition only for md/txt; html comes from a PDF.
function DocumentView({ doc, send }: { doc: DocumentRow; send: Send }) {
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
  const remove = async () => {
    if (confirm(`Supprimer le document ${doc.name} ?`) && (await send("document-supprimer", { name: doc.name }))) location.hash = "#/documents";
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
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer le document" onClick={remove}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
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
          <CardDescription>Stockés en base. Un PDF est converti en HTML (texte seul, mise en page perdue).</CardDescription>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {doc && <DocumentView key={doc.name} doc={doc} send={send} />}
    </div>
  );
}
