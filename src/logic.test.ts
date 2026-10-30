import { expect, test } from "bun:test";
import { TABLEUR_COLUMNS, missingFields, tableurRow, toTsv, type TableurCompany, addDays, delaiDays, documentFile, isoDate, isWebUrl, parseFrontmatter, relanceForStatut, replayEchanges, setFrontmatter, slug, stripFrontmatter, relanceAfter, statutAfter, weeklyCounts } from "./logic";
import { NOM_FICHIER_DEFAUT, PROFIL_VIDE, contactWrite, fileName, fillProfil } from "./logic";

test("réouvrir une entreprise fermée remet une relance à J+7", () => {
  expect(relanceForStatut("contacte", null, "2026-10-14")).toBe("2026-10-21");
  expect(relanceForStatut("relance", "2026-10-30", "2026-10-14")).toBe("2026-10-30");
  expect(relanceForStatut("entretien", "2026-10-30", "2026-10-14")).toBeNull();
  expect(relanceForStatut("refuse", "2026-10-30", "2026-10-14")).toBeNull();
});

test("documentFile slugifie le titre, refuse un titre vide", () => {
  expect(documentFile("Ma Lettre été", "md")).toBe("ma-lettre-ete.md");
  expect(() => documentFile("!!!", "txt")).toThrow();
});

test("setFrontmatter remplace, ajoute, retire sans toucher au corps", () => {
  const content = "---\ntype: lettre\nstatut: brouillon\n---\n\nCorps\n";
  expect(setFrontmatter(content, { statut: "envoyee", date_envoi: "2026-10-14" })).toBe(
    "---\ntype: lettre\nstatut: envoyee\ndate_envoi: 2026-10-14\n---\n\nCorps\n",
  );
  expect(setFrontmatter(content, { statut: "brouillon", date_envoi: "" })).toBe("---\ntype: lettre\nstatut: brouillon\n---\n\nCorps\n");
});

test("supprimer une relance remet statut et relance de l'échange précédent", () => {
  const mail = { type: "mail" as const, date: "2026-10-01", delai: 7 };
  const relance = { type: "relance" as const, date: "2026-10-13", delai: 7 };
  expect(replayEchanges("relance", [mail, relance])).toEqual({ statut: "relance", prochaine: "2026-10-20" });
  expect(replayEchanges("relance", [mail])).toEqual({ statut: "contacte", prochaine: "2026-10-08" });
  expect(replayEchanges("contacte", [])).toEqual({ statut: "a_contacter", prochaine: null });
});

test("parseFrontmatter lit les clés simples entre les deux ---", () => {
  const content = "---\ntype: lettre\nentreprise: Acme\nstatut: envoyee\n---\n\nCorps\nfoo: bar\n";
  expect(parseFrontmatter(content)).toEqual({ type: "lettre", entreprise: "Acme", statut: "envoyee" });
  expect(parseFrontmatter("# pas de frontmatter\ntype: lettre")).toEqual({});
});

test("addDays passe les fins de mois et d'année", () => {
  expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
  expect(addDays("2026-12-30", 7)).toBe("2027-01-06");
});

test("un mail planifie la relance, un entretien l'annule, une réponse la garde", () => {
  expect(relanceAfter("mail", "2026-10-13", 7, null, "contacte")).toBe("2026-10-20");
  expect(relanceAfter("entretien", "2026-10-13", 7, "2026-10-20", "entretien")).toBeNull();
  expect(relanceAfter("reponse", "2026-10-13", 7, "2026-10-20", "contacte")).toBe("2026-10-20");
});

test("réponse favorable -> entretien, défavorable -> refus, sans relance", () => {
  expect(statutAfter("reponse_favorable", "contacte")).toBe("entretien");
  expect(statutAfter("reponse_defavorable", "relance")).toBe("refuse");
  expect(statutAfter("reponse_defavorable", "offre")).toBe("offre");
  expect(relanceAfter("reponse_favorable", "2026-10-13", 7, "2026-10-20", "entretien")).toBeNull();
  expect(relanceAfter("reponse_defavorable", "2026-10-13", 7, "2026-10-20", "refuse")).toBeNull();
});

test("relance optionnelle: délai null = pas de relance planifiée", () => {
  expect(relanceAfter("mail", "2026-10-13", null, null, "contacte")).toBeNull();
  expect(delaiDays(null)).toBeNull();
  expect(replayEchanges("contacte", [{ type: "mail", date: "2026-10-01", delai: null }])).toEqual({ statut: "contacte", prochaine: null });
});

test("pas d'alternant (indisponible) est fermé: pas de relance, un échange garde le statut", () => {
  expect(relanceForStatut("indisponible", "2026-10-30", "2026-10-14")).toBeNull();
  expect(statutAfter("mail", "indisponible")).toBe("indisponible");
  expect(replayEchanges("indisponible", [{ type: "mail", date: "2026-10-01", delai: 7 }])).toEqual({ statut: "indisponible", prochaine: null });
});

