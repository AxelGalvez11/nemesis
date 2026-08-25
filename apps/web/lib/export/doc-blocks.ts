// The model writes markdown; this turns it into a short list of shapes the file writers understand.
//
// 🔴🔴 THIS IS BORDER CONTROL, NOT A MARKDOWN PARSER. The repo's rule is that the model proposes and
// the parser disposes: a writer that walked the model's text directly would be trusting whatever it
// produced to be renderable, and the failure mode is a .docx that opens to a page of literal `##`.
// So the text is reduced HERE to four shapes, and everything unrecognised becomes a paragraph —
// which is always renderable and never a crash.
//
// 🔴 DELIBERATELY SMALL. It knows headings, bullets, numbered items, tables and paragraphs, because
// that is what a study document is made of. Images, code fences and block quotes are NOT handled:
// each would need a real answer in three writers, and a half-answer in one of them is how a file
// comes out looking broken in Word but fine in the preview. They arrive as paragraphs, intact.
//
// 🔴 TABLES EARNED THEIR PLACE BY BEING ANSWERED IN ALL THREE. They were a paragraph until
// 2026-08-25 — a comparison the model wrote came out of Word as a line of pipes — and they are here
// now because the .docx, the PDF and the reader each grew a real renderer in the same pass. That is
// the bar for the next shape somebody wants to add.
//
// PURE. No I/O, no dependencies.

export type DocBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "number"; index: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] };

/** Strips the inline marks the writers apply as style, or drop. Runs last, so a literal `**` that
 *  survives is a `**` the model meant. */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*(?=\W|$)/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    // A markdown link keeps the words and loses the brackets; the URL would be dead ink on paper.
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

/** A GitHub-flavoured separator row: `|---|:--:|` and its variations. */
const SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/** The cells of one `| a | b |` row, with the outer pipes dropped. */
function cells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => plain(cell.trim()));
}

export function docBlocks(markdown: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let numbering = 0;

  /**
   * 🔴🔴 A WRAPPED PARAGRAPH IS ONE PARAGRAPH, WHICH IS MARKDOWN'S OWN RULE AND WAS NOT WHAT THIS
   * DID. Every line became its own block, so a paragraph the model hard-wrapped at 100 characters
   * came out of Word as four stubby paragraphs with a gap between each — in the FILE, not just on
   * screen. It only surfaced because the artifact card renders through this same parser and the
   * broken spacing was visible there; the .docx had been doing it since it shipped.
   *
   * Only prose joins. A heading, a bullet and a numbered item are each one line by definition, and
   * every one of them closes whatever was open.
   */
  const open: string[] = [];
  const closeParagraph = () => {
    if (!open.length) return;
    const text = plain(open.join(" "));
    open.length = 0;
    if (text) blocks.push({ kind: "paragraph", text });
  };

  const lines = markdown.split("\n");
  /** Set when a table has consumed rows this loop must not re-read. */
  let skipTo = -1;
  const next = (index: number) => (lines[index + 1] ?? "").trim();

  for (const [index, raw] of lines.entries()) {
    if (index < skipTo) continue;
    const line = raw.trim();
    if (!line) {
      closeParagraph();
      // A blank line ends a numbered run, so two separate lists do not continue each other's count.
      numbering = 0;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeParagraph();
      numbering = 0;
      const text = plain(heading[2] ?? "");
      // 🔴 CLAMPED TO THREE. `docx` and the PDF writer each have three heading styles; a `####`
      // would otherwise index past the end of both and render as nothing at all.
      if (text) blocks.push({ kind: "heading", level: Math.min((heading[1] ?? "#").length, 3) as 1 | 2 | 3, text });
      continue;
    }

    // A horizontal rule carries no words, so there is nothing to render and nothing to lose.
    if (/^([-*_])\1{2,}$/.test(line)) {
      closeParagraph();
      numbering = 0;
      continue;
    }

    // 🔴🔴 A TABLE IS RECOGNISED BY ITS SEPARATOR ROW, NOT BY ITS PIPES. A single line of prose
    // containing a `|` is not a table, and treating it as one would silently eat the sentence.
    // GitHub-flavoured markdown requires `|---|---|` under the header, so that is what is matched:
    // present means the model meant a table, absent means it did not.
    if (line.startsWith("|") && SEPARATOR.test(next(index))) {
      closeParagraph();
      numbering = 0;
      const header = cells(line);
      const rows: string[][] = [];
      // Consume the separator, then every row until the shape ends.
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor]!.trim().startsWith("|")) {
        const row = cells(lines[cursor]!.trim());
        // 🔴 RESHAPED TO THE HEADER, the same rule the spreadsheet maker applies: a short row shifts
        // every later cell left and a long one spills past the last column. Both render as a table
        // that is quietly wrong, which is worse than one that refuses.
        rows.push(header.map((_, cell) => row[cell] ?? ""));
        cursor += 1;
      }
      skipTo = cursor;
      if (header.length) blocks.push({ header, kind: "table", rows });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      closeParagraph();
      numbering = 0;
      const text = plain(bullet[1] ?? "");
      if (text) blocks.push({ kind: "bullet", text });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      closeParagraph();
      const text = plain(numbered[1] ?? "");
      // 🔴 THE COUNT IS OURS, NOT THE MODEL'S. A model that writes "1. 2. 2. 4." would otherwise
      // print exactly that; renumbering means the list is always coherent on paper.
      if (text) blocks.push({ index: ++numbering, kind: "number", text });
      continue;
    }

    numbering = 0;
    // Held open: the next line may be the rest of this same sentence.
    open.push(line);
  }

  closeParagraph();
  return blocks;
}
