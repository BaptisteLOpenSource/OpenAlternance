import { Info } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { CLOSING_STATUTS, TYPES } from "../logic";
import type { Agence } from "../repo";
import { createLettre, lettreOf } from "./commands";
import { DocumentLinkFields } from "./documents";
import { ProfilForm } from "./profil";
import { CONTRAT_OPTIONS, type DialogState, ECHANGE, EchangeBadge, type Send, formFields } from "./shared";
import type { Action, AppState, PosteEtat } from "./store";
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
  poste: "Nouveau poste",
  "modifier-poste": "Modifier le poste",
  agence: "Nouvelle agence",
  fusion: "Fusionner avec une autre entreprise",
};

const ACTION: Partial<Record<Kind, Action>> = {
  entreprise: "entreprise",
  personne: "personne",
  echange: "echange",
  "modifier-personne": "personne-modifier",
  "modifier-echange": "echange-modifier",
  poste: "poste",
  "modifier-poste": "poste-modifier",
  agence: "agence",
  fusion: "entreprise-fusionner",
};

export const MAX_PDF_BYTES = 3_000_000;

export const readBase64 = (file: File) =>
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
    else if (!(await createLettre(target, send, state))) return;
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

const FORMATS = "PDF (affiché tel quel), Word DOCX et LibreOffice ODT (texte extrait), Markdown (.md), texte (.txt). Ancien .doc : réenregistrez-le en .docx.";

