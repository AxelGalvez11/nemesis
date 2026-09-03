// An event's description, as something a plain text box can show.
//
// 🔴🔴 THE BOX WAS PRINTING TAGS. Owner's own screenshot, 2026-09-03: the
// description field of a real event read `<p>Bench 4x6-8; pull-ups 4 submaximal
// sets; …</p>`, literally, angle brackets and all. Google Calendar's
// `description` is an HTML field — that is its documented type — and this editor
// hands it straight to a `<textarea>`, which shows text and nothing else. Every
// event that arrived from Google looked broken.
//
// 🔴 CONVERTING IS ONLY HALF THE FIX, AND THE OTHER HALF IS NOT CONVERTING. If
// the editor turned the HTML into text and then saved the text, opening a Google
// event and pressing Save without touching anything would quietly strip its
// links and line breaks. The caller keeps the ORIGINAL and only writes plain
// text once the visible text has actually changed — see `event-dialogs.tsx`.
//
// PURE, so what a description looks like is a test rather than something only
// observable by opening somebody's calendar.

/** The handful of entities a calendar description actually carries. */
const NAMED: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (/^#x/i.test(body)) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * A description as readable text.
 *
 * 🔴 A VALUE WITH NO TAG COMES BACK UNTOUCHED, and that is not an optimisation.
 * Most descriptions are plain text somebody typed here, and a stray `&` or `<`
 * in one of those is a character, not markup — decoding it would turn
 * "R&D at 3 < 4 people" into something the learner never wrote.
 */
export function noteToText(value: string): string {
  if (!/<[a-z/!]/i.test(value)) return value;
  return decodeEntities(
    value
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      // A list item keeps its bullet; every other block boundary is a line break.
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>/gi, "\n")
      // 🔴 `li` IS NOT IN THIS LIST, and leaving it in was a real bug my own
      // test caught: `<li>` already opens a line, so closing one too put a
      // blank line between every bullet — and TWO newlines slip under the
      // three-or-more collapse below.
      .replace(/<\/(p|div|tr|h[1-6]|ul|ol|blockquote)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    // Three or more breaks is a gap somebody meant as one blank line.
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
