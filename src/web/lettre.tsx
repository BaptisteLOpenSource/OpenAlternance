import { Bold, Heading2, Italic, Link, List, Pilcrow, Quote, Sparkles } from "lucide-preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type Placeholder, fillPlaceholder, isWebUrl, placeholders } from "../logic";
import { Badge, Button, Input, cn } from "./ui";

const KEEP = new Set(["P", "BR", "STRONG", "B", "EM", "I", "A", "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE"]);
const safeHref = (href: string) => isWebUrl(href) || /^mailto:/i.test(href);

// Server html goes through an inert DOMParser doc; only letter tags survive, so nothing loads or runs.
function sanitize(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? "")];
  if (!(node instanceof Element)) return [];
  const kids = [...node.childNodes].flatMap((c) => sanitize(c, doc));
  if (!KEEP.has(node.tagName)) return kids;
  const el = doc.createElement(node.tagName);
  const href = node.getAttribute("href");
  if (node.tagName === "A" && href && safeHref(href)) el.setAttribute("href", href);
  el.append(...kids);
  return [el];
}

// Markdown marks must hug the text: "** gras **" is not bold, so spaces move outside.
const wrap = (mark: string, text: string) => {
  const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return core ? `${lead}${mark}${core}${mark}${tail}` : text;
};

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  const kids = [...node.childNodes].map(inline).join("");
  switch (node.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B":
      return wrap("**", kids);
    case "EM":
    case "I":
      return wrap("*", kids);
    case "A":
      return node.getAttribute("href") ? `[${kids}](${node.getAttribute("href")})` : kids;
    default:
      return kids;
  }
}

// ponytail: no markdown escaping of literal * or _ typed in the text; add if users hit it.
export function domToMarkdown(root: Element): string {
  const blocks = [...root.childNodes].map((node) => {
    if (!(node instanceof Element)) return inline(node).trim();
    const text = () => inline(node).trim();
    const items = (prefix: (i: number) => string) => [...node.children].map((li, i) => `${prefix(i)}${inline(li).trim()}`).join("\n");
    switch (node.tagName) {
      case "H1":
        return `# ${text()}`;
      case "H2":
        return `## ${text()}`;
      case "H3":
        return `### ${text()}`;
      case "UL":
        return items(() => "- ");
      case "OL":
        return items((i) => `${i + 1}. `);
      case "BLOCKQUOTE":
        return text().split("\n").map((l) => `> ${l}`).join("\n");
      default:
        return text();
    }
  });
  return blocks.filter(Boolean).join("\n\n");
}

// ponytail: execCommand is deprecated but still the only native rich-text API; swap for a lib if a browser drops it.
const exec = (command: string, value?: string) => document.execCommand(command, false, value);

const TOOLS = [
  { label: "Gras", Icon: Bold, run: () => exec("bold") },
  { label: "Italique", Icon: Italic, run: () => exec("italic") },
  {
    label: "Lien",
    Icon: Link,
    run: () => {
      const url = prompt("Adresse du lien (https://... ou mailto:...)")?.trim();
      if (url && safeHref(url)) exec("createLink", url);
    },
  },
  { label: "Liste à puces", Icon: List, run: () => exec("insertUnorderedList") },
  { label: "Paragraphe", Icon: Pilcrow, run: () => exec("formatBlock", "p") },
  { label: "Titre", Icon: Heading2, run: () => exec("formatBlock", "h2") },
  { label: "Encart", Icon: Quote, run: () => exec("formatBlock", "blockquote") },
];

// Keyed by html upstream: a fresh load remounts it, typing never re-renders the DOM under the caret.
export function VisualEditor({ html, label, readOnly, onChange, onSave }: { html: string; label: string; readOnly: boolean; onChange: (md: string) => void; onSave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...[...doc.body.childNodes].flatMap((n) => sanitize(n, document)));
    exec("defaultParagraphSeparator", "p");
  }, []);
  return (
    <div class="overflow-hidden rounded-lg border bg-card">
      {!readOnly && (
        <div role="toolbar" aria-label="Mise en forme" class="sticky top-0 z-10 flex flex-wrap gap-0.5 border-b bg-muted/60 p-1 backdrop-blur">
          {TOOLS.map(({ label: name, Icon, run }, i) => (
            <Fragment key={name}>
              {i === 4 && <span class="mx-1 w-px self-stretch bg-border" />}
              <Button
                variant="ghost"
                size="icon-sm"
                title={name}
                aria-label={name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (ref.current?.focus(), run())}
              >
                <Icon />
              </Button>
            </Fragment>
          ))}
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable={!readOnly}
        class={cn(
          "min-h-[60vh] whitespace-pre-line p-6 text-[15px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-10",
          "[&_p]:mb-3 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold",
          "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline",
          "[&_blockquote]:mb-3 [&_blockquote]:rounded-md [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:bg-muted/50 [&_blockquote]:px-4 [&_blockquote]:py-2",
        )}
        onInput={(e) => onChange(domToMarkdown(e.currentTarget))}
        onBlur={onSave}
        onPaste={(e) => {
          e.preventDefault();
          exec("insertText", e.clipboardData?.getData("text/plain") ?? "");
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            onSave();
          }
        }}
      />
    </div>
  );
}

function VariableField({ p, onFill }: { p: Placeholder; onFill: (value: string) => void }) {
  const [value, setValue] = useState("");
  if (p.options)
    return (
      <fieldset class="grid gap-1.5">
        <legend class="mb-1 text-xs font-medium text-muted-foreground">Choisir une formulation</legend>
        {p.options.map((o) => (
          <button type="button" class="line-clamp-3 rounded-md border p-2 text-left text-xs hover:bg-muted" title={o} onClick={() => onFill(o)}>
            {o}
          </button>
        ))}
      </fieldset>
    );
  return (
    <form
      class="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onFill(value.trim());
      }}
    >
      <label class="text-xs font-medium text-muted-foreground" for={`var-${p.name}`}>
        {`{{${p.name}}}`}
      </label>
      <div class="flex gap-1">
        <Input id={`var-${p.name}`} value={value} onInput={(e) => setValue(e.currentTarget.value)} placeholder={p.name.replaceAll("_", " ")} />
        <Button type="submit" size="sm" variant="secondary" disabled={!value.trim()}>
          OK
        </Button>
      </div>
    </form>
  );
}

// Fills the {{...}} left after creation; identity ones (nom, email...) come from Compte.
export function VariablesPanel({ content, onChange }: { content: string; onChange: (next: string) => void }) {
  const list = placeholders(content);
  return (
    <aside aria-label="Variables de la lettre" class="grid content-start gap-3 self-start rounded-lg border bg-card p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles class="size-4 text-primary" />
          Variables
        </h3>
        <Badge variant={list.length ? "outline" : "success"}>{list.length ? `${list.length} à compléter` : "Complète"}</Badge>
      </div>
      {list.length === 0 && <p class="text-xs text-muted-foreground">Aucune variable restante : la lettre est prête.</p>}
      {list.map((p) => (
        <VariableField key={p.raw} p={p} onFill={(value) => onChange(fillPlaceholder(content, p, value))} />
      ))}
      <p class="border-t pt-3 text-xs text-muted-foreground">
        Nom, adresse, email et site viennent de{" "}
        <a href="#/compte" class="underline underline-offset-4">
          votre compte
        </a>
        .
      </p>
    </aside>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label class="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" role="switch" class="peer sr-only" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="relative h-5 w-9 rounded-full bg-muted ring-1 ring-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-foreground/70 after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-checked:after:bg-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      {label}
    </label>
  );
}
