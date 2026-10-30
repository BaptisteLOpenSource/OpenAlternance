import { type ComponentChildren, createContext } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { cn } from "./ui";

const BUBBLES = [
  "left-[-10%] top-[10%] size-72 bg-blue-500/40 animate-bubble-drift",
  "right-[-5%] bottom-[5%] size-96 bg-violet-500/30 animate-bubble-drift-reverse",
  "left-[30%] top-[40%] size-64 bg-cyan-400/25 animate-bubble-orbit",
  "right-[20%] top-[-10%] size-56 bg-rose-500/20 animate-bubble-orbit-slow",
  "left-[5%] bottom-[-15%] size-60 bg-indigo-400/25 animate-bubble-orbit",
];

export function BubbleBackground({ class: className }: { class?: string }) {
  return (
    <div aria-hidden class={cn("pointer-events-none overflow-hidden bg-zinc-950", className)}>
      {BUBBLES.map((bubble) => (
        <div key={bubble} class={cn("absolute rounded-full opacity-80 blur-3xl mix-blend-screen", bubble)} />
      ))}
    </div>
  );
}

export function Tooltip({ content, children }: { content: string; children: ComponentChildren }) {
  return (
    <span class="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        class="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

export function ToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="group" aria-label={label} class="flex flex-wrap gap-2">
      {options.map((o) => {
        const pressed = value === o.value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(o.value)}
            class={cn(
              "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:h-8",
              pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card shadow-xs hover:bg-accent",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span class={cn("rounded px-1.5 text-xs tabular-nums", pressed ? "bg-primary-foreground/20" : "bg-muted")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type Notify = (message: string, tone?: "success" | "error") => void;
const ToastContext = createContext<Notify>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [items, setItems] = useState<{ id: number; message: string; tone: "success" | "error" }[]>([]);
  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div role="status" aria-live="polite" class="pointer-events-none fixed bottom-4 right-4 z-[70] grid gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            class={cn(
              "animate-fade-up rounded-md border bg-card px-4 py-2 text-sm font-medium shadow-md",
              t.tone === "error" && "border-destructive/40 text-destructive",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
