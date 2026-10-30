import { Check, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { type Send, StatutBadge, RelanceBadge, RelanceControls, isTodo, relanceEnvoyee } from "./shared";
import type { AppState } from "./store";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";

export function TodoPage({ state, send }: { state: AppState; send: Send }) {
  const { today } = state;
  const [status, setStatus] = useState("");
  const todo = state.companies.filter((c) => isTodo(c, today)).sort((a, b) => a.prochaine_relance!.localeCompare(b.prochaine_relance!));

  const relancer = async (nom: string) => {
    if (await relanceEnvoyee(send, nom)) setStatus(`Relance enregistrée : ${nom}`);
  };
  const refuser = async (nom: string) => {
    if (confirm(`Passer ${nom} en refusé ?`) && (await send("statut", { entreprise: nom, statut: "refuse" }))) setStatus(`Refusé : ${nom}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Todo · {todo.length}</CardTitle>
        <CardDescription>Relance faite, refusée, ou annulée. Non traitée : ramenée à aujourd'hui avec son retard.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p role="status" aria-live="polite" class="text-sm text-muted-foreground empty:hidden">
          {status}
        </p>
        {todo.length === 0 ? (
          <p class="text-sm text-muted-foreground">Rien à traiter.</p>
        ) : (
          <ul class="grid gap-2">
            {todo.map((c) => (
              <li key={c.id} class="grid gap-3 rounded-lg border border-border/20 bg-background/40 p-3">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{c.nom}</p>
                    <StatutBadge statut={c.statut} class="mt-1" />
                  </div>
                  <RelanceBadge company={c} today={today} />
                  <div class="flex gap-2">
                    <Button size="sm" onClick={() => relancer(c.nom)}>
                      <Check />
                      Relancé
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => refuser(c.nom)}>
                      <X />
                      Refusé
                    </Button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2 border-t pt-2">
                  <RelanceControls company={c} send={send} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
