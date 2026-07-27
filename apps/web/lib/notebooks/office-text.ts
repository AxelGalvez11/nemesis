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
