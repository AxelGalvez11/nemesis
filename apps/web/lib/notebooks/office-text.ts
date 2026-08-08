// Pure text helpers for the Word/PowerPoint (OOXML) extractors. A .docx / .pptx file is a zip of
// XML; the zip is opened in ./office.ts (fflate I/O), but pulling readable text out of the XML is
// pure string work and lives here so it can be unit-tested without any binary fixtures.
//
// The only imports are the canonical model's own types and its ONE table renderer, plus the pure
// geometry in ./pptx-shapes. Both are as pure as this file; what they are not is a second copy of a
// rule that already exists — a slide table rendered here and a slide table rendered in the model
// would be two spellings of one grid, and which one a reader saw would depend on which field it
// happened to read.
import { tableToMarkdown, type DocRect, type DocTable } from "@nemesis/shared";

import { rectForShape, readGroups, type GroupSpan, type SlideGeometry } from "./pptx-shapes";

export interface OfficeExtract {
  title: string | null;
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode the XML entities OOXML uses — named (&amp; &lt; …) and numeric (&#65; &#x41;). PURE. */
export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/** Right-trim each line, collapse runs of 3+ newlines to a single blank line, trim the ends. PURE. */
export function collapseBlankLines(s: string): string {
  return s
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\r\n]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The first line of real content, ignoring the slide headings and bullet markers this
 * module itself adds. Used as the deck-title fallback when a deck has no title
 * placeholder at all: plain `firstLine` reads the assembled markdown, so on such a
 * deck it returned the literal string "## Slide 1" as the document's name. PURE.
 */
export function firstContentLine(markdown: string): string | null {
  const cleaned = markdown
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+Slide\s+\d+\s*:?\s*/, "")
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*[-*]\s+/, "")
        .replace(/\*\*|<\/?u>/g, ""),
    )
    .join("\n");
  return firstLine(cleaned);
}

/** The first non-empty, trimmed line (capped) — a best-effort document/deck title. PURE. */
export function firstLine(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 300) : null;
}

/** Pull readable text out of a Word `word/document.xml` body: paragraphs become newlines, tabs/breaks
 *  become whitespace, every remaining tag is dropped, entities decoded. PURE. */
export function docxXmlToText(documentXml: string): string {
  const withBreaks = documentXml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<w:cr\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return collapseBlankLines(decodeXmlEntities(stripped));
}

/** Pull readable text out of a single PowerPoint slide's XML: paragraphs become newlines, remaining
 *  tags dropped, entities decoded. PURE. */
export function pptxSlideXmlToText(slideXml: string): string {
  const withBreaks = slideXml
    .replace(/<a:tab\b[^>]*\/?>/g, "\t")
    .replace(/<a:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/a:p>/g, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return collapseBlankLines(decodeXmlEntities(stripped));
}

/**
 * A speaker-notes page, as text.
 *
 * Notes are where a lecturer writes what the slide does not say — the explanation,
 * the exam hint, the worked reasoning — and reading only ppt/slides/ missed every
 * word of it. Two things have to be removed first, or the notes arrive as noise:
 * the automatic slide-number field (a notes page whose entire content is "25"), and
 * the thumbnail placeholder that copies the slide's own body text back in. PURE.
 */
export function pptxNotesXmlToText(notesXml: string): string {
  const withoutFields = notesXml.replace(/<a:fld\b[\s\S]*?<\/a:fld>/g, "");
  // The <p:sp> whose placeholder type is "sldImg" is the slide thumbnail; anything
  // else on the page is the lecturer's own writing.
  const withoutThumbnail = withoutFields.replace(
    /<p:sp>(?:(?!<p:sp>)[\s\S])*?<p:ph\b[^>]*type="sldImg"[\s\S]*?<\/p:sp>/g,
    "",
  );
  const text = pptxSlideXmlToText(withoutThumbnail);
  // A page left holding only the slide number is not notes.
  return /^\d{1,4}$/.test(text.trim()) ? "" : text;
}

/**
 * The words on a chart: its title, axis titles, series names and category labels —
 * the parts stored as drawing text. The numeric series are deliberately NOT
 * included: a flashcard generator handed 24,000 characters of raw data points learns
 * nothing and loses the lecture in the noise. PURE.
 */
export function chartXmlToText(chartXml: string): string {
  const runs = [...chartXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1] ?? ""));
  const joined = runs.join(" ").replace(/\s+/g, " ").trim();
  return joined;
}

/** SmartArt (a "diagram" part): the text inside the shapes, which lives outside the
 *  slide entirely and so was invisible to slide-only extraction. PURE. */
export function diagramXmlToText(diagramXml: string): string {
  return pptxSlideXmlToText(diagramXml);
}

