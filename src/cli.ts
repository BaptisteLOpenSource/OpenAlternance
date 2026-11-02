#!/usr/bin/env bun
import { readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { migrate, sql } from "./db";
import { STATUTS, TYPES, oneOf, type InteractionType, type Statut } from "./logic";
import { setup } from "./setup";
import { addCompany, addContact, listCompanies, logInteraction, setStatut } from "./repo";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    ville: { type: "string" },
    site: { type: "string" },
    notes: { type: "string" },
    note: { type: "string" },
    nom: { type: "string" },
    role: { type: "string" },
    email: { type: "string" },
    tel: { type: "string" },
    date: { type: "string" },
    delai: { type: "string" },
  },
});

const USAGE = `usage:
  migrate
  setup   (migrate + exemples si la base est vide)
  add <entreprise> [--ville --site --notes]
  personne <entreprise> --nom <nom> [--role --email --tel]
  contact <entreprise> <${TYPES.join("|")}> [--date YYYY-MM-DD] [--delai 7] [--note]
  statut <entreprise> <${STATUTS.join("|")}>
  liste
  sync-files   (lettres/*.md -> table lettres, data/cv.pdf + logo.png -> table fichiers)
  serve   (dashboard + formulaires sur http://127.0.0.1:3000)`;

const [command, ...args] = positionals;

function requireArg(value: string | undefined, label: string): string {
  if (!value) throw new Error(`argument manquant: ${label}\n${USAGE}`);
  return value;
}

try {
  switch (command) {
    case "migrate": {
      await migrate();
      console.log("schéma à jour");
      break;
    }
    case "setup": {
      const { seeded } = await setup();
      console.log(seeded ? "schéma à jour, exemples ajoutés" : "schéma à jour, données existantes conservées");
      break;
    }
    case "add": {
      const nom = requireArg(args[0], "entreprise");
      await addCompany(nom, { ville: values.ville, site: values.site, notes: values.notes });
      console.log(`ajouté: ${nom}`);
      break;
    }
    case "personne": {
      const entreprise = requireArg(args[0], "entreprise");
      await addContact(entreprise, {
        nom: requireArg(values.nom, "--nom"),
        role: values.role,
        email: values.email,
        tel: values.tel,
      });
      console.log(`contact ajouté à ${entreprise}`);
      break;
    }
    case "contact": {
      const entreprise = requireArg(args[0], "entreprise");
      const type: InteractionType = oneOf(requireArg(args[1], "type"), TYPES, "type");
      await logInteraction(entreprise, type, { date: values.date, delai: values.delai, note: values.note });
      console.log(`${type} enregistré pour ${entreprise}`);
      break;
    }
    case "statut": {
      const entreprise = requireArg(args[0], "entreprise");
      const statut: Statut = oneOf(requireArg(args[1], "statut"), STATUTS, "statut");
      await setStatut(entreprise, statut);
      console.log(`${entreprise} -> ${statut}`);
      break;
    }
    case "sync-files": {
      for (const file of (await readdir("lettres")).filter((name) => name.endsWith(".md"))) {
        const text = await Bun.file(`lettres/${file}`).text();
        await sql`INSERT INTO lettres (file, content) VALUES (${file}, ${text})
          ON CONFLICT (file) DO UPDATE SET content = EXCLUDED.content`;
        console.log(`lettre: ${file}`);
      }
      const binaries = [
        ...(await readdir("lettres")).filter((name) => name.endsWith(".pdf")).map((name) => `lettres/${name}`),
        "data/cv.pdf",
        "data/logo.png",
        "data/logo.svg",
      ];
      for (const path of binaries) {
        const name = path.split("/").pop()!;
        const file = Bun.file(path);
        if (!(await file.exists())) continue;
        const data = new Uint8Array(await file.arrayBuffer());
        await sql`INSERT INTO fichiers (name, data) VALUES (${name}, ${data})
          ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data`;
        console.log(`fichier: ${name}`);
      }
      break;
    }
    case "liste": {
      console.table(
        (await listCompanies()).map((c) => ({
          entreprise: c.nom,
          ville: c.ville,
          statut: c.statut,
          contacts: c.contacts.join(", "),
          dernier: c.derniere_interaction,
          relance: c.prochaine_relance,
        })),
      );
      break;
    }
    default:
      console.log(USAGE);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.close();
}
