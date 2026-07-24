// Pure block model for the phone note editor's live-preview mode (owner
// 2026-07-21: "markdown syntax is not shown unless cursor reveals it", like
// the web library editor). The phone can't run the web's CodeMirror — that's
// a browser engine, and adding a WebView is a native change that would orphan
// OTA updates — so the phone reveals syntax at BLOCK granularity instead:
// the note is split into blocks (paragraphs, headings, lists, tables, fenced
// code, frontmatter), every block renders as markdown, and only the block the
// cursor is in shows its raw source in a TextInput.
//
// The split is LOSSLESS: leading + Σ(body + gap) reproduces the document
// byte-for-byte, so entering and leaving edit mode can never rewrite a note
// the student didn't touch. No react-native imports — Deno-tests like the
// rest of src/lib.

export interface NoteBlock {
  /** The block's own lines — never contains a blank line (except inside a
   * fenced code block or frontmatter, which are captured whole). */
  body: string;
  /** The exact blank-line run between this block and the next (or the
   * document's trailing whitespace, for the last block). */
  gap: string;
}

export interface NoteBlocks {
  /** Blank lines before the first block (usually ""). */
  leading: string;
  blocks: NoteBlock[];
}

const FENCE_RE = /^(```|~~~)/;
// \r included so CRLF documents (web-app notes written on Windows, pasted
// text) still read a "blank" line as blank — the \r itself stays in the body
// bytes, so the lossless round-trip guarantee is unaffected.
const BLANK_RE = /^[ \t\r]*$/;

/** A line without its terminator, CRLF-tolerant — detection only; the raw
 * bytes (including any \r) always stay in the block body. */
const bareLine = (line: string) => line.replace(/\r?\n$/, "");

/** A line that could be part of a markdown table: it has a pipe in it. */
const isTableRow = (bare: string) => bare.includes("|") && bare.trim() !== "";

/** A table's second line — `|---|:--:|` and friends. This is the line that
 *  actually makes a table a table; a lone pipe is just punctuation. */
const DELIMITER_ROW = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** True when a TABLE starts at `index` — a row of cells followed immediately by
 *  a delimiter row. Both are required: "a | b" on its own is a sentence with a
 *  pipe in it, and treating it as a table would tear a paragraph in half. */
function isTableStart(lines: readonly string[], index: number): boolean {
  const first = bareLine(lines[index] ?? "");
  const second = bareLine(lines[index + 1] ?? "");
  return isTableRow(first) && isTableRow(second) && DELIMITER_ROW.test(second);
}

/** A line that is a COMPLETE markdown construct on its own: a heading, a list
 *  item, a task, a blockquote line. Each renders correctly in isolation, which
 *  is what makes it safe to reveal one without the others. */
const LINE_ORIENTED = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?)/;

/**
 * Split a finished block into ONE BLOCK PER LINE when every line stands alone.
 *
 * This is how far "markdown syntax should only be present when the cursor is
 * next to it" (owner 2026-07-24) can honestly be taken on a phone. React Native
 * has no way to render a text field whose displayed text differs from its
 * value — nested <Text> children can style characters but never omit them — so
 * hiding the `**` around one word while the caret sits three words away is not
 * possible without a WebView, which would orphan over-the-air updates. The only
 * real lever is how SMALL the revealed unit is.
 *
 * Block granularity made that unit far bigger than it needed to be: tapping one
 * item of a six-item list revealed all six items' dashes at once. A list is six
 * independent lines, so it becomes six units and only the tapped one shows its
 * marker.
 *
 * The guard is deliberately strict — EVERY line must stand alone. A list whose
 * items wrap onto continuation lines (which carry no marker of their own) stays
 * whole, because a continuation line rendered by itself would lose the item it
 * belongs to. Prose stays whole for the same reason.
 */
function splitLineOriented(block: NoteBlock): NoteBlock[] {
  const lines: string[] = [];
  for (let at = 0; at < block.body.length; ) {
    const nl = block.body.indexOf("\n", at);
    if (nl === -1) {
      lines.push(block.body.slice(at));
      break;
    }
    lines.push(block.body.slice(at, nl + 1));
    at = nl + 1;
  }
  if (lines.length < 2) return [block];
  if (!lines.every((line) => LINE_ORIENTED.test(bareLine(line)))) return [block];
  // The last line keeps the block's gap; the rest butt straight up against the
  // next, so joining still reproduces the document byte for byte.
  return lines.map((line, i) => ({ body: line, gap: i === lines.length - 1 ? block.gap : "" }));
}

/** Split markdown into blocks. Blank lines separate blocks; a fenced code
 * block (``` or ~~~) and a leading YAML frontmatter block (--- ... ---) are
 * each kept whole even though they may contain blank lines. */
