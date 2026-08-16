/**
 * Typographic emphasis recovered from a source document.
 *
 * This is source evidence, not a judgment about learning value. A lecturer can bold a deadline,
 * an author can italicise a species name, and an examiner can highlight a governing constraint.
 * Consumers are entitled to see that the source did so; they are not entitled to conclude that
 * the marked text should automatically be taught first.
 */
export type DocEmphasisKind = "bold" | "italic" | "underline" | "highlight";

export interface DocEmphasis {
  /** The visible characters inside the marked run, with presentation syntax removed. */
  text: string;
  kind: DocEmphasisKind;
}

function visibleText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/(?:\*\*|__|==)(.+?)(?:\*\*|__|==)/g, "$1")
    .replace(/(?<![\p{L}\p{N}*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}*])/gu, "$2")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recover explicit Markdown/HTML emphasis without changing the text representation.
 *
 * Providers return a mixture of Markdown (`**important**`, `==highlighted==`) and small inline
 * HTML fragments (`<u>`, `<mark>`, `<strong>`). The canonical document keeps the visible text in
 * `DocBlock.text`; this function carries the formatting separately so a later plain-text renderer
 * cannot erase it. Repeated occurrences are retained because they are repeated source evidence.
 */
export function emphasisFromMarkup(markup: string): DocEmphasis[] {
  const found: Array<DocEmphasis & { at: number }> = [];
  const collect = (kind: DocEmphasisKind, pattern: RegExp) => {
    for (const match of markup.matchAll(pattern)) {
      const text = visibleText(match[1] ?? "");
      if (text) found.push({ at: match.index ?? 0, kind, text });
    }
  };

  collect("bold", /<strong\b[^>]*>([\s\S]*?)<\/strong>/gi);
  collect("bold", /<b\b[^>]*>([\s\S]*?)<\/b>/gi);
  collect("italic", /<em\b[^>]*>([\s\S]*?)<\/em>/gi);
  collect("italic", /<i\b[^>]*>([\s\S]*?)<\/i>/gi);
  collect("underline", /<u\b[^>]*>([\s\S]*?)<\/u>/gi);
  collect("highlight", /<mark\b[^>]*>([\s\S]*?)<\/mark>/gi);
  collect("highlight", /==([^=\n]+)==/g);
  collect("bold", /\*\*([^*\n]+)\*\*/g);
  collect("bold", /__([^_\n]+)__/g);
  collect("italic", /(?<![\p{L}\p{N}*])\*(?!\s|\*)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])/gu);
  collect("italic", /(?<![\p{L}\p{N}_])_(?!\s|_)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])/gu);

  return found
    .sort((a, b) => a.at - b.at)
    .map(({ kind, text }) => ({ kind, text }));
}
