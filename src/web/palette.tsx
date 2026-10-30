import { useEffect, useRef, useState } from "preact/hooks";
import { Input, cn } from "./ui";

export type PaletteItem = { id: string; label: string; hint: string; run: () => void };

// Filter, arrows to move, Enter to run. Dialog (parent) owns Escape and focus trap.
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)).slice(0, 50);
  // dialog opens after this mounts: focus on next frame
  useEffect(() => void requestAnimationFrame(() => input.current?.focus()), []);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    document.getElementById(`palette-${shown[index]?.id}`)?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const pick = (item?: PaletteItem) => {
    if (!item) return;
    onClose();
    item.run();
  };
  return (
    <div class="grid gap-3">
      <Input
        ref={input}
        type="search"
        value={query}
        placeholder="Aller à une page, une entreprise, une action..."
        aria-label="Rechercher une commande"
        class="max-sm:h-11"
        aria-controls="palette-list"
        aria-activedescendant={shown[index] ? `palette-${shown[index].id}` : undefined}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(shown[index]);
          }
        }}
      />
      {shown.length === 0 && <p role="status" class="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat</p>}
      <ul id="palette-list" role="listbox" class="grid gap-0.5">
        {shown.map((item, i) => (
          <li
            id={`palette-${item.id}`}
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setIndex(i)}
            onClick={() => pick(item)}
            class={cn("flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm max-sm:py-3", i === index && "bg-accent")}
          >
            <span class="truncate">{item.label}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