test("aucune relance sur une entreprise fermée (offre ou refus)", () => {
  expect(relanceAfter("mail", "2026-10-01", 7, null, "refuse")).toBeNull();
  expect(relanceAfter("mail", "2026-10-01", 7, null, "contacte")).toBe("2026-10-08");
});

test("replayEchanges ne recrée pas de relance sur un refus", () => {
  expect(replayEchanges("refuse", [{ type: "mail", date: "2026-10-01", delai: 7 }]).prochaine).toBeNull();
});

test("isoDate accepte YYYY-MM-DD réel, refuse le reste", () => {
  expect(isoDate("2026-10-13")).toBe("2026-10-13");
  for (const bad of ["garbage", "2026-02-30", "2026-1-5"]) expect(() => isoDate(bad)).toThrow("date invalide");
});

test("delaiDays: 7 par défaut, entier 1 à 365", () => {
  expect(delaiDays(undefined)).toBe(7);
  expect(delaiDays("14")).toBe(14);
  for (const bad of ["abc", "0", "1.5", "400"]) expect(() => delaiDays(bad)).toThrow("délai invalide");
});

test("le statut suit l'interaction mais une offre ou un refus est figé", () => {
  expect(statutAfter("mail", "a_contacter")).toBe("contacte");
  expect(statutAfter("relance", "contacte")).toBe("relance");
  expect(statutAfter("relance", "refuse")).toBe("refuse");
});

test("dépôt physique -> contacte", () => {
  expect(statutAfter("depot", "a_contacter")).toBe("contacte");
});

test("weeklyCounts groupe par semaine (lundi) et ignore hors fenêtre", () => {
  const result = weeklyCounts(["2026-10-12", "2026-10-18", "2026-10-11", "2026-09-01"], "2026-10-13", 2);
  expect(result).toEqual([
    { week: "2026-10-05", count: 1 },
    { week: "2026-10-12", count: 2 },
  ]);
});

test("slug donne un nom de fichier sûr, sans accents ni préfixe _", () => {
  expect(slug("Société Générale & Co")).toBe("societe-generale-co");
  expect(slug("_template/../x")).toBe("template-x");
});

test("isWebUrl refuse les schémas non http (javascript:)", () => {
  expect(isWebUrl("https://a.fr")).toBe(true);
  expect(isWebUrl("javascript:alert(1)")).toBe(false);
});

test("stripFrontmatter retire l'en-tête YAML, garde le reste", () => {
  expect(stripFrontmatter("---\ntype: lettre\n---\n\n# Titre\n---\nx")).toBe("\n# Titre\n---\nx");
  expect(stripFrontmatter("# sans en-tête")).toBe("# sans en-tête");
});

test("nom de PDF: placeholders remplis, espaces en _, caractères de chemin retirés", () => {
  expect(fileName(NOM_FICHIER_DEFAUT, { username: "Camille Martin", entreprise: "Crédit/Agricole" })).toBe("Lettre_Motivation_Camille_Martin-CréditAgricole");
});

test("template profil: ligne vide retirée, ligne remplie gardée", () => {
  const profil = { ...PROFIL_VIDE, username: "Camille Martin", site: "https://example.com" };
  const out = fillProfil("**{{nom}}**\n{{adresse}}\n{{site}}\nAutre", profil);
  expect(out).toBe("**Camille Martin**\nhttps://example.com\nAutre");
});

const base: TableurCompany = {
  nom: "Acme", secteur: null, adresse: null, code_postal: null, ville: null, domaine: null, effectif: null, note_google: null,
  actualite: null, annonce: null, contact_cv: null, suivi_linkedin: null, suivi_insta: null, suivi_facebook: null, suivi_tiktok: null,
  notes: null, statut: "a_contacter",
};
const echangesSample = [
  { type: "depot" as const, date: "2026-10-01" },
  { type: "mail" as const, date: "2026-09-20" },
  { type: "mail" as const, date: "2026-10-03" },
  { type: "relance" as const, date: "2026-10-10" },
  { type: "entretien" as const, date: "2026-10-15" },
  { type: "entretien" as const, date: "2026-10-25" },
];

test("tableur: 31 colonnes, une ligne de même largeur", () => {
  expect(TABLEUR_COLUMNS.length).toBe(31);
  expect(tableurRow(base, [], [], "2026-10-18").length).toBe(31);
});

test("tableur: entreprise vide -> candidature spontanée, suivis non, dates vides", () => {
  const row = tableurRow(base, [], [], "2026-10-18");
  expect(row[15]).toBe("Candidature spontanée");
  expect(row.slice(18, 22)).toEqual(["non", "non", "non", "non"]);
  expect(row[29]).toBe("");
});