// Format read from the file extension; no file = typed Markdown.
function DocumentForm({ state, send, company: initial, onClose }: { state: AppState; send: Send; company?: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState({ company: String(state.companies.find((c) => c.nom === initial)?.id ?? ""), echange: "" });
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const file = form.get("fichier");
    const typed = String(form.get("titre") ?? "").trim();
    if (!(file instanceof File) || file.size === 0) {
      if (!typed) return setError("Choisissez un fichier ou donnez un titre");
      if (await send("document", { titre: typed, format: "md", content: String(form.get("content") ?? ""), ...link })) onClose();
      return;
    }
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
    const titre = typed || (dot > 0 ? file.name.slice(0, dot) : file.name);
    if (file.size > MAX_PDF_BYTES) return setError("Fichier trop lourd (3 Mo max)");
    let ok: boolean | string;
    if (ext === "pdf") ok = await send("document-pdf", { titre, data: await readBase64(file), ...link });
    else if (ext === "docx" || ext === "odt") ok = await send("document-office", { titre, data: await readBase64(file), ...link });
    else if (ext === "md" || ext === "txt") ok = await send("document", { titre, format: ext, content: await file.text(), ...link });
    else return setError(`Format .${ext || "?"} non pris en charge. ${FORMATS}`);
    if (ok) onClose();
  };
  return (
    <form class="grid gap-4" onSubmit={submit}>
      <div class="grid gap-2">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          Fichier
          <details class="relative">
            <summary class="flex cursor-pointer list-none text-muted-foreground hover:text-foreground" title={FORMATS} aria-label="Formats pris en charge">
              <Info class="size-4" />
            </summary>
            <p class="absolute left-0 z-10 mt-1 w-64 rounded-md border bg-card p-2 text-xs font-normal text-card-foreground shadow-md">{FORMATS}</p>
          </details>
        </div>
        <Input name="fichier" type="file" accept=".pdf,.docx,.odt,.md,.txt" aria-label="Fichier" onChange={() => setError(null)} />
      </div>
      <Label label="Titre (nom du fichier par défaut)">
        <Input name="titre" autofocus />
      </Label>
      <DocumentLinkFields state={state} company={link.company} echange={link.echange} onChange={(company, echange) => setLink({ company, echange })} />
      <Label label="Ou écrire directement (Markdown)">
        <Textarea name="content" class="min-h-32 font-mono text-sm" />
      </Label>
      {error && <p role="alert" class="text-sm text-destructive">{error}</p>}
      <p class="text-sm text-muted-foreground">Le texte est enregistré sans balises ni scripts.</p>
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
  const poste = state.postes.find((p) => p.id === dialog?.id);
  // Échange form: the company picked in the form decides which postes are offered.
  const [entreprise, setEntreprise] = useState(dialog?.company);
  useEffect(() => setEntreprise(dialog?.company), [dialog]);
  const idOf = (nom?: string) => state.companies.find((c) => c.nom === nom)?.id;
  const postesDe = (nom?: string) => state.postes.filter((p) => p.company_id === idOf(nom));
  const agencesDe = (nom?: string) => state.agences.filter((a) => a.company_id === idOf(nom));
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const action = kind && ACTION[kind];
    if (!action) return;
    const fields = formFields(e.currentTarget as HTMLFormElement);
    if (await send(action, fields)) {
      if (kind === "fusion") location.hash = "#/entreprises";
      onClose();
    }
  };
  const companySelect = (
    <Label label="Entreprise">
      <Select name="entreprise" value={entreprise} onChange={setEntreprise} options={state.companies.map((c) => c.nom)} />
    </Label>
  );
  const ownForm = () => {
    if (kind === "lettre") return <LettreForm state={state} send={send} company={dialog?.company} onClose={onClose} />;
    if (kind === "document") return <DocumentForm state={state} send={send} company={dialog?.company} onClose={onClose} />;
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
          {kind === "poste" && (
            <>
              <input type="hidden" name="entreprise" value={dialog?.company} />
              <PosteFields agences={agencesDe(dialog?.company)} />
            </>
          )}
          {kind === "modifier-poste" && poste && (
            <>
              <input type="hidden" name="id" value={poste.id} />
              <PosteFields poste={poste} agences={agencesDe(dialog?.company)} />
            </>
          )}
          {kind === "agence" && (
            <>
              <input type="hidden" name="entreprise" value={dialog?.company} />
              <Label label="Ville"><Input name="ville" required autofocus /></Label>
              <div class="grid gap-4 sm:grid-cols-2">
                <Label label="Adresse"><Input name="adresse" /></Label>
                <Label label="Code postal"><Input name="code_postal" /></Label>
              </div>
            </>
          )}
          {kind === "fusion" && (
            <>
              <input type="hidden" name="source" value={dialog?.company} />
              <Label label="Cible">
                <Select name="cible" options={state.companies.filter((c) => c.nom !== dialog?.company).map((c) => c.nom)} />
              </Label>
              <p class="text-sm text-muted-foreground">
                Contacts, échanges, postes et lettres de {dialog?.company} passent dans la cible. Son siège devient une agence. La fiche {dialog?.company} est supprimée.
              </p>
            </>
          )}
          {kind === "echange" && (
            <>
              {companySelect}
              <div class="grid gap-4 sm:grid-cols-3">
                <Label label="Type">
                  <Select name="type" value={dialog?.type} options={TYPES.map((t) => ({ value: t, label: ECHANGE[t].label }))} renderOption={(t) => <EchangeBadge type={t} />} />
                </Label>
                <Label label="Date"><Input name="date" type="date" value={state.today} /></Label>
                <Label label="Relance (j, vide = aucune)"><Input name="delai" type="number" min={1} value={7} /></Label>
              </div>
              <PosteSelect postes={postesDe(entreprise)} />
              <Label label="Note"><Textarea name="note" autofocus /></Label>
            </>
          )}
          {kind === "modifier-echange" && echange && (
            <>
              <input type="hidden" name="id" value={echange.id} />
              <div class="grid gap-4 sm:grid-cols-3">
                <Label label="Type">
                  <Select name="type" value={echange.type} options={TYPES.map((t) => ({ value: t, label: ECHANGE[t].label }))} renderOption={(t) => <EchangeBadge type={t} />} />
                </Label>
                <Label label="Date"><Input name="date" type="date" value={echange.date} /></Label>
                <Label label="Relance (j, vide = aucune)"><Input name="delai" type="number" min={1} value={echange.delai ?? ""} /></Label>
              </div>
              <PosteSelect postes={postesDe(dialog?.company)} value={String(echange.poste_id ?? "")} />
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

// Full replace on the API side: every field is sent, even unchanged ones.
function PosteFields({ poste, agences }: { poste?: PosteEtat; agences: Agence[] }) {
  return (
    <>
      <Label label="Intitulé"><Input name="intitule" required autofocus value={poste?.intitule} /></Label>
      <div class="grid gap-4 sm:grid-cols-2">
        <Label label="Contrat">
          <Select name="contrat" value={poste?.contrat ?? "alternance"} options={CONTRAT_OPTIONS} />
        </Label>
        <Label label="Agence">
          <Select name="agence" value={String(poste?.agence_id ?? "")} options={[{ value: "", label: "Siège" }, ...agences.map((a) => ({ value: String(a.id), label: a.ville }))]} />
        </Label>
      </div>
      <Label label="Annonce"><Input name="annonce" type="url" placeholder="https://" value={poste?.annonce ?? undefined} /></Label>
      <Label label="Publication"><Input name="publication" placeholder="Ex. il y a 1 semaine" value={poste?.publication ?? undefined} /></Label>
    </>
  );
}

function PosteSelect({ postes, value }: { postes: PosteEtat[]; value?: string }) {
  return (
    <Label label="Poste">
      <Select name="poste" value={value ?? ""} options={[{ value: "", label: "Spontanée" }, ...postes.map((p) => ({ value: String(p.id), label: p.intitule }))]} />
    </Label>
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