/**
 * A slide as Markdown, with the lecturer's emphasis intact.
 *
 * WHY THIS EXISTS ALONGSIDE pptxSlideXmlToText: that function ends in
 * `.replace(/<[^>]+>/g, "")`, which deletes every signal about what the lecturer
 * wanted looked at. Measured over 316 slides of a real course, the XML carries
 * bold on 61% of slides, a title placeholder on 63%, and indent levels on 31% —
 * all of it thrown away before the model saw a word, so a slide reading
 * "**know this mechanism**" arrived identical to the acknowledgements slide.
 *
 * Deliberately NOT handled: `<a:highlight>` appeared on 1 of 316 slides, so it
 * buys nothing.
 *
 * 🔴 A TABLE IS NOW A GRID, NOT A RUN OF BULLETS. Its cell text always survived
 * the run walk, and that was the problem: a dosing table or a grading rubric
 * arrived as a column of orphan lines, so a value sat under whatever line
 * happened to precede it and a chunk boundary could split a row down the middle.
 * That reads as prose and gets answered confidently and wrongly. The cells are
 * the same characters either way; what changes is that the column each one
 * belongs to survives. Measured over 23 real course decks: 65 tables, 951 cells.
 *
 * `geometry` is optional and additive. With it, each rendered line remembers the
 * box its shape occupied, which is what lets a citation say "this table on slide
 * 12" instead of only "slide 12". Without it every line simply has no rect.
 *
 * `markBold: false` suppresses bold marking — see `slideBoldIsUniform`. PURE.
 */
export function pptxSlideXmlToMarkdown(
  slideXml: string,
  markBold = true,
  geometry: SlideGeometry | null = null,
): SlideMarkdown {
  let title: string | null = null;
  let titleRect: DocRect | undefined;
  const lines: string[] = [];
  const facts: SlideBodyLine[] = [];
  const tables: DocTable[] = [];
  const groups: GroupSpan[] = geometry ? readGroups(slideXml) : [];

  for (const match of slideXml.matchAll(SHAPE_RE)) {
    const shape = match[0];
    const rect = rectForShape(shape, match.index, groups, geometry);

    // A frame only reaches this walk when it holds a table (see SHAPE_RE), so
    // this is the whole of the table path.
    if (shape.startsWith("<p:graphicFrame")) {
      const table = readSlideTable(shape, markBold);
      // An entirely empty grid contributed no lines before and contributes none
      // now: a table used purely for layout is furniture, not content.
      if (!table || table.rows.every((row) => row.every((cell) => !cell))) continue;
      const grid = tableToMarkdown(table);
      if (!grid) continue;
      const index = tables.push(table) - 1;
      grid.split("\n").forEach((line, at) => {
        lines.push(line);
        facts.push({ rect, table: index, tableStart: at === 0 });
      });
      continue;
    }

    const isTitle = TITLE_PH_RE.test(shape);
    const paragraphs = paragraphsOf(shape, markBold);
    if (!paragraphs.length) continue;
    if (isTitle && title === null) {
      // The title placeholder is the slide's own heading; keep it unbulleted and
      // strip emphasis, since a heading that is entirely bold reads as noise.
      title = paragraphs.map((p) => p.text).join(" ").replace(/\*\*|(?<!\w)\*(?!\w)|<\/?u>/g, "").trim() || null;
      if (title) titleRect = rect;
      continue;
    }
    for (const p of paragraphs) {
      lines.push(`${"  ".repeat(Math.min(p.level, 6))}- ${p.text}`);
      facts.push({ rect });
    }
  }

  const body = collapseBlankLines(lines.join("\n"));
  // 🔴 THE FACTS ARE INDEXED BY LINE, SO THEY MUST BE THE SAME LINES.
  // `collapseBlankLines` right-trims and drops blank runs; nothing pushed above
  // is blank or trailing, so the counts agree — and if some future change makes
  // them disagree, the honest answer is NO geometry rather than every rect
  // shifted by one, which would point every highlight at the shape above.
  const bodyLines = body.length ? body.split("\n") : [];
  return {
    body,
    lines: bodyLines.length === facts.length ? facts : bodyLines.map(() => ({})),
    tables,
    title,
    ...(titleRect ? { titleRect } : {}),
  };
}

