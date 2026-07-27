// PDF text extraction for journal-club paper uploads. Runs in the Node.js route runtime (unpdf ships a
// serverless PDF.js build). Pure helpers (capText, guessTitle) are unit-tested; extractPdfText does the
// I/O-free-but-async parse. No filesystem writes — bytes in, text out.
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractResult {
  text: string;
  /** One entry per page, normalised the same way `text` is. The caller needs the
   *  page boundaries to tell WHICH pages have no readable text — a document that
   *  is 90% pictures of pages joins into a perfectly plausible-looking string, and
   *  only the per-page view shows the holes. See lib/pdf/pages.ts. */
  pageTexts: string[];
  meta: { title: string | null; pages: number; truncated: boolean };
}

/** Hard cap on extracted text handed downstream (~200KB of characters). Keeps the request body and the
 *  saved-report payload bounded; a longer paper is appraised from this leading prefix (truncated=true). */
export const TEXT_CAP = 200_000;

/** Cap `raw` to `cap` characters, reporting whether anything was dropped. PURE. */
export function capText(raw: string, cap: number): { text: string; truncated: boolean } {
  if (raw.length <= cap) return { text: raw, truncated: false };
  return { text: raw.slice(0, cap), truncated: true };
}

/** Best-effort paper title: the first line long enough to be a real title (>= 12 chars, has a space),
 *  skipping page numbers / PMID / DOI header noise. Returns null when nothing plausible is found. PURE. */
export function guessTitle(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 15)) {
    if (line.length < 12) continue;
    if (!line.includes(" ")) continue;
    if (/^(pmid|doi|https?:|www\.|copyright|©)\b/i.test(line)) continue;
    return line.slice(0, 300);
  }
  return null;
}

/** Extract text from PDF bytes. Joins per-page text with newlines, caps it, and derives light metadata.
 *  Throws only on a genuinely unreadable/corrupt PDF; a valid-but-image-only PDF returns empty text (the
 *  route turns that into a specific "no text layer" error). */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  // pdf.js DETACHES the ArrayBuffer it is given. Anything that reads these bytes
  // afterwards — slicing pages for the vision pass, sniffing the file type — gets
  // a zeroed buffer, silently. Found the hard way while auditing this corpus: an
  // image scan that ran after extraction reported zero images in 83 files that
  // hold 2,949 of them. Hand it a copy and the caller's bytes stay intact.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // mergePages defaults to false: unpdf returns one string per page (each already newline-separated
  // via its own per-line hasEOL markers). Do NOT pass mergePages: true — that path runs
  // `texts.join("\n").replace(/\s+/g, " ")` internally, which collapses every newline (including the
  // ones between lines within a page) before guessTitle() ever sees the text. Joining the per-page
  // array ourselves keeps line structure intact for guessTitle's `\r?\n` split.
  const { totalPages, text } = await extractText(pdf);
  const pages = Array.isArray(text) ? text : [text];
  // Collapse horizontal whitespace/control-character noise (repeated spaces/tabs, stray control bytes)
  // while preserving newlines — guessTitle() depends on line structure via a \r?\n split.
  const clean = (raw: string) =>
    raw.replace(/[^\S\r\n]+/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
  const pageTexts = pages.map((page) => clean(String(page)));
  const { text: capped, truncated } = capText(pageTexts.join("\n").trim(), TEXT_CAP);
  return {
    text: capped,
    pageTexts,
    meta: { title: guessTitle(capped), pages: totalPages ?? pageTexts.length, truncated },
  };
}