export function splitBlocks(md: string): NoteBlocks {
  // Keep every line WITH its terminator so reassembly is exact. Split by hand
  // rather than a lookbehind regex — Hermes' regex engine has historically
  // lacked lookbehind, and a V8-only construct would pass Deno tests then
  // throw on the phone.
  const lines: string[] = [];
  for (let at = 0; at < md.length; ) {
    const nl = md.indexOf("\n", at);
    if (nl === -1) {
      lines.push(md.slice(at));
      break;
    }
    lines.push(md.slice(at, nl + 1));
    at = nl + 1;
  }
  const blocks: NoteBlock[] = [];
  let leading = "";
  let body: string[] = [];
  let gap: string[] = [];

  const isBlank = (line: string) => BLANK_RE.test(bareLine(line));

  const flush = () => {
    if (body.length === 0) {
      // Blank run with no block before it yet — that's the document's leading.
      if (blocks.length === 0) leading += gap.join("");
      else {
        const last = blocks[blocks.length - 1];
        blocks[blocks.length - 1] = { body: last.body, gap: last.gap + gap.join("") };
      }
    } else {
      blocks.push({ body: body.join(""), gap: gap.join("") });
    }
    body = [];
    gap = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const bare = bareLine(line);

    if (isBlank(line)) {
      gap.push(line);
      i += 1;
      continue;
    }
    // A non-blank line after a gap starts a new block.
    if (gap.length > 0) flush();

    // Frontmatter: only at the very start of the document.
    if (blocks.length === 0 && body.length === 0 && leading === "" && i === 0 && bare === "---") {
      body.push(line);
      i += 1;
      while (i < lines.length) {
        const inner = lines[i];
        body.push(inner);
        i += 1;
        if (bareLine(inner) === "---") break;
      }
      continue;
    }

    // A TABLE is its own block, even with no blank line around it.
    //
    // This is what makes the grid editor actually fire (owner 2026-07-24:
    // "table in editing mode should not show the markdown at all"). Blank lines
    // alone are not enough of a boundary, because nobody writes
    //
    //     ## Results
    //
    //     | drug | dose |
    //
    // — they write the heading directly above the table. That put the heading
    // and the table in ONE block, isTableBlock saw a leading "## Results" and
    // said no, and the whole thing opened as raw source: pipes, dashes and all.
    //
    // Ending the run at the last table-shaped line matters just as much, and
    // for a worse reason: parseTable treats every line after the delimiter as a
    // body row, so a sentence written under a table used to be absorbed INTO
    // it and rewritten as "| That is all. |  |" the moment the grid saved.
    if (isTableStart(lines, i)) {
      if (body.length > 0) {
        // Close the paragraph above the table without consuming a gap — the
        // table starts a new block right here, sharing no blank line.
        blocks.push({ body: body.join(""), gap: "" });
        body = [];
      }
      while (i < lines.length && isTableRow(bareLine(lines[i]))) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ body: body.join(""), gap: "" });
      body = [];
      continue;
    }

    // Fenced code: capture through the closing fence (or EOF).
    const fence = FENCE_RE.exec(bare);
    if (fence) {
      body.push(line);
      i += 1;
      while (i < lines.length) {
        const inner = lines[i];
        body.push(inner);
        i += 1;
        if (bareLine(inner).startsWith(fence[1])) break;
      }
      continue;
    }

    body.push(line);
    i += 1;
  }
  flush();

  // Headings, list items and quotes each become their own block — see
  // splitLineOriented for why, and for why prose does not.
  return { blocks: blocks.flatMap(splitLineOriented), leading };
}