/**
 * A slide table as a grid.
 *
 * 🔴 EVERY `<a:tc>` IS KEPT, INCLUDING THE ONES A MERGE COVERS. DrawingML writes
 * a cell for every grid position: the origin of a merge carries `gridSpan` /
 * `rowSpan` and the positions it swallows are written as empty `hMerge` /
 * `vMerge` cells. Dropping those would make rows different lengths and slide
 * every later value one column left — the exact mis-association the grid exists
 * to prevent. Keeping them makes every row exactly as wide as the table's
 * `<a:gridCol>` count. All 65 tables in the corpus are rectangular this way.
 *
 * 🔴 `headerRows` COMES ONLY FROM THE FILE. `<a:tblPr firstRow="1">` is
 * PowerPoint's own statement that the first band is headers — 63 of the 65
 * corpus tables state it. A table that does not say so reports 0, because
 * assuming "row 0 is a header" turns the first real data row into column names
 * and every answer drawn from the table inherits that mistake. `firstCol` is a
 * COLUMN band and has no field in `DocTable`; it is ignored rather than
 * mistranslated into a row count.
 */
export function readSlideTable(frameXml: string, markBold = true): DocTable | null {
  const table = /<a:tbl>[\s\S]*?<\/a:tbl>/.exec(frameXml)?.[0];
  if (!table) return null;
  const properties = /<a:tblPr\b[^>]*>/.exec(table)?.[0] ?? "";
  const rows: string[][] = [];
  for (const row of table.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(CELL_RE)) {
      // A cell's paragraphs are one value, not several: the grid's job is to
      // keep a value with its column, and a two-line cell is still one value.
      cells.push(paragraphsOf(cell[1] ?? "", markBold).map((p) => p.text).join(" ").trim());
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return null;
  return { headerRows: /\bfirstRow="(?:1|true)"/.test(properties) ? 1 : 0, rows };
}

/**
 * True when every run on the slide is bold — in which case bold is the body font,
 * not emphasis, and marking it would wrap the whole slide in `**` for no signal.
 * Emphasis is differential: it only means anything against unemphasised text. PURE.
 */
export function slideBoldIsUniform(slideXml: string): boolean {
  const runs = slideXml.match(/<a:rPr\b[^>]*>/g) ?? [];
  if (runs.length < 2) return false;
  return runs.every((rPr) => /\bb="(1|true)"/.test(rPr));
}

/** The title placeholder's text on a slide, or null. Used for the deck title, which
 *  otherwise comes from `firstLine` of a flat blob — on a real lecture that made the
 *  deck title the professor's name, because the name is the first line of slide 1. PURE. */
export function pptxSlideTitle(slideXml: string): string | null {
  return pptxSlideXmlToMarkdown(slideXml, false).title;
}

/** What one rendered body line remembers about where it came from. */
export interface SlideBodyLine {
  /** The box its shape occupied, unit-relative. Absent when the file did not
   *  state one and none could be inherited — never guessed. */
  rect?: DocRect;
  /** Index into `SlideMarkdown.tables` when this line is part of a grid. */
  table?: number;
  /** True on the first line of that grid — the line that becomes one block. */
  tableStart?: boolean;
}

/**
 * A deck's structure, aligned line-for-line with the deck's own slide text.
 *
 * 🔴 ALIGNED BY POSITION, ON PURPOSE. The alternative — hand the model the flat
 * text and have it match lines back to shapes — is how structure gets computed
 * and then lost at a boundary, and a cursor that slips has no failure signal: it
 * simply attaches the rect of the shape above. Here `lines[s][n]` describes line
 * `n` of slide `s` because they were built in the same pass, and the consumer
 * re-checks the line it is about to trust.
 */
export interface DeckStructure {
  /** The slide box in POINTS, matching the PDF lane's units, so a relative rect
   *  becomes a crop the same way for both. Null when the file states no size —
   *  in which case nothing here carries a rect either. */
  slideSize: { width: number; height: number } | null;
  /** Per slide, one entry per line of that slide's text. */
  lines: SlideBodyLine[][];
  /** Per slide, the grids that slide's lines index. */
  tables: DocTable[][];
  /** Per slide, the title placeholder's own box. */
  titleRects: (DocRect | undefined)[];
  /** Per slide, media entry name → its box, when that picture is placed once. */
  pictures: Map<string, DocRect>[];
}

export interface SlideMarkdown {
  title: string | null;
  body: string;
  /** One entry per line of `body`, in the same order and of the same length. */
  lines: SlideBodyLine[];
  /** The grids rendered into `body`, in order. `SlideBodyLine.table` indexes it. */
  tables: DocTable[];
  /** The title placeholder's own box, when it has or inherits one. */
  titleRect?: DocRect;
}

interface SlideParagraph {
  level: number;
  text: string;
}

// A shape that contains no nested shape — the same guard the notes reader uses, so a
// group shape does not swallow its children into one match.
//
// A TABLE's cells are paragraphs inside a `p:graphicFrame`, not inside a `p:sp`, so
// walking shapes alone dropped them — 38 distinct words on one real lecture.
//
// The frame must be matched ONLY when it holds a table. Charts and SmartArt sit in
// frames too, and they DO carry inline text: on a real 13-chart deck, matching every
// frame emitted that text a second time, once from the frame and once from the
// `[Chart: …]` block the slide's relationships already produce. Requiring `<a:tbl>`
// is what keeps the two paths disjoint.
const SHAPE_RE =
  /<p:sp>(?:(?!<p:sp>)[\s\S])*?<\/p:sp>|<p:graphicFrame>(?=(?:(?!<\/p:graphicFrame>)[\s\S])*?<a:tbl>)[\s\S]*?<\/p:graphicFrame>/g;
const TITLE_PH_RE = /<p:ph\b[^>]*type="(?:ctrT|t)itle"/;
// Auto-fields that are chrome, not content: a slide number or date on every slide
// would otherwise add a junk bullet per slide. Other field types keep their text.
const CHROME_FIELD_RE = /<a:fld\b[^>]*type="(?:slidenum|datetime[^"]*)"[\s\S]*?<\/a:fld>/g;
// A grid position. The self-closing form is a real cell too — an empty one — and
// dropping it would shorten the row and shift every value after it.
const CELL_RE = /<a:tc\b[^>]*?\/>|<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;

