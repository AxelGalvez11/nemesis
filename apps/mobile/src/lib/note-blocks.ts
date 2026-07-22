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

  return { blocks, leading };
}

/** Exact inverse of splitBlocks. */
export function joinBlocks(nb: NoteBlocks): string {
  return nb.leading + nb.blocks.map((b) => b.body + b.gap).join("");
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
