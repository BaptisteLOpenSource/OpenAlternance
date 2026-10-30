import { expect, test } from "bun:test";
import { escapeHtml, renderDocument, textToHtml } from "./documents";

test("texte PDF : tout échappé, aucune balise ni script du fichier source", () => {
  const html = textToHtml(["<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>"]);
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("txt et md rendus sans script, html brut interdit en markdown", () => {
  expect(renderDocument("txt", "<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
  const md = renderDocument("md", "<script>alert(1)</script>\n\n# Titre");
  expect(md).not.toContain("<script>alert(1)");
  expect(md).toContain("<h1>Titre</h1>");
  expect(renderDocument("txt", "x")).toContain("Content-Security-Policy");
});

test("escapeHtml couvre les guillemets d'attribut", () => {
  expect(escapeHtml(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
});
