import type { Profil } from "../logic";
import { fileName } from "../logic";
import { type Send, formFields } from "./shared";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "./ui";

// Same form in the account page and in the dashboard dialog: one place for the fields.
export function ProfilForm({ profil, send, onDone }: { profil: Profil; send: Send; onDone?: () => void }) {
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    const fields = formFields(e.currentTarget as HTMLFormElement);
    if (await send("profil", fields)) onDone?.();
  };
  return (
    <form class="grid gap-4" onSubmit={submit}>
      <div class="grid gap-4 sm:grid-cols-2">
        <Label label="Nom d'utilisateur (obligatoire, signature et nom du PDF)">
          <Input name="username" required defaultValue={profil.username} autofocus={!!onDone} />
        </Label>
        <Label label="Email (optionnel)">
          <Input name="email" type="email" defaultValue={profil.email} />
        </Label>
        <Label label="Téléphone (optionnel)">
          <Input name="telephone" type="tel" defaultValue={profil.telephone} />
        </Label>
        <Label label="Site web / portfolio (optionnel)">
          <Input name="site" type="url" placeholder="https://" defaultValue={profil.site} />
        </Label>
      </div>
      <Label label="Adresse (optionnel)">
        <Input name="adresse" defaultValue={profil.adresse} />
      </Label>
      <Label label="Format du nom du PDF de lettre (obligatoire)">
        <Input name="nom_fichier" required defaultValue={profil.nom_fichier} />
      </Label>
      <p class="break-all text-sm text-muted-foreground">
        Variables : {"{username}"}, {"{entreprise}"}. Exemple : {fileName(profil.nom_fichier, { username: profil.username || "Prenom_Nom", entreprise: "Entreprise" })}.pdf
      </p>
      <div class="flex justify-end gap-2">
        <Button type="submit" class="w-full sm:w-auto">
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

export function ComptePage({ profil, send }: { profil: Profil; send: Send }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mon compte</CardTitle>
        <CardDescription>Identité utilisée dans les lettres de motivation. Seul le nom d'utilisateur est obligatoire.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfilForm profil={profil} send={send} />
      </CardContent>
    </Card>
  );
}
