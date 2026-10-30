import { type VariantProps, cva } from "class-variance-authority";
import { type ClassValue, clsx } from "clsx";
import { X } from "lucide-preact";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type Props<T extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[T] & { class?: string };

const buttonVariants = cva(
  "icon-hover inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline: "border bg-card shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2 sm:h-9",
        sm: "h-10 gap-1.5 px-3 sm:h-8",
        icon: "size-10 sm:size-9",
        "icon-sm": "size-10 sm:size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  class: className,
  variant,
  size,
  ...props
}: Props<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type="button" class={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        warning: "border-transparent bg-warning/20 text-warning",
        success: "border-transparent bg-success/15 text-success",
        info: "border-transparent bg-info/15 text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ class: className, variant, ...props }: Props<"span"> & { variant?: BadgeVariant }) {
  return <span class={cn(badgeVariants({ variant }), className)} {...props} />;
}

export const Card = ({ class: className, ...props }: Props<"div">) => (
  <div class={cn("flex flex-col gap-6 rounded-2xl border border-border/40 bg-card py-6 text-card-foreground", className)} {...props} />
);

export const CardHeader = ({ class: className, ...props }: Props<"div">) => (
  <div class={cn("grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-[[data-slot=card-action]]:grid-cols-[1fr_auto]", className)} {...props} />
);

export const CardTitle = ({ class: className, ...props }: Props<"div">) => (
  <div class={cn("font-semibold leading-none", className)} {...props} />
);

export const CardDescription = ({ class: className, ...props }: Props<"div">) => (
  <div class={cn("text-sm text-muted-foreground", className)} {...props} />
);

export const CardAction = ({ class: className, ...props }: Props<"div">) => (
  <div data-slot="card-action" class={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />
);

export const CardContent = ({ class: className, ...props }: Props<"div">) => (
  <div class={cn("px-6", className)} {...props} />
);

export const field =
  "h-10 w-full sm:h-9 min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30";

export const Input = ({ class: className, ...props }: Props<"input">) => <input class={cn(field, className)} {...props} />;

export const Textarea = ({ class: className, ...props }: Props<"textarea">) => (
  <textarea class={cn(field, "h-auto min-h-16 py-2", className)} {...props} />
);

export function Label({ class: className, label, children }: { class?: string; label: string; children: ComponentChildren }) {
  return (
    <label class={cn("grid gap-2 text-sm font-medium", className)}>
      {label}
      {children}
    </label>
  );
}

export const Table = ({ class: className, ...props }: Props<"table">) => (
  <div class="relative w-full overflow-x-auto">
    <table class={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
);
export const TableHeader = (props: Props<"thead">) => <thead class="[&_tr]:border-b" {...props} />;
export const TableBody = (props: Props<"tbody">) => <tbody class="[&_tr:last-child]:border-0" {...props} />;
export const TableRow = ({ class: className, ...props }: Props<"tr">) => (
  <tr class={cn("border-b transition-colors hover:bg-muted/50", className)} {...props} />
);
export const TableHead = ({ class: className, ...props }: Props<"th">) => (
  <th class={cn("h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-muted-foreground", className)} {...props} />
);
export const TableCell = ({ class: className, ...props }: Props<"td">) => (
  <td class={cn("whitespace-nowrap p-2 align-middle", className)} {...props} />
);

// Native <dialog> instead of Radix: focus trap, Esc and top layer for free.
export function Dialog({
  open,
  onClose,
  title,
  description,
  side,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: boolean;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      class={cn(
        "border border-border/40 bg-card p-0 text-card-foreground shadow-lg",
        side
          ? "ml-auto mr-0 h-dvh max-h-dvh w-full max-w-md"
          : "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-2xl",
      )}
    >
      {open && (
        <div class={cn("flex h-full flex-col gap-4 p-6", !side && "max-h-[calc(100dvh-2rem)]")}>
          <div class="flex items-start justify-between gap-4">
            <div class="grid gap-1.5">
              <h2 class="text-lg font-semibold leading-none">{title}</h2>
              {description && <p class="text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <X />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
