import { Check, ChevronDown, Plus, SlidersHorizontal } from "lucide-preact";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Command } from "./commands";
import { Button, cn, field } from "./ui";

type Ref = { current: HTMLElement | null };

// Outside pointer and Escape close; scroll and resize too when the menu is positioned on the page.
function useDismiss(ref: Ref, onClose: () => void, anywhere = false) {
  useEffect(() => {
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("pointerdown", outside);
    addEventListener("keydown", onKey);
    if (anywhere) {
      addEventListener("scroll", outside, true);
      addEventListener("resize", onClose);
    }
    return () => {
      removeEventListener("pointerdown", outside);
      removeEventListener("keydown", onKey);
      if (anywhere) {
        removeEventListener("scroll", outside, true);
        removeEventListener("resize", onClose);
      }
    };
  }, []);
}

// Top layer (popover): escapes dialog overflow and transformed/blurred ancestors that
// offset position:fixed. Measured after render, flipped above `flipY` if no room below.
function Popup({ x, y, flipY = y, area, onClose, role, onKeyDown, class: className, ...props }: JSX.IntrinsicElements["div"] & { x: number; y: number; flipY?: number; area?: Ref; onClose: () => void; role: "menu" | "listbox" }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(area ?? ref, onClose, true);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(x, innerWidth - width - 4))}px`;
    el.style.top = `${y + height <= innerHeight - 4 ? y : Math.max(4, flipY - height)}px`;
  }, [x, y]);
  return (
    <div
      ref={ref}
      popover="manual"
      role={role}
      onKeyDown={onKeyDown}
      // inside a <label>, a click on padding would re-toggle the trigger
      onClick={(e) => e.preventDefault()}
      class={cn("fixed inset-auto m-0 grid max-h-80 gap-0.5 overflow-y-auto rounded-lg border bg-card p-1 text-card-foreground shadow-lg", className)}
      {...props}
    />
  );
}

const itemClass = "flex h-8 max-sm:h-11 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent";

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: { label: string; run: () => void }[]; onClose: () => void }) {
  return (
    <Popup x={x} y={y} onClose={onClose} role="menu" class="w-56">
      {items.map((item) => (
        <button
          type="button"
          role="menuitem"
          class={itemClass}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </Popup>
  );
}

type Option = string | { value: string; label: string };
const toOption = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

// Replaces native <select> for a consistent look. Hidden input keeps FormData working.
// renderValue: custom trigger content (statut badge), field styling dropped.
export function Select({
  options,
  value,
  onChange,
  name,
  class: className,
  "aria-label": ariaLabel,
  renderValue,
}: {
  options: readonly Option[];
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  class?: string;
  "aria-label"?: string;
  renderValue?: (value: string) => ComponentChildren;
}) {
  const items = options.map(toOption);
  const initial = value ?? items[0]?.value ?? "";
  const [current, setCurrent] = useState(initial);
  useEffect(() => setCurrent(initial), [value]);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const area = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLElement[]>([]);
  const open = () => setAnchor(trigger.current!.getBoundingClientRect());
  const close = () => setAnchor(null);
  const pick = (v: string) => {
    close();
    trigger.current?.focus();
    if (v === current) return;
    setCurrent(v);
    onChange?.(v);
  };
  useEffect(() => {
    if (anchor) (list.current[items.findIndex((o) => o.value === current)] ?? list.current[0])?.focus();
  }, [anchor]);
  const onKey = (e: KeyboardEvent) => {
    const i = list.current.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") list.current[Math.min(i + 1, items.length - 1)]?.focus();
    else if (e.key === "ArrowUp") list.current[Math.max(i - 1, 0)]?.focus();
    else if (e.key === "Escape") pick(current); // preventDefault: keeps a parent <dialog> open
    else if (e.key === "Tab") return close();
    else return;
    e.preventDefault();
  };
  const label = items.find((o) => o.value === current)?.label ?? "";
  return (
    <span ref={area} class="relative inline-flex">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        aria-label={ariaLabel}
        onClick={() => (anchor ? close() : open())}
        onKeyDown={(e) => e.key === "ArrowDown" && (e.preventDefault(), open())}
        class={cn(
          renderValue
            ? "inline-flex min-h-10 cursor-pointer items-center rounded-full outline-none sm:min-h-0 focus-visible:ring-[3px] focus-visible:ring-ring"
            : cn(field, "flex cursor-pointer items-center justify-between gap-2 text-left"),
          className,
        )}
      >
        {renderValue ? renderValue(current) : <span class="truncate">{label}</span>}
        {!renderValue && <ChevronDown class="size-4 shrink-0 opacity-50" />}
      </button>
      {anchor && (
        <Popup x={anchor.left} y={anchor.bottom + 4} flipY={anchor.top - 4} area={area} onClose={close} role="listbox" onKeyDown={onKey} style={{ minWidth: anchor.width }} class="w-max max-w-[min(24rem,calc(100vw-1rem))]">
          {items.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                list.current[i] = el!;
              }}
              type="button"
              role="option"
              aria-selected={o.value === current}
              class={itemClass}
              onClick={() => pick(o.value)}
            >
              <Check class={cn("size-4 shrink-0", o.value !== current && "invisible")} />
              <span class="truncate">{o.label}</span>
            </button>
          ))}
        </Popup>
      )}
    </span>
  );
}

export function CustomizeMenu({ commands, hidden, onToggle }: { commands: Command[]; hidden: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false));
  return (
    <div ref={ref} class="relative">
      <Button variant="outline" size="icon-sm" aria-label="Personnaliser le clic droit" aria-expanded={open} title="Personnaliser le clic droit" onClick={() => setOpen(!open)}>
        <SlidersHorizontal />
      </Button>
      {open && (
        <div class="absolute right-0 top-10 z-50 grid max-h-96 w-64 gap-0.5 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
          <p class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions du clic droit</p>
          {commands.map((c) => (
            <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <input type="checkbox" class="size-4 accent-primary" checked={!hidden.includes(c.id)} onChange={() => onToggle(c.id)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// compact: icon only (collapsed sidebar), label kept for screen readers.
export function MenuButton({
  label,
  items,
  compact = false,
  class: className,
}: {
  label: string;
  items: { label: string; run: () => void }[];
  compact?: boolean;
  class?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false));
  return (
    <div ref={ref} class={cn("relative", className)}>
      <Button size="sm" class={cn("w-full max-sm:h-11", compact && "md:size-9 md:p-0")} aria-haspopup="menu" aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
        <Plus />
        <span class={cn(compact && "md:sr-only")}>{label}</span>
        <ChevronDown class={cn("ml-auto", compact && "md:hidden")} />
      </Button>
      {open && (
        <div role="menu" class="absolute bottom-full left-0 mb-2 grid w-56 gap-0.5 rounded-lg border bg-card p-1 shadow-lg">
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              class={itemClass}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
