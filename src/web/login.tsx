import { Trophy } from "lucide-preact";
import { useState } from "preact/hooks";
import { BubbleBackground } from "./fx";
import { Button, Card, Input, Label } from "./ui";

export function LoginPage({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLogin(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <BubbleBackground class="absolute inset-0" />
      <Card class="relative w-full max-w-sm px-6">
        <div class="grid justify-items-center gap-2 text-center">
          <div class="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Trophy class="size-5" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">OpenAlternance</h1>
          <p class="text-sm text-muted-foreground">Suivi des démarches</p>
        </div>
        <form onSubmit={submit} class="grid gap-3">
          <Label label="Mot de passe">
            <Input
              class="max-sm:h-11"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              autofocus
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </Label>
          {error && <p role="alert" class="text-sm text-destructive">{error}</p>}
          <Button type="submit" class="max-sm:h-11" disabled={busy}>
            {busy ? "Connexion..." : "Se connecter"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
