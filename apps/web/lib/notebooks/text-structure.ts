/**
 * A text file, read as a document.
 *
 * 🔴 THIS LANE EXISTED AS A DOOR WITH NOTHING BEHIND IT. Every upload control offered `.md` and
 * `.txt`, the storage bucket accepted `text/markdown` and `text/plain`, and `parsed_documents`
 * has allowed `doc_kind = 'text'` since 2026-08-06 — but `kindFor()` had no branch for either,
 * so `parseDocument` returned `unsupported` and stopped. Production agreed exactly: four markdown
 * files and one plain-text file stored, **zero parses**. A student could upload their own notes,
 * watch them appear in their library, and they were never read.
 *
 * Deterministic end to end: no model call, no heuristic beyond the markup the file itself writes.
 *
 * 🔴 AND THE TWO FORMATS ARE READ DIFFERENTLY ON PURPOSE, WHICH IS THE WHOLE DESIGN.
 * Markdown *states* its structure — `#` is a heading because the author typed a heading. Plain
 * text states nothing, so **nothing is inferred**: every paragraph is a paragraph. Guessing that a
 * short capitalised line is a heading would be a claim about the document that the document does
 * not make, and this lane's job is to report what survived, never to improve on it.
 *
 * That split is also what keeps it field-agnostic: `#` is markup, identical in a law outline and a
 * thermodynamics revision sheet. No keyword list appears here and none can.
 */

import { buildDocument, emphasisFromMarkup, type DocBlock, type DocumentModel } from "@nemesis/shared";

/** ATX headings only — `# Heading` through `###### Heading`. */
const ATX = /^(#{1,6})\s+(.*)$/;
/** `- item`, `* item`, `+ item`, `1. item`, `1) item`. */
const LIST = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
/** A fence opens or closes with three or more backticks or tildes. */
const FENCE = /^\s*(`{3,}|~{3,})/;

export interface TextDocumentRead {
  model: DocumentModel;
  /** The document's own title, when it states one. Never invented. */
  title: string | null;
}

function decode(bytes: Uint8Array): string {
  // `fatal: false` so a file with one bad byte still reads; a replacement character is a visible
  // scar on one glyph, where throwing would lose the whole document over it.
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Strip a BOM: Windows editors write one and it would otherwise become the first character of
  // the first heading, which then fails to match `ATX`.
  return (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n?/g, "\n");
}

/**
 * Split into paragraph-ish chunks on blank lines, keeping fenced code together.
 *
 * 🔴 A FENCE IS OPAQUE AND THAT IS NOT A DETAIL. Inside ``` a `#` is a comment in someone's
 * Python, and a `-` is a subtraction. Parsing them as a heading and a list item would invent
 * structure out of a quoted program — and, worse, would put that program's comments into
 * `headingPath`, where every block beneath would inherit a heading the author never wrote.
 */
function segment(text: string): { lines: string[]; fenced: boolean }[] {
  const out: { lines: string[]; fenced: boolean }[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = (fenced: boolean) => {
    if (current.some((line) => line.trim())) out.push({ fenced, lines: current });
    current = [];
  };

  for (const line of text.split("\n")) {
    const opener = FENCE.exec(line);
    if (fence) {
      current.push(line);
      // A fence closes on a marker of the same character; length is not compared, because an
      // unclosed fence swallowing the rest of the file is the worse failure.
      if (opener && opener[1]![0] === fence[0]) {
        flush(true);
        fence = null;
      }
      continue;
    }
    if (opener) {
      flush(false);
      fence = opener[1]!;
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush(false);
      continue;
    }
    current.push(line);
  }
  // An unterminated fence is still content; it is kept, marked fenced, rather than dropped.
  flush(fence !== null);
  return out;
}

/**
 * Read a text file into the canonical model.
 *
 * `markdown` decides whether the file's markup is honoured. A `.txt` containing `# Notes` is a
 * person writing a hash, not a heading, and it is read as prose.
 */
export function readTextDocument(bytes: Uint8Array, options: { markdown: boolean }): TextDocumentRead {
  const text = decode(bytes);
  const blocks: Omit<DocBlock, "id">[] = [];
  const path: { level: number; text: string }[] = [];
  let title: string | null = null;

  // `buildDocument` assigns the ids, so none is minted here — two id schemes for one model is how
  // a locator comes to disagree with the block it names.
  const push = (block: Omit<DocBlock, "headingPath" | "unit" | "id">) => {
    blocks.push({ ...block, headingPath: path.map((entry) => entry.text), unit: 0 });
  };
  const emphasisOf = (markup: string) => {
    if (!options.markdown) return {};
    const emphasis = emphasisFromMarkup(markup);
    return emphasis.length ? { emphasis } : {};
  };

  for (const chunk of segment(text)) {
    const joined = chunk.lines.join("\n").trim();
    if (!joined) continue;

    // Fenced code is one paragraph, whole and unparsed. Its text is preserved exactly — a code
    // sample a student pasted is content, and reflowing it would destroy the only thing about it
    // that carries meaning.
    if (chunk.fenced) {
      push({ kind: "paragraph", text: joined });
      continue;
    }

    for (const line of chunk.lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const heading = options.markdown ? ATX.exec(trimmed) : null;
      if (heading) {
        const level = heading[1]!.length;
        const label = heading[2]!.trim();
        // The path holds only ancestors: drop anything at this level or deeper before adding.
        while (path.length > 0 && path[path.length - 1]!.level >= level) path.pop();
        push({ kind: "heading", level, text: label, ...emphasisOf(label) });
        path.push({ level, text: label });
        // The FIRST top-level heading names the document. Later ones do not: a notes file with
        // several `#` sections has no single title, and picking one would be a guess.
        if (title === null && level === 1) title = label;
        continue;
      }

      const item = options.markdown ? LIST.exec(line) : null;
      if (item) {
        push({ kind: "listItem", marker: item[1]!, text: item[2]!.trim(), ...emphasisOf(item[2]!) });
        continue;
      }

      push({ kind: "paragraph", text: trimmed, ...emphasisOf(trimmed) });
    }
  }

  return {
    model: buildDocument({
      blocks,
      format: "text",
      title,
      // 🔴 ONE UNIT, KIND `body`. A text file has no pages — it has no page size, no page breaks
      // and no way to know where a printed page would end. Reporting "page 1 of 1" would be an
      // invented locator, and `body` is the honest member the model already carries for exactly
      // this case.
      units: [{ index: 0, kind: "body" }],
    }),
    title,
  };
}
