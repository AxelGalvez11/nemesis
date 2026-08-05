// What a Word paragraph's STYLE says about it: is it a heading, at what depth, and
// is it a list item.
//
// 🔴 THE STRUCTURAL SIGNAL COMES FIRST, THE ENGLISH ONE LAST. A Word style says
// "this is a heading" in two ways: `w:outlineLvl`, a number, which every built-in
// heading style carries in every localisation; and its name, which is "Heading 1"
// in English, "Überschrift 1" in German, "Titre 1" in French and whatever the
// author typed in a custom template. Matching on the name is a keyword list, and a
// keyword list never generalises — so the number is read first, the name only when
// there is no number to read.
//
// The other half of the job is INHERITANCE. A template that defines "Section
// Heading" as based on Heading2 stores the outline level once, on Heading2; the
// paragraph points at a style that says nothing at all. Resolving `w:basedOn` is
// what keeps that document from arriving as a flat wall of paragraphs.
import { attr, child, childrenNamed, firstPath, intAttr, isOn, parseXml, type XmlElement } from "./ooxml-tree";

export interface DocxStyle {
  id: string;
  type?: string;
  name?: string;
  basedOn?: string;
  /** 0–9. Word writes 9 for "body text": an outline level that explicitly says
   *  NOT a heading, which is why this is never read as depth 10. */
  outlineLvl?: number;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface DocxStyles {
  byId: Map<string, DocxStyle>;
}

export interface DocxNumbering {
  /** Whether word/numbering.xml was in the archive at all. */
  present: boolean;
  /** numId → abstractNumId. */
  nums: Map<string, string>;
  /** abstractNumId → (level → numFmt). */
  formats: Map<string, Map<number, string>>;
}

export const EMPTY_STYLES: DocxStyles = { byId: new Map() };
export const EMPTY_NUMBERING: DocxNumbering = { formats: new Map(), nums: new Map(), present: false };

/** Read word/styles.xml. A missing or unreadable part is not fatal — direct
 *  formatting still carries structure, and half a document beats none. */
export function readDocxStyles(xml: string | null): DocxStyles {
  const byId = new Map<string, DocxStyle>();
  const root = xml ? parseXml(xml) : null;
  if (!root) return { byId };

  for (const element of childrenNamed(root, "w:style")) {
    const id = attr(element, "w:styleId");
    if (!id) continue;
    const pPr = child(element, "w:pPr");
    const rPr = child(element, "w:rPr");
    const outline = pPr ? intAttr(child(pPr, "w:outlineLvl"), "w:val") : undefined;
    const numPr = pPr ? child(pPr, "w:numPr") : undefined;
    const style: DocxStyle = { id };
    const name = attr(child(element, "w:name"), "w:val");
    const basedOn = attr(child(element, "w:basedOn"), "w:val");
    const type = attr(element, "w:type");
    if (name) style.name = name;
    if (basedOn) style.basedOn = basedOn;
    if (type) style.type = type;
    if (outline !== undefined) style.outlineLvl = outline;
    if (numPr) {
      const numId = attr(child(numPr, "w:numId"), "w:val");
      const ilvl = intAttr(child(numPr, "w:ilvl"), "w:val");
      if (numId) style.numId = numId;
      if (ilvl !== undefined) style.ilvl = ilvl;
    }
    if (rPr) {
      if (child(rPr, "w:b")) style.bold = isOn(child(rPr, "w:b"));
      if (child(rPr, "w:i")) style.italic = isOn(child(rPr, "w:i"));
      const u = child(rPr, "w:u");
      if (u) style.underline = (attr(u, "w:val") ?? "single") !== "none";
    }
    byId.set(id, style);
  }
  return { byId };
}

/** Read word/numbering.xml: which numIds are real, and what each level looks like. */
export function readDocxNumbering(xml: string | null): DocxNumbering {
  const root = xml ? parseXml(xml) : null;
  if (!root) return EMPTY_NUMBERING;

  const nums = new Map<string, string>();
  for (const num of childrenNamed(root, "w:num")) {
    const numId = attr(num, "w:numId");
    const abstractId = attr(child(num, "w:abstractNumId"), "w:val");
    if (numId && abstractId) nums.set(numId, abstractId);
  }

  const formats = new Map<string, Map<number, string>>();
  for (const abstract of childrenNamed(root, "w:abstractNum")) {
    const abstractId = attr(abstract, "w:abstractNumId");
    if (!abstractId) continue;
    const levels = new Map<number, string>();
    for (const lvl of childrenNamed(abstract, "w:lvl")) {
      const level = intAttr(lvl, "w:ilvl");
      const format = attr(child(lvl, "w:numFmt"), "w:val");
      if (level !== undefined && format) levels.set(level, format);
    }
    formats.set(abstractId, levels);
  }

  return { formats, nums, present: true };
}

/**
 * Is a `w:numPr` a real list, or a paragraph that was taken OUT of one?
 *
 * numId 0 is Word's way of removing numbering from a paragraph that inherited it,
 * and a level whose format is "none" is a list with no marker — neither is a list
 * item, and treating them as one turns ordinary prose into bullets.
 */
export function isListNumbering(numbering: DocxNumbering, numId: string, level: number): boolean {
  if (numId === "0") return false;
  const abstractId = numbering.nums.get(numId);
  // A numId with no definition still means the author applied a list to this
  // paragraph; the definition being missing is the file's problem, not a reason
  // to demote the paragraph.
  if (abstractId === undefined) return true;
  return numbering.formats.get(abstractId)?.get(level) !== "none";
}

/**
 * Heading depth (1–9) for a style, or null when the style is not a heading.
 *
 * Order matters and is the point: the paragraph's own outline level, then the one
 * it inherits, then — only if nothing structural said anything — the style's id or
 * name. See the file header for why the name goes last.
 */
export function headingDepthForStyle(styles: DocxStyles, styleId: string | undefined): number | null {
  if (!styleId) return null;
  for (const style of styleChain(styles, styleId)) {
    if (style.outlineLvl !== undefined) return outlineDepth(style.outlineLvl);
  }
  for (const style of styleChain(styles, styleId)) {
    const depth = headingNumberIn(style.id) ?? headingNumberIn(style.name ?? "");
    if (depth) return depth;
  }
  // A style the document never defined: its id is all there is to go on.
  return styles.byId.has(styleId) ? null : headingNumberIn(styleId);
}

/** An outline level as a heading depth, or null for Word's "body text" level. */
export function outlineDepth(outlineLvl: number): number | null {
  return outlineLvl >= 0 && outlineLvl <= 8 ? outlineLvl + 1 : null;
}

/** The list a style puts its paragraphs in, if any. */
export function numberingForStyle(
  styles: DocxStyles,
  styleId: string | undefined,
): { numId: string; ilvl: number } | undefined {
  if (!styleId) return undefined;
  for (const style of styleChain(styles, styleId)) {
    if (style.numId !== undefined) return { ilvl: style.ilvl ?? 0, numId: style.numId };
  }
  return undefined;
}

/**
 * Bold/italic/underline a CHARACTER style carries.
 *
 * Deliberately not consulted for paragraph styles. A Heading 1 is bold by
 * definition, and marking its text bold would say "the author emphasised this"
 * when the author only used a heading — the same reasoning that makes
 * ./office-text drop bold on a slide that is bold throughout. Emphasis is
 * differential; it means nothing when everything has it.
 */
export function runFormatForStyle(
  styles: DocxStyles,
  styleId: string | undefined,
): { bold?: boolean; italic?: boolean; underline?: boolean } {
  const out: { bold?: boolean; italic?: boolean; underline?: boolean } = {};
  if (!styleId) return out;
  for (const style of styleChain(styles, styleId)) {
    if (out.bold === undefined && style.bold !== undefined) out.bold = style.bold;
    if (out.italic === undefined && style.italic !== undefined) out.italic = style.italic;
    if (out.underline === undefined && style.underline !== undefined) out.underline = style.underline;
  }
  return out;
}

/** A style and everything it is based on, nearest first. Cycle-guarded: a
 *  hand-edited template can point a style at itself. */
export function* styleChain(styles: DocxStyles, styleId: string): Generator<DocxStyle> {
  const seen = new Set<string>();
  let current: string | undefined = styleId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const style = styles.byId.get(current);
    if (!style) return;
    yield style;
    current = style.basedOn;
  }
}

/** The English-shaped last resort: "Heading3", "heading 3", "Heading_3". */
function headingNumberIn(text: string): number | null {
  const match = /heading[\s_-]*([1-9])\b/i.exec(text);
  const depth = match?.[1];
  return depth ? Number(depth) : null;
}

/** The paragraph's OWN outline level, which overrides whatever its style says. */
export function directOutlineLevel(paragraph: XmlElement): number | undefined {
  return intAttr(firstPath(paragraph, "w:pPr", "w:outlineLvl"), "w:val");
}
