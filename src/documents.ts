import { extractText, getDocumentProxy } from "unpdf";
import { escapeHtml, type DocFormat } from "./logic";


// Stored fragment: every character escaped, so no tag or script from the source file survives.
export function textToHtml(pages: string[]): string {
  return pages
    .map((page) => {
      const paragraphs = page
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");
      return `<section>${paragraphs}</section>`;
    })
    .join("");
}

export async function pdfToHtml(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const body = textToHtml(Array.isArray(text) ? text : [text]);
  if (!body.includes("<p>")) throw new Error("aucun texte extrait (PDF scanné ?)");
  return body;
}

// Read-only page for the sandboxed iframe: no script, no remote resource.
const page = (body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>body{margin:0;padding:16px;font:15px/1.6 system-ui,sans-serif;color:#111;background:#fff}
section{max-width:46rem;margin:0 auto 2rem}p{margin:0 0 1em;white-space:pre-line}pre{white-space:pre-wrap}
@media (prefers-color-scheme:dark){body{color:#e4e4e7;background:#18181b}}</style></head><body>${body}</body></html>`;

// Body comes from our renderer only: md goes through noHtmlBlocks/noHtmlSpans, txt is escaped, html is textToHtml output.
export function renderDocument(format: DocFormat, content: string): string {
  if (format === "md") return page(Bun.markdown.html(content, { noHtmlBlocks: true, noHtmlSpans: true }));
  if (format === "html") return page(content);
  return page(`<pre>${escapeHtml(content)}</pre>`);
}

// Base64 PDF in JSON body: Vercel caps requests near 4.5 MB.
export const MAX_PDF_BASE64 = 4_000_000;
