// Pure text helpers for the Word/PowerPoint (OOXML) extractors. A .docx / .pptx file is a zip of
// XML; the zip is opened in ./office.ts (fflate I/O), but pulling readable text out of the XML is
// pure string work and lives here so it can be unit-tested without any binary fixtures. No imports.

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
 * buys nothing; tables (6%) keep their cell text through the run walk but are not
 * reconstructed as grids.
 *
 * `markBold: false` suppresses bold marking — see `slideBoldIsUniform`. PURE.
 */
export function pptxSlideXmlToMarkdown(slideXml: string, markBold = true): SlideMarkdown {
  let title: string | null = null;
  const lines: string[] = [];

  for (const shape of slideXml.match(SHAPE_RE) ?? []) {
    const isTitle = TITLE_PH_RE.test(shape);
    const paragraphs = paragraphsOf(shape, markBold);
    if (!paragraphs.length) continue;
    if (isTitle && title === null) {
      // The title placeholder is the slide's own heading; keep it unbulleted and
      // strip emphasis, since a heading that is entirely bold reads as noise.
      title = paragraphs.map((p) => p.text).join(" ").replace(/\*\*|(?<!\w)\*(?!\w)|<\/?u>/g, "").trim() || null;
      continue;
    }
    for (const p of paragraphs) lines.push(`${"  ".repeat(Math.min(p.level, 6))}- ${p.text}`);
  }
  return { title, body: collapseBlankLines(lines.join("\n")) };
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

export interface SlideMarkdown {
  title: string | null;
  body: string;
}

interface SlideParagraph {
  level: number;
  text: string;
}

// A shape that contains no nested shape — the same guard the notes reader uses, so a
// group shape does not swallow its children into one match.
//
// `p:graphicFrame` is here because a TABLE's cells are paragraphs inside a frame, not
// inside a `p:sp`, and walking shapes alone dropped them: measured at 937 characters
// across six real decks. Charts and SmartArt also sit in frames but hold no inline
// text — their words live in ppt/charts and ppt/diagrams and arrive through the
// slide's relationships — so nothing is double-counted by reading frames here.
const SHAPE_RE = /<p:sp>(?:(?!<p:sp>)[\s\S])*?<\/p:sp>|<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g;
const TITLE_PH_RE = /<p:ph\b[^>]*type="(?:ctrT|t)itle"/;
// Auto-fields that are chrome, not content: a slide number or date on every slide
// would otherwise add a junk bullet per slide. Other field types keep their text.
const CHROME_FIELD_RE = /<a:fld\b[^>]*type="(?:slidenum|datetime[^"]*)"[\s\S]*?<\/a:fld>/g;

function paragraphsOf(shapeXml: string, markBold: boolean): SlideParagraph[] {
  const cleaned = shapeXml.replace(CHROME_FIELD_RE, "");
  const out: SlideParagraph[] = [];
  for (const [, inner] of cleaned.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
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
  const segments: { text: string; bold: boolean; italic: boolean; underline: boolean }[] = [];
  for (const [, inner] of paragraphXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
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
