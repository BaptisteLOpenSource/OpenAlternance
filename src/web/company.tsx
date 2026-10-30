import { ArrowLeft, Briefcase, Building2, CalendarDays, ExternalLink, FileCheck, FileText, Globe, Image as ImageIcon, Mail, MapPin, Mailbox, MessageSquare, Newspaper, Pencil, Phone, Plus, Send as SendIcon, Star, Tag, Trash2, UserPlus, Users } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CLOSING_STATUTS, FICHE_TEXTES, MAIL_CANAUX, SUIVIS, isWebUrl } from "../logic";
import type { CompanyRow, Lettre } from "../repo";
import { lettreOf, openLettre } from "./commands";
import { Select } from "./menus";
import { CopyButton, DeleteEchange, LettreStatutControl, type Open, RelanceBadge, ficheOf, RelanceControls, STATUT, type Send, StatutSelect, isOpen, sendFiche, shortDate } from "./shared";
import { type AppState, fetchLettre } from "./store";
import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, cn } from "./ui";

const bare =
  "w-full min-w-0 rounded-md border border-border/60 bg-transparent px-2 py-1 text-base transition-[color,box-shadow] placeholder:text-muted-foreground hover:bg-muted/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

const bareInput = cn(bare, "max-sm:h-10");

// Enter saves (blur runs the save), Escape restores the saved value without sending.
const editKeys = (saved: string) => (e: { key: string; currentTarget: HTMLInputElement }) => {
  if (e.key === "Escape") e.currentTarget.value = saved;
  if (e.key === "Escape" || e.key === "Enter") e.currentTarget.blur();
};

const PROFIL: [(typeof FICHE_TEXTES)[number], string, typeof Globe][] = [
  ["secteur", "Secteur", Tag],
  ["adresse", "Adresse", MapPin],
  ["code_postal", "Code postal", Mailbox],
  ["domaine", "Domaine d'activité", Building2],
  ["effectif", "Effectif", Users],
  ["note_google", "Note Google", Star],
  ["actualite", "Actualité", Newspaper],
  ["annonce", "Annonce (vide = spontanée)", ExternalLink],
  ["contact_cv", "A récupéré le CV", FileCheck],
];

const SUIVI_LABELS: Record<(typeof SUIVIS)[number], string> = {
  suivi_linkedin: "LinkedIn",
  suivi_insta: "Insta",
  suivi_facebook: "Facebook",
  suivi_tiktok: "TikTok",
};

const etat = (c: CompanyRow) =>
  CLOSING_STATUTS.has(c.statut)
    ? { label: `Terminé · ${STATUT[c.statut].label.toLowerCase()}`, dot: STATUT[c.statut].dot }
    : c.statut === "a_contacter"
      ? { label: "Pas commencé", dot: "bg-muted-foreground" }
      : { label: "En cours", dot: "bg-info" };

function Fact({ label, class: className, children }: { label: string; class?: string; children: ComponentChildren }) {
  return (
    <div class={cn("grid gap-1 rounded-xl border border-border/40 bg-background/50 p-3", className)}>
      <span class="text-xs uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span class="flex items-center gap-2 font-medium tabular-nums">{children}</span>
    </div>
  );
}

// Label wraps the control so the field gets an accessible name.
function Prop({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: ComponentChildren }) {
  return (
    <label class="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[7.5rem_1fr]">
      <span class="flex items-center gap-2 text-muted-foreground">
        <Icon class="size-4" />
        {label}
      </span>
      {children}
    </label>
  );
}

