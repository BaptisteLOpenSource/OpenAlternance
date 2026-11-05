import { inflateRawSync } from "node:zlib";
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

// Minimal zip reader: DOCX/ODT need one entry, no dependency for that.
function zipEntry(zip: Buffer, wanted: string): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let at = zip.readUInt32LE(eocd + 16);
  for (let i = zip.readUInt16LE(eocd + 10); i > 0 && zip.readUInt32LE(at) === 0x02014b50; i--) {
    const nameLen = zip.readUInt16LE(at + 28);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLen);
    if (name === wanted) {
      const local = zip.readUInt32LE(at + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + zip.readUInt32LE(at + 20));
      const method = zip.readUInt16LE(at + 10);
      if (method === 0) return data;
      return method === 8 ? inflateRawSync(data, { maxOutputLength: 50_000_000 }) : null;
    }
    at += 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(Number(e[1].toLowerCase() === "x" ? `0${e.slice(1)}` : e.slice(1))) : (ENTITIES[e] ?? m),
  );

// DOCX (word/document.xml) or ODT (content.xml): paragraphs as plain text.
export function officeToHtml(data: Uint8Array): string {
  const zip = Buffer.from(data);
  const xml = (zipEntry(zip, "word/document.xml") ?? zipEntry(zip, "content.xml"))?.toString("utf8");
  if (!xml) throw new Error("fichier Word/ODT invalide (DOCX ou ODT attendu)");
  const text = xml
    .replace(/<w:delText[^>]*>[^<]*<\/w:delText>/g, "")
    .replace(/<(w:tab|text:tab)\b[^>]*\/>/g, "\t")
    .replace(/<(w:br|w:cr|text:line-break)\b[^>]*\/>/g, "\n")
    .replace(/<text:s\b[^>]*\/>/g, " ")
    .replace(/<\/(w:p|text:p|text:h)>/g, "\n\n")
    .replace(/<[^>]+>/g, "");
  const body = textToHtml([decodeXml(text)]);
  if (!body.includes("<p>")) throw new Error("aucun texte extrait du document");
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
  if (format === "pdf") return "";
  if (format === "md") return page(Bun.markdown.html(content, { noHtmlBlocks: true, noHtmlSpans: true }));
  if (format === "html") return page(content);
  return page(`<pre>${escapeHtml(content)}</pre>`);
}

// Base64 PDF in JSON body: Vercel caps requests near 4.5 MB.
export const MAX_PDF_BASE64 = 4_000_000;
