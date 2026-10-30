import type { ComponentChildren } from "preact";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from "./ui";

export type Datum = { label: string; value: number };

const niceMax = (max: number) => (max <= 4 ? 4 : Math.ceil(max / 4) * 4);

// Single series: no legend, card title names it. Hover/focus tooltip per column, aria-label carries the value.
export function BarChart({ data, unit }: { data: Datum[]; unit: string }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  return (
    <div class="grid grid-cols-[auto_1fr] gap-x-2">
      <div class="flex h-48 flex-col justify-between text-right text-xs tabular-nums text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} class="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
            {t}
          </span>
        ))}
      </div>
      <div class="relative h-48">
        {ticks.map((t) => (
          <div key={t} class="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(t / max) * 100}%` }} />
        ))}
        <div class="absolute inset-0 flex items-end gap-0.5">
          {data.map((d, i) => (
            <div
              key={d.label}
              role="img"
              aria-label={`${d.label} : ${d.value} ${unit}`}
              class="group relative flex h-full flex-1 items-end justify-center hover:bg-muted/60"
              tabindex={0}
            >
              <div class="w-3/5 max-w-8 rounded-t-[4px] bg-chart" style={{ height: `${(d.value / max) * 100}%` }} />
              <div
                class={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus:block",
                  i === data.length - 1 && "right-0",
                )}
              >
                <p class="text-muted-foreground">{d.label}</p>
                <p class="font-medium tabular-nums">
                  {d.value} {unit}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <span />
      <div class="mt-2 flex gap-0.5 text-xs text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.label} class="flex-1 truncate text-center">
            {(data.length - 1 - i) % 2 === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

const barRow = "grid grid-cols-[7rem_1fr_2rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm";

export function BarList({ data, onSelect }: { data: Datum[]; onSelect?: (label: string) => void }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div class="grid gap-1">
      {data.map((d) => {
        const content = (
          <>
            <span class="truncate text-muted-foreground">{d.label}</span>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full bg-chart" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <span class="text-right font-medium tabular-nums">{d.value}</span>
          </>
        );
        return onSelect ? (
          <button key={d.label} type="button" onClick={() => onSelect(d.label)} class={cn(barRow, "hover:bg-muted/60")}>
            {content}
          </button>
        ) : (
          <div key={d.label} class={barRow}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function DataTable({ data, labelHead, valueHead }: { data: Datum[]; labelHead: string; valueHead: ComponentChildren }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHead}</TableHead>
          <TableHead class="text-right">{valueHead}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((d) => (
          <TableRow key={d.label}>
            <TableCell>{d.label}</TableCell>
            <TableCell class="text-right tabular-nums">{d.value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
