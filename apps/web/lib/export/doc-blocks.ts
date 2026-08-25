// The model writes markdown; this turns it into a short list of shapes the file writers understand.
//
// 🔴🔴 THIS IS BORDER CONTROL, NOT A MARKDOWN PARSER. The repo's rule is that the model proposes and
// the parser disposes: a writer that walked the model's text directly would be trusting whatever it
// produced to be renderable, and the failure mode is a .docx that opens to a page of literal `##`.
// So the text is reduced HERE to four shapes, and everything unrecognised becomes a paragraph —
// which is always renderable and never a crash.
//
// 🔴 DELIBERATELY SMALL. It knows headings, bullets, numbered items and paragraphs, because that is
// what a study document is made of. Tables, images, code fences and block quotes are NOT handled:
// each would need a real answer in three writers, and a half-answer in one of them is how a file
// comes out looking broken in Word but fine in the preview. They arrive as paragraphs, intact.
//
// PURE. No I/O, no dependencies.

export type DocBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "number"; index: number; text: string }
  | { kind: "paragraph"; text: string };

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

export function docBlocks(markdown: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let numbering = 0;

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) {
      // A blank line ends a numbered run, so two separate lists do not continue each other's count.
      numbering = 0;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      numbering = 0;
      const text = plain(heading[2] ?? "");
      // 🔴 CLAMPED TO THREE. `docx` and the PDF writer each have three heading styles; a `####`
      // would otherwise index past the end of both and render as nothing at all.
      if (text) blocks.push({ kind: "heading", level: Math.min((heading[1] ?? "#").length, 3) as 1 | 2 | 3, text });
      continue;
    }

    // A horizontal rule carries no words, so there is nothing to render and nothing to lose.
    if (/^([-*_])\1{2,}$/.test(line)) {
      numbering = 0;
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      numbering = 0;
      const text = plain(bullet[1] ?? "");
      if (text) blocks.push({ kind: "bullet", text });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      const text = plain(numbered[1] ?? "");
      // 🔴 THE COUNT IS OURS, NOT THE MODEL'S. A model that writes "1. 2. 2. 4." would otherwise
      // print exactly that; renumbering means the list is always coherent on paper.
      if (text) blocks.push({ index: ++numbering, kind: "number", text });
      continue;
    }

    numbering = 0;
    const text = plain(line);
    if (text) blocks.push({ kind: "paragraph", text });
  }

  return blocks;
}