/** Exact inverse of splitBlocks. */
export function joinBlocks(nb: NoteBlocks): string {
  return nb.leading + nb.blocks.map((b) => b.body + b.gap).join("");
}

/**
 * Merge block `index` into the one before it, returning the new document and
 * the caret offset (within the merged block) where the join happened.
 *
 * Backspace at the very start of a block is what needs this. With whole
 * paragraphs as blocks it was a rare thing to press; now that a list is one
 * block per item (see splitLineOriented) it is the ordinary way to join two
 * bullets, and doing nothing would read as a broken keyboard. The previous
 * block's own trailing newline is what gets eaten — that is the character the
 * caret is actually sitting behind.
 */
export function mergeBlockIntoPrevious(nb: NoteBlocks, index: number): { nb: NoteBlocks; caret: number } | null {
  if (index <= 0 || index >= nb.blocks.length) return null;
  const previous = nb.blocks[index - 1];
  const current = nb.blocks[index];
  // Only a gapless join is a real "these two lines are adjacent" merge. With a
  // blank line between them, backspace should delete that blank line first —
  // which the ordinary text field already does — not silently weld two
  // paragraphs the student deliberately separated.
  if (previous.gap !== "") return null;
  const head = previous.body.replace(/\r?\n$/, "");
  const merged = { body: head + current.body, gap: current.gap };
  return {
    caret: head.length,
    nb: { leading: nb.leading, blocks: [...nb.blocks.slice(0, index - 1), merged, ...nb.blocks.slice(index + 1)] },
  };
}

/** New NoteBlocks with block `index`'s body replaced (gap kept). Immutable. */
export function replaceBlockBody(nb: NoteBlocks, index: number, body: string): NoteBlocks {
  return {
    leading: nb.leading,
    blocks: nb.blocks.map((b, i) => (i === index ? { body, gap: b.gap } : b)),
  };
}

/** Character offset of block `index`'s body start within the joined document. */
export function blockStartOffset(nb: NoteBlocks, index: number): number {
  let offset = nb.leading.length;
  for (let i = 0; i < index && i < nb.blocks.length; i += 1) {
    offset += nb.blocks[i].body.length + nb.blocks[i].gap.length;
  }
  return offset;
}

/** Index of the block whose [start, start+body.length] span contains `offset`
 * (clamped to the last block). Used to re-find "the block I was editing"
 * after a normalize re-split shifted indices — e.g. typing a blank line into
 * a paragraph turns it into two blocks. */
export function blockIndexAtOffset(nb: NoteBlocks, offset: number): number {
  if (nb.blocks.length === 0) return 0;
  let at = nb.leading.length;
  for (let i = 0; i < nb.blocks.length; i += 1) {
    const end = at + nb.blocks[i].body.length;
    if (offset <= end) return i;
    at = end + nb.blocks[i].gap.length;
  }
  return nb.blocks.length - 1;
}

/** Append a fresh empty paragraph block (used by "tap below the last block to
 * keep writing"). Pads the previous block's gap up to a full blank line so
 * whatever gets typed into the new block really is a new block on re-split.
 * An appended block left empty simply vanishes at the next normalize — its
 * padding collapses into the previous block's gap. */
export function appendEmptyBlock(nb: NoteBlocks): NoteBlocks {
  if (nb.blocks.length === 0) {
    return { blocks: [{ body: "", gap: "" }], leading: nb.leading };
  }
  const last = nb.blocks[nb.blocks.length - 1];
  const tail = last.body + last.gap;
  const pad = tail.endsWith("\n\n") ? "" : tail.endsWith("\n") ? "\n" : "\n\n";
  const blocks = nb.blocks.map((b, i) => (i === nb.blocks.length - 1 ? { body: b.body, gap: b.gap + pad } : b));
  return { blocks: [...blocks, { body: "", gap: "" }], leading: nb.leading };
}
