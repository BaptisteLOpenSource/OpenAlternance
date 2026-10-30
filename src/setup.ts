import { readdir } from "node:fs/promises";
import { migrate, sql } from "./db";
import type { DocFormat, InteractionType } from "./logic";
import { addCompany, addContact, listCompanies, logInteraction } from "./repo";

type Example = {
  nom: string;
  ville?: string;
  site?: string;
  notes?: string;
  contacts?: { nom: string; role?: string; email?: string; tel?: string; linkedin?: string }[];
  interactions?: { type: InteractionType; date?: string; note?: string; delai?: string }[];
};

export async function setup(): Promise<{ migrated: true; seeded: boolean }> {
  await migrate();
  if ((await listCompanies()).length > 0) return { migrated: true, seeded: false };

  const examples: Example[] = await Bun.file("exemples/entreprises.json").json();
  for (const { contacts = [], interactions = [], nom, ...fields } of examples) {
    await addCompany(nom, fields);
    for (const contact of contacts) await addContact(nom, contact);
    for (const { type, ...rest } of interactions) await logInteraction(nom, type, rest);
  }

  const read = (path: string) => Bun.file(path).text();
  const lettre = async (file: string, path: string) =>
    sql`INSERT INTO lettres (file, content) VALUES (${file}, ${await read(path)}) ON CONFLICT (file) DO NOTHING`;
  await lettre("_template.md", "lettres/_template.md");
  for (const name of await readdir("exemples")) {
    const format = name.split(".").pop() as DocFormat;
    if (name.startsWith("lettre-")) await lettre(name, `exemples/${name}`);
    else if (format === "md" || format === "txt")
      await sql`INSERT INTO documents (name, format, content) VALUES (${name}, ${format}, ${await read(`exemples/${name}`)}) ON CONFLICT (name) DO NOTHING`;
  }
  return { migrated: true, seeded: true };
}