function paragraphsOf(shapeXml: string, markBold: boolean): SlideParagraph[] {
  const cleaned = shapeXml.replace(CHROME_FIELD_RE, "");
  const out: SlideParagraph[] = [];
  for (const match of cleaned.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const inner = match[1] ?? "";
    const level = Number(inner.match(/<a:pPr\b[^>]*\blvl="(\d+)"/)?.[1] ?? 0);
    const text = runsToMarkdown(inner, markBold);
    if (text) out.push({ level, text });
  }
  return out;
}

/**
 * One paragraph's runs, each wrapped in the markdown its run-properties call for.
 *
 * Adjacent runs that carry IDENTICAL formatting are merged before any marker is
 * emitted. PowerPoint splits a single word across runs constantly — a subscript, a
 * spell-check boundary, an edit — and marking each piece separately produced
 * `**C****max**` for "Cmax" on a real slide: four asterisks, which is not valid
 * emphasis, and a term no search or flashcard can match. Merging first yields
 * `**Cmax**`.
 */
function runsToMarkdown(paragraphXml: string, markBold: boolean): string {
  // A soft line break is a word boundary the lecturer typed. Runs are walked one by
  // one, so a bare <a:br/> between two of them would contribute no character at all
  // and the words either side would fuse — a real title came out as
  // "Lecture 4Intravascular Dosing Part I". Turning it into an unformatted space run
  // keeps the boundary without inventing a newline inside a bullet.
  const withBreaks = paragraphXml.replace(/<a:br\b[^>]*\/?>/g, "<a:r><a:t> </a:t></a:r>");
  const segments: { text: string; bold: boolean; italic: boolean; underline: boolean }[] = [];
  for (const match of withBreaks.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
    const inner = match[1] ?? "";
    const raw = inner.match(/<a:t>([\s\S]*?)<\/a:t>/)?.[1];
    if (raw === undefined) continue;
    const rPr = inner.match(/<a:rPr\b[^>]*>/)?.[0] ?? "";
    const seg = {
      text: decodeXmlEntities(raw),
      bold: markBold && /\bb="(1|true)"/.test(rPr),
      italic: /\bi="(1|true)"/.test(rPr),
      underline: /\bu="(?!none)/.test(rPr),
    };
    const prev = segments[segments.length - 1];
    if (prev && prev.bold === seg.bold && prev.italic === seg.italic && prev.underline === seg.underline) {
      prev.text += seg.text;
    } else {
      segments.push(seg);
    }
  }

  let out = "";
  for (const seg of segments) {
    const text = seg.text;
    // Markdown delimiters must hug the words: "** bold **" renders as literal
    // asterisks, so any surrounding space is carried outside the markers.
    const lead = text.match(/^\s*/)?.[0] ?? "";
    const tail = text.match(/\s*$/)?.[0] ?? "";
    const core = text.slice(lead.length, text.length - tail.length);
    if (!core) {
      out += text;
      continue;
    }
    let marked = core;
    if (seg.underline) marked = `<u>${marked}</u>`;
    if (seg.italic) marked = `*${marked}*`;
    if (seg.bold) marked = `**${marked}**`;
    out += `${lead}${marked}${tail}`;
  }
  // Runs are walked individually, so a <a:br/> between two of them contributes no
  // character of its own; collapsing horizontal whitespace keeps the join readable.
  return out.replace(/[^\S\r\n]+/g, " ").trim();
}

/** Keep only slide XML files, ordered by their real numeric index (slide2 before slide10). PURE. */
export function orderSlideFiles(names: string[]): string[] {
  return names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideIndex(a) - slideIndex(b));
}

function slideIndex(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}