function LettreEditor({ company, lettre, send }: { company: CompanyRow; lettre: Lettre; send: Send }) {
  const { file } = lettre;
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    fetchLettre(file)
      .then(({ content }) => {
        setDraft(content.trimEnd());
        setSaved(content.trimEnd());
      })
      .catch((e) => setLoadError(String(e)));
  }, [file]);
  const dirty = saved !== null && draft !== saved;
  const save = async () => {
    if (!dirty) return true;
    const ok = await send("lettre", { entreprise: company.nom, content: draft });
    if (ok) setSaved(draft);
    return ok;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Lettre de motivation</CardTitle>
        <CardDescription>lettres/{file}</CardDescription>
        <CardAction class="flex flex-wrap items-center justify-end gap-2 max-sm:col-span-full max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:justify-self-stretch">
          {dirty && <span class="text-xs text-warning">Non enregistré</span>}
          <LettreStatutControl lettre={lettre} send={send} dirty={dirty} onSave={save} />
          <Button size="sm" disabled={!dirty} onClick={save}>
            Enregistrer
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer la lettre" onClick={() => confirm(`Supprimer la lettre de ${company.nom} ?`) && send("lettre-supprimer", { entreprise: company.nom })}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="grid gap-2">
        {loadError && (
          <p role="alert" class="text-sm text-destructive">
            Chargement de la lettre impossible : {loadError}
          </p>
        )}
        <textarea
          aria-label="Lettre de motivation"
          class={cn(bare, "min-h-96 resize-y px-3 py-2 font-mono text-base leading-relaxed md:text-sm")}
          value={draft}
          disabled={loadError !== null}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              save();
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

export function CompanyPage({ state, id, send, onOpen }: { state: AppState; id: number; send: Send; onOpen: Open }) {
  const company = state.companies.find((c) => c.id === id);
  if (!company) return <p class="text-sm text-muted-foreground">Entreprise introuvable.</p>;
  const contacts = state.contacts.filter((k) => k.company_id === id);
  const history = state.interactions.filter((i) => i.company_id === id);
  const status = etat(company);
  const lettre = lettreOf(company, state);
  const cover =
    company.statut === "offre" ? "from-success/30" : company.statut === "refuse" ? "from-destructive/25" : "from-info/25";
  const fiche = ficheOf(company);
  const saveField = (key: keyof typeof fiche) => (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    const value = e.currentTarget.value.trim();
    if (value !== fiche[key]) sendFiche(send, company, { [key]: value });
  };

  return (
    <div key={company.id} class="grid motion-safe:animate-fade-up gap-4 md:gap-6">
      <a href="#/entreprises" class="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft class="size-4" />
        Entreprises
      </a>

      <div class="overflow-hidden rounded-2xl border border-border/40 bg-card/60 backdrop-blur">
        <div class={cn("h-28 bg-gradient-to-r via-primary/5 to-transparent", cover)} />
        <div class="grid gap-5 px-6 pb-6">
          <div class="-mt-9 flex flex-wrap items-end justify-between gap-3">
            <div class="flex size-[4.5rem] items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-card text-3xl font-semibold shadow-sm">
              {company.logo && isWebUrl(company.logo) ? <img src={company.logo} alt="" class="size-full object-contain p-2" /> : company.nom[0]?.toUpperCase()}
            </div>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onOpen({ kind: "echange", company: company.nom })}>
                <Plus />
                Échange
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpen({ kind: "personne", company: company.nom })}>
                <UserPlus />
                Contact
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openLettre(company, lettre, send, state.profil)}
              >
                <FileText />
                {lettre ? "Voir la lettre" : "Lettre de motivation"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (confirm(`Supprimer ${company.nom} et tous ses contacts et échanges ? Les lettres sont conservées.`) && (await send("entreprise-supprimer", { entreprise: company.nom }))) {
                    location.hash = "#/entreprises";
                  }
                }}
              >
                <Trash2 />
                Supprimer l'entreprise
              </Button>
            </div>
          </div>
          <div class="grid gap-1">
            <h1 class="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{company.nom}</h1>
            {company.ville && <p class="text-sm text-muted-foreground">{company.ville}</p>}
          </div>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Fact label="État" class="col-span-2 md:col-span-1">
              <span aria-hidden="true" class={cn("size-2 rounded-full", status.dot)} />
              {status.label}
            </Fact>
            <Fact label="Statut">
              <StatutSelect company={company} send={send} />
            </Fact>
            <Fact label="1re communication">{shortDate(history[0]?.date)}</Fact>
            <Fact label="Dernier échange">{shortDate(company.derniere_interaction)}</Fact>
            <Fact label="Prochaine relance">
              <RelanceBadge company={company} today={state.today} />
            </Fact>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <div class="grid content-start gap-4 md:gap-6 lg:col-span-2">
          {lettre && <LettreEditor key={`${lettre.file}-${lettre.statut}-${lettre.date_envoi}`} company={company} lettre={lettre} send={send} />}
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Contacts</CardTitle>
              <CardAction>
                <Button variant="ghost" size="icon-sm" aria-label="Ajouter un contact" onClick={() => onOpen({ kind: "personne", company: company.nom })}>
                  <UserPlus />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent class="grid gap-2 text-sm">
              {contacts.length === 0 && (
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-muted-foreground">Aucun contact.</p>
                  <Button variant="outline" size="sm" onClick={() => onOpen({ kind: "personne", company: company.nom })}>
                    <UserPlus />
                    Ajouter un contact
                  </Button>
                </div>
              )}
              {contacts.map((k) => (
                <div key={k.id} class="rounded-lg border border-border/20 bg-background/40 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="font-medium">
                      {k.nom} <span class="font-normal text-muted-foreground">{k.role}</span>
                    </p>
                    <div class="flex shrink-0">
                      <Button variant="ghost" size="icon-sm" aria-label="Modifier le contact" onClick={() => onOpen({ kind: "modifier-personne", company: company.nom, id: k.id })}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer le contact"
                        onClick={() => {
                          if (confirm(`Supprimer le contact « ${k.nom} » ?`)) send("personne-supprimer", { id: String(k.id) });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {k.email && (
                    <div class="flex items-center gap-2">
                      <Mail class="size-3.5 text-muted-foreground" />
                      <a href={`mailto:${k.email}`} class="truncate hover:underline">{k.email}</a>
                      <CopyButton value={k.email} />
                    </div>
                  )}
                  {k.telephone && (
                    <div class="flex items-center gap-2">
                      <Phone class="size-3.5 text-muted-foreground" />
                      <a href={`tel:${k.telephone}`} class="hover:underline">{k.telephone}</a>
                      <CopyButton value={k.telephone} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Historique</CardTitle>
              <CardAction>
                <Button variant="ghost" size="icon-sm" aria-label="Ajouter un échange" onClick={() => onOpen({ kind: "echange", company: company.nom })}>
                  <Plus />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent class="text-sm">
              {history.length === 0 && (
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-muted-foreground">Aucun échange.</p>
                  <Button variant="outline" size="sm" onClick={() => onOpen({ kind: "echange", company: company.nom })}>
                    <Plus />
                    Ajouter un échange
                  </Button>
                </div>
              )}
              <ol class="grid gap-3 border-l pl-4">
                {isOpen(company) && (
                  <li class="relative flex flex-wrap items-center justify-between gap-2">
                    <span aria-hidden="true" class="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-warning" />
                    <p>
                      <span class="font-medium">relance prévue</span>{" "}
                      <span class="tabular-nums text-muted-foreground">{shortDate(company.prochaine_relance)}</span>
                    </p>
                    <RelanceControls company={company} send={send} />
                  </li>
                )}
                {[...history].reverse().map((i) => (
                  <li class="relative flex items-start justify-between gap-2">
                    <span aria-hidden="true" class="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
                    <div>
                      <p>
                        <span class="font-medium">{i.type}</span>{" "}
                        <span class="tabular-nums text-muted-foreground">{shortDate(i.date)}</span>
                      </p>
                      {i.note && <p class="text-muted-foreground">{i.note}</p>}
                    </div>
                    <div class="flex shrink-0">
                      <Button variant="ghost" size="icon-sm" aria-label="Modifier l'échange" onClick={() => onOpen({ kind: "modifier-echange", company: company.nom, id: i.id })}>
                        <Pencil />
                      </Button>
                      <DeleteEchange echange={i} send={send} />
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Mail envoyé</CardTitle>
              <CardDescription>Corps du mail · pièces jointes : lettre de motivation + CV</CardDescription>
              <CardAction>
                <CopyButton value={fiche.mail} />
              </CardAction>
            </CardHeader>
            <CardContent class="grid gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Canal"
                  options={MAIL_CANAUX}
                  value={fiche.mail_canal}
                  onChange={(v) => sendFiche(send, company, { mail_canal: v })}
                />
                <input
                  class={cn(bareInput, "min-w-40 flex-1 font-medium")}
                  placeholder="Objet"
                  aria-label="Objet du mail"
                  value={fiche.mail_objet}
                  onKeyDown={editKeys(fiche.mail_objet)}
                  onBlur={saveField("mail_objet")}
                />
                <CopyButton value={fiche.mail_objet} />
              </div>
              <textarea
                aria-label="Corps du mail"
                class={cn(bare, "min-h-40 resize-y px-3 py-2 text-base md:text-sm")}
                placeholder="Bonjour, ..."
                value={fiche.mail}
                onBlur={saveField("mail")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                aria-label="Notes"
                class={cn(bare, "min-h-24 resize-y px-3 py-2 text-base md:text-sm")}
                placeholder="Écrire une note..."
                value={fiche.notes}
                onBlur={saveField("notes")}
              />
            </CardContent>
          </Card>
        </div>

        <div class="grid content-start gap-4 md:gap-6">
          <Card>
            <CardHeader>
              <CardTitle class="text-base">Propriétés</CardTitle>
            </CardHeader>
            <CardContent class="grid gap-2">
              <Prop icon={Building2} label="Nom">
                <input
                  class={bareInput}
                  aria-label="Nom de l'entreprise"
                  defaultValue={company.nom}
                  onKeyDown={editKeys(company.nom)}
                  onBlur={(e) => {
                    const nom = e.currentTarget.value.trim();
                    if (nom && nom !== company.nom) send("entreprise-renommer", { entreprise: company.nom, nom });
                    else e.currentTarget.value = company.nom;
                  }}
                />
              </Prop>
              <Prop icon={Globe} label="Site">
                <div class="flex min-w-0 items-center">
                  <input class={bareInput} type="url" placeholder="https://" value={fiche.site} onKeyDown={editKeys(fiche.site)} onBlur={saveField("site")} />
                  {company.site && isWebUrl(company.site) && (
                    <a href={company.site} target="_blank" rel="noreferrer" aria-label="Ouvrir le site" class="px-1 text-muted-foreground hover:text-foreground">
                      <ExternalLink class="size-4" />
                    </a>
                  )}
                </div>
              </Prop>
              <Prop icon={MapPin} label="Ville">
                <input class={bareInput} placeholder="Vide" value={fiche.ville} onKeyDown={editKeys(fiche.ville)} onBlur={saveField("ville")} />
              </Prop>
              <Prop icon={ImageIcon} label="Logo">
                <input class={bareInput} type="url" placeholder="https://" value={fiche.logo} onKeyDown={editKeys(fiche.logo)} onBlur={saveField("logo")} />
              </Prop>
              <Prop icon={Briefcase} label="Poste">
                <input class={bareInput} placeholder="Vide" value={fiche.poste} onKeyDown={editKeys(fiche.poste)} onBlur={saveField("poste")} />
              </Prop>
              <Prop icon={CalendarDays} label="Publication">
                <input class={bareInput} placeholder="Ex. il y a 1 semaine" value={fiche.publication} onKeyDown={editKeys(fiche.publication)} onBlur={saveField("publication")} />
              </Prop>
              <Prop icon={SendIcon} label="Candidatures">
                <input class={bareInput} placeholder="Ex. plus de 100" value={fiche.candidatures} onKeyDown={editKeys(fiche.candidatures)} onBlur={saveField("candidatures")} />
              </Prop>
              <Prop icon={MessageSquare} label="Réponses">
                <input class={bareInput} placeholder="Aucune info" value={fiche.reponses} onKeyDown={editKeys(fiche.reponses)} onBlur={saveField("reponses")} />
              </Prop>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="text-base">Profil entreprise</CardTitle>
            </CardHeader>
            <CardContent class="grid gap-2">
              {PROFIL.map(([key, label, Icon]) => (
                <Prop key={key} icon={Icon} label={label}>
                  <input class={bareInput} placeholder="Vide" value={fiche[key]} onKeyDown={editKeys(fiche[key])} onBlur={saveField(key)} />
                </Prop>
              ))}
              <div class="grid grid-cols-1 items-center gap-2 text-sm sm:grid-cols-[7.5rem_1fr]">
                <span class="text-muted-foreground">Réseaux suivis</span>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  {SUIVIS.map((key) => (
                    <label key={key} class="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        class="size-4 accent-primary"
                        checked={fiche[key] === "oui"}
                        onChange={(e) => sendFiche(send, company, { [key]: e.currentTarget.checked ? "oui" : "" })}
                      />
                      {SUIVI_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
