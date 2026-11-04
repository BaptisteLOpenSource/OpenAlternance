import { useState } from "preact/hooks";
import type { Send } from "./shared";
import { MAX_PDF_BYTES, readBase64 } from "./dialogs";
import type { AppState } from "./store";
import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "./ui";

// iOS Safari does not render PDF in iframes: the download link is the fallback.
export function CvPage({ state, send }: { state: AppState; send: Send }) {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const upload = async (e: SubmitEvent) => {
    e.preventDefault();
    const file = new FormData(e.currentTarget as HTMLFormElement).get("cv");
    if (!(file instanceof File) || file.size === 0) return setError("Choisissez un fichier PDF");
    if (file.size > MAX_PDF_BYTES) return setError("PDF trop lourd (3 Mo max)");
    if (await send("cv", { data: await readBase64(file) })) setVersion((v) => v + 1);
  };
  const form = (
    <form class="flex flex-wrap items-end gap-2" onSubmit={upload}>
      <Label label="Fichier PDF">
        <Input name="cv" type="file" accept="application/pdf" required />
      </Label>
      <Button type="submit" size="sm">
        {state.cv ? "Remplacer" : "Envoyer le CV"}
      </Button>
      {error && <p role="alert" class="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
  if (!state.cv) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CV</CardTitle>
          <CardDescription>Aucun CV enregistré. Envoyez un PDF.</CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    );
  }
  return (
    <Card class="overflow-hidden p-0">
      <CardHeader class="pt-6">
        <CardTitle>CV</CardTitle>
        <CardAction class="flex flex-wrap items-center gap-3">
          <a href="/api/cv.pdf" download="cv.pdf" class="text-sm underline underline-offset-4">
            Télécharger
          </a>
          <a href="/api/cv.pdf" target="_blank" rel="noopener" class="text-sm underline underline-offset-4">
            Ouvrir le CV
          </a>
        </CardAction>
      </CardHeader>
      <CardContent class="grid gap-4">
        {form}
        <iframe key={version} src="/api/cv.pdf" class="h-[70dvh] w-full md:h-[calc(100dvh-16rem)]" title="CV">
          <a href="/api/cv.pdf" target="_blank" rel="noopener">Ouvrir le CV</a>
        </iframe>
      </CardContent>
    </Card>
  );
}
