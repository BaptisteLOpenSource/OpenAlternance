import { useState } from "preact/hooks";
import { CLOSING_STATUTS, TYPES } from "../logic";
import { createLettre, lettreOf } from "./commands";
import { ProfilForm } from "./profil";
import { type DialogState, type Send, formFields } from "./shared";
import type { Action, AppState } from "./store";
import { Select } from "./menus";
import { Button, Dialog, Input, Label, Textarea } from "./ui";

type Kind = NonNullable<DialogState>["kind"];

const TITLES: Record<Kind, string> = {
  entreprise: "Nouvelle entreprise",
  personne: "Nouveau contact",
  echange: "Nouvel échange",
  "modifier-personne": "Modifier le contact",
  "modifier-echange": "Modifier l'échange",
  lettre: "Nouvelle lettre de motivation",
  document: "Nouveau document",
  profil: "Mon profil et lettres",
};

const ACTION: Partial<Record<Kind, Action>> = {
  entreprise: "entreprise",
  personne: "personne",
  echange: "echange",
  "modifier-personne": "personne-modifier",
  "modifier-echange": "echange-modifier",
};

const MAX_PDF_BYTES = 3_000_000;

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function LettreForm({ state, send, company, onClose }: { state: AppState; send: Send; company?: string; onClose: () => void }) {
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const nom = String(new FormData(e.currentTarget as HTMLFormElement).get("entreprise"));
    const target = state.companies.find((c) => c.nom === nom);
    if (!target) return;
    // never overwrite: an existing letter is opened instead
    const existing = lettreOf(target, state);
    if (existing) location.hash = `#/lettres/${encodeURIComponent(existing.file)}`;
    else if (!(await createLettre(target, send, state.profil))) return;
    onClose();
  };
  return (
    <form class="grid gap-4" onSubmit={submit}>
      <Label label="Entreprise">
        <Select
          name="entreprise"
          value={company}
          options={state.companies.filter((c) => c.nom === company || !CLOSING_STATUTS.has(c.statut)).map((c) => c.nom)}
        />
      </Label>
      <p class="text-sm text-muted-foreground">Crée la lettre depuis le template. Si l'entreprise en a déjà une, elle s'ouvre.</p>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="submit">Créer la lettre</Button>
      </div>
    </form>
  );
}

// Markdown or text typed here; PDF converted to HTML on the server.
function DocumentForm({ send, onClose }: { send: Send; onClose: () => void }) {
  const [format, setFormat] = useState<"pdf" | "md" | "txt">("pdf");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const titre = String(form.get("titre") ?? "").trim();
    let ok: boolean;
    if (format === "pdf") {
      const file = form.get("pdf");
      if (!(file instanceof File) || file.size === 0) return setError("Choisissez un fichier PDF");
      if (file.size > MAX_PDF_BYTES) return setError("PDF trop lourd (3 Mo max)");
      ok = await send("document-pdf", { titre, data: await readBase64(file) });
    } else {
      ok = await send("document", { titre, format, content: String(form.get("content") ?? "") });
    }
    if (ok) onClose();
  };
  return (
    <form class="grid gap-4" onSubmit={submit}>
      <Label label="Type">
        <Select
          value={format}
          onChange={(v) => {
            setFormat(v as typeof format);
            setError(null);
          }}
          options={[
            { value: "pdf", label: "PDF (converti en HTML)" },
            { value: "md", label: "Markdown" },
            { value: "txt", label: "Texte (TXT)" },
          ]}
        />
      </Label>
      <Label label="Titre">
        <Input name="titre" required autofocus />
      </Label>
      {format === "pdf" ? (
        <Label label="Fichier PDF">
          <Input name="pdf" type="file" accept="application/pdf" required />
        </Label>
      ) : (
        <Label label="Contenu">
          <Textarea name="content" class="min-h-48 font-mono text-sm" />
        </Label>
      )}
      {error && <p role="alert" class="text-sm text-destructive">{error}</p>}
      <p class="text-sm text-muted-foreground">Le texte est enregistré tel quel, sans balises ni scripts.</p>
      <div class="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="submit">Créer</Button>
      </div>
    </form>
  );
}