test("tableur: contact non RH et RH, nom découpé en nom + prénom", () => {
  const contacts = [
    { nom: "Jane Doe", role: "RH", email: "jane@x.fr", telephone: "07", linkedin: null },
    { nom: "Paul Martin Dupont", role: "CTO", email: "p@x.fr", telephone: "06", linkedin: "https://linkedin.com/in/p" },
  ];
  const row = tableurRow(base, contacts, [], "2026-10-18");
  expect(row.slice(6, 11)).toEqual(["Martin Dupont", "Paul", "p@x.fr", "06", "https://linkedin.com/in/p"]);
  expect(row.slice(11, 15)).toEqual(["Doe", "Jane", "jane@x.fr", "07"]);
});

test("tableur: rôle DRH rangé dans les colonnes RH, pas contact", () => {
  const contacts = [{ nom: "Jane Doe", role: "DRH", email: "jane@x.fr", telephone: "07", linkedin: null }];
  const row = tableurRow(base, contacts, [], "2026-10-18");
  expect(row.slice(11, 15)).toEqual(["Doe", "Jane", "jane@x.fr", "07"]);
  expect(row.slice(6, 11)).toEqual(["", "", "", "", ""]);
});

test("tableur: dates tirées des échanges", () => {
  const row = tableurRow(base, [], echangesSample, "2026-10-18");
  expect(row[22]).toBe("2026-10-01");
  expect(row[23]).toBe("2026-09-20");
  expect(row[25]).toBe("2026-10-03");
  expect(row[26]).toBe("2026-10-10");
  expect(row[27]).toBe("2026-10-15");
  expect(row[28]).toBe("2026-10-15");
});

test("tableur: réponse selon statut ou dernière réponse", () => {
  expect(tableurRow({ ...base, statut: "refuse" }, [], [], "2026-10-18")[29]).toBe("Négative");
  const favorable = [{ type: "reponse_favorable" as const, date: "2026-10-05" }];
  expect(tableurRow({ ...base, statut: "contacte" }, [], favorable, "2026-10-18")[29]).toBe("Positive");
});

test("tableur: statut entretien sans échange d'entretien -> décroché oui", () => {
  expect(tableurRow({ ...base, statut: "entretien" }, [], [], "2026-10-18")[27]).toBe("oui");
});

test("toTsv: cellules avec tab, newline, guillemet échappées", () => {
  expect(toTsv([["a", "b\tc"], ['d"e', "f\ng"]])).toBe('a\t"b\tc"\n"d""e"\t"f\ng"');
});

const fiche = { ...base, site: "acme.fr", ville: "Paris", secteur: "Tech", domaine: "Dev", adresse: "1 rue X" };

test("missingFields: fiche complète, RH avec mail et téléphone -> rien ne manque", () => {
  const contacts = [{ nom: "Jane Doe", role: "DRH", email: "jane@x.fr", telephone: "07", linkedin: null }];
  expect(missingFields(fiche, contacts)).toEqual([]);
});

test("missingFields: entreprise vide sans contact -> les 8 libellés dans l'ordre", () => {
  expect(missingFields({ ...base, site: null }, [])).toEqual(["site", "ville", "secteur", "domaine", "adresse", "mail", "téléphone", "contact RH"]);
});

test("missingFields: RH avec mail seul -> téléphone manquant, ni mail ni contact RH", () => {
  const contacts = [{ nom: "Jane Doe", role: "DRH", email: "jane@x.fr", telephone: null, linkedin: null }];
  const missing = missingFields(fiche, contacts);
  expect(missing).toContain("téléphone");
  expect(missing).not.toContain("mail");
  expect(missing).not.toContain("contact RH");
});

const jane = { id: 7, nom: "Jane Doe", role: "DRH", email: "old@x.fr", telephone: "0601", linkedin: "li" };

test("contact: nom + prénom recombined on create", () => {
  expect(contactWrite({ company: "Acme", rh: false, field: "nom", value: "Doe", nom: "", prenom: "Jane" })).toEqual({
    action: "personne",
    fields: { entreprise: "Acme", nom: "Jane Doe", role: "" },
  });
});

test("contact: create on RH cell gets role RH and the changed field", () => {
  expect(contactWrite({ company: "Acme", rh: true, field: "email", value: "rh@x.fr", nom: "", prenom: "" })).toEqual({
    action: "personne",
    fields: { entreprise: "Acme", nom: "RH", role: "RH", email: "rh@x.fr" },
  });
});

test("contact: empty nom on create falls back to Contact", () => {
  expect(contactWrite({ company: "Acme", rh: false, field: "prenom", value: "", nom: "", prenom: "" }).fields.nom).toBe("Contact");
});

test("contact: modify keeps other fields, empty names fall back to current nom", () => {
  expect(contactWrite({ company: "Acme", rh: true, field: "email", value: "new@x.fr", nom: "", prenom: "", target: jane })).toEqual({
    action: "personne-modifier",
    fields: { id: "7", nom: "Jane Doe", role: "DRH", email: "new@x.fr", tel: "0601", linkedin: "li" },
  });
});

test("contact: modify nom recombines with current prénom", () => {
  expect(contactWrite({ company: "Acme", rh: true, field: "nom", value: "Smith", nom: "Doe", prenom: "Jane", target: jane }).fields.nom).toBe("Jane Smith");
});
