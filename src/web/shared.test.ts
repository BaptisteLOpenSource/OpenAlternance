import { expect, test } from "bun:test";
import type { CompanyRow } from "../repo";
import { type Send, sendFiche } from "./shared";

test("sendFiche garde les champs d'un envoi encore en vol", async () => {
  const sent: Record<string, string>[] = [];
  const resolvers: ((ok: boolean) => void)[] = [];
  const send: Send = (_action, fields) => {
    sent.push(fields);
    return new Promise((resolve) => resolvers.push(resolve));
  };
  const company = { nom: "Acme", mail_objet: "", mail_canal: "email" } as unknown as CompanyRow;

  const first = sendFiche(send, company, { mail_objet: "Candidature" });
  const second = sendFiche(send, company, { mail_canal: "linkedin" });
  expect(sent[1]).toMatchObject({ entreprise: "Acme", mail_objet: "Candidature", mail_canal: "linkedin" });

  resolvers.forEach((resolve) => resolve(true));
  expect(await Promise.all([first, second])).toEqual([true, true]);

  // Map cleared once the saves settled: next payload falls back to the snapshot.
  const later = sendFiche(send, company, { notes: "x" });
  expect(sent[2]).toMatchObject({ mail_objet: "", mail_canal: "email", notes: "x" });
  resolvers.at(-1)!(true);
  await later;
});