export function ActionDialog({ dialog, state, send, onClose }: { dialog: DialogState; state: AppState; send: Send; onClose: () => void }) {
  const kind = dialog?.kind;
  const contact = state.contacts.find((c) => c.id === dialog?.id);
  const echange = state.interactions.find((i) => i.id === dialog?.id);
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const action = kind && ACTION[kind];
    if (!action) return;
    const fields = formFields(e.currentTarget as HTMLFormElement);
    if (await send(action, fields)) onClose();
  };
  const companySelect = (
    <Label label="Entreprise">
      <Select name="entreprise" value={dialog?.company} options={state.companies.map((c) => c.nom)} />
    </Label>
  );
  const ownForm = () => {
    if (kind === "lettre") return <LettreForm state={state} send={send} company={dialog?.company} onClose={onClose} />;
    if (kind === "document") return <DocumentForm send={send} onClose={onClose} />;
    if (kind === "profil") return <ProfilForm profil={state.profil} send={send} onDone={onClose} />;
  };
  return (
    <Dialog open={dialog !== null} onClose={onClose} title={kind ? TITLES[kind] : ""}>
      {ownForm() ?? (
        <form class="grid gap-4" onSubmit={submit}>
          {kind === "entreprise" && (
            <>
              <Label label="Nom"><Input name="nom" required autofocus /></Label>
              <div class="grid gap-4 sm:grid-cols-2">
                <Label label="Ville"><Input name="ville" /></Label>
                <Label label="Site"><Input name="site" type="url" placeholder="https://" /></Label>
              </div>
              <Label label="Notes"><Textarea name="notes" /></Label>
            </>
          )}
          {kind === "personne" && (
            <>
              {companySelect}
              <ContactFields />
            </>
          )}
          {kind === "modifier-personne" && contact && (
            <>
              <input type="hidden" name="id" value={contact.id} />
              <ContactFields contact={contact} />
            </>
          )}
          {kind === "echange" && (
            <>
              {companySelect}
              <div class="grid gap-4 sm:grid-cols-3">
                <Label label="Type">
                  <Select name="type" value={dialog?.type} options={TYPES} />
                </Label>
                <Label label="Date"><Input name="date" type="date" value={state.today} /></Label>
                <Label label="Relance (j, vide = aucune)"><Input name="delai" type="number" min={1} value={7} /></Label>
              </div>
              <Label label="Note"><Textarea name="note" autofocus /></Label>
            </>
          )}
          {kind === "modifier-echange" && echange && (
            <>
              <input type="hidden" name="id" value={echange.id} />
              <div class="grid gap-4 sm:grid-cols-3">
                <Label label="Type">
                  <Select name="type" value={echange.type} options={TYPES} />
                </Label>
                <Label label="Date"><Input name="date" type="date" value={echange.date} /></Label>
                <Label label="Relance (j, vide = aucune)"><Input name="delai" type="number" min={1} value={echange.delai ?? ""} /></Label>
              </div>
              <Label label="Note"><Textarea name="note" value={echange.note ?? ""} /></Label>
            </>
          )}
          <div class="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ContactFields({ contact }: { contact?: AppState["contacts"][number] }) {
  return (
    <div class="grid gap-4 sm:grid-cols-2">
      <Label label="Nom"><Input name="nom" required autofocus value={contact?.nom} /></Label>
      <Label label="Rôle"><Input name="role" value={contact?.role ?? undefined} /></Label>
      <Label label="Email"><Input name="email" type="email" value={contact?.email ?? undefined} /></Label>
      <Label label="Téléphone"><Input name="tel" type="tel" value={contact?.telephone ?? undefined} /></Label>
      <Label label="LinkedIn"><Input name="linkedin" type="url" placeholder="https://" value={contact?.linkedin ?? undefined} /></Label>
    </div>
  );
}
