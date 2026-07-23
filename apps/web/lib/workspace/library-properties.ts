// Obsidian-style note Properties: the YAML frontmatter block at the very top of
// a note (owner 2026-07-23, from help/properties).
//
// Properties ARE the frontmatter — there is no separate column and no schema
// change. A note round-trips through its own markdown, so a note written here
// opens correctly in Obsidian and vice versa.
//
// The load-bearing rule is that WRITES ARE SURGICAL. `yaml` is used to READ
// (it gets flow lists, quoting and anchors right), but every edit splices only
// the byte range it is changing and leaves the rest of the block verbatim.
// A parse-then-reserialize round trip is NOT safe: it silently drops comments,
// anchors and formatting — measured, `doc.toString() === source` is already
// false for a block as ordinary as `flow: [a, b]   # comment`. Real notes carry
// YAML this UI cannot model, and losing it would be losing the user's work.
//
// `---` is overloaded: the editor toolbar inserts one as a horizontal rule. A
// frontmatter block is ONLY a fence at offset 0 with a closing fence after it,
// so a divider in the body can never be mistaken for properties.

import { parseDocument, isMap, isPair, isSeq, isScalar } from "yaml";

/** The six types Obsidian supports. */
export type PropertyType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

export interface NoteProperty {
  key: string;
  type: PropertyType;
  value: unknown;
  /** Byte range of the VALUE within the whole note, for a surgical rewrite. */
  valueRange: [number, number];
  /** Byte range of this property's full source lines, for removal. */
  lineRange: [number, number];
}

export interface Frontmatter {
  present: boolean;
  /** Range of the whole block INCLUDING both fences and the trailing newline. */
  range: [number, number] | null;
  properties: NoteProperty[];
}

const EMPTY: Frontmatter = { present: false, range: null, properties: [] };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Locate the fences. Returns null unless the note OPENS with a complete block. */
function locateBlock(content: string): { innerFrom: number; innerTo: number; blockTo: number } | null {
  const opening = content.startsWith("---\r\n") ? 5 : content.startsWith("---\n") ? 4 : 0;
  if (opening === 0) return null;
  let cursor = opening;
  while (cursor <= content.length) {
    const lineEnd = content.indexOf("\n", cursor);
    const stop = lineEnd === -1 ? content.length : lineEnd;
    const line = content.slice(cursor, stop).replace(/\r$/, "");
    if (line === "---" || line === "...") {
      return { innerFrom: opening, innerTo: cursor, blockTo: lineEnd === -1 ? content.length : lineEnd + 1 };
    }
    if (lineEnd === -1) return null; // ran out of note without ever closing
    cursor = lineEnd + 1;
  }
  return null;
}

export function inferPropertyType(value: unknown): PropertyType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (value instanceof Date) {
    return value.toISOString().endsWith("T00:00:00.000Z") ? "date" : "datetime";
  }
  if (typeof value === "string") {
    if (DATE_ONLY.test(value)) return "date";
    if (DATE_TIME.test(value)) return "datetime";
  }
  return "text";
}

/** Start of the line containing `offset`. */
function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

/** End of the line containing `offset`, past its newline. */
function lineEnd(text: string, offset: number): number {
  const nl = text.indexOf("\n", offset);
  return nl === -1 ? text.length : nl + 1;
}

export function readFrontmatter(content: string): Frontmatter {
  const block = locateBlock(content);
  if (!block) return EMPTY;
  const inner = content.slice(block.innerFrom, block.innerTo);
  const doc = parseDocument(inner);
  const range: [number, number] = [0, block.blockTo];
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    // A malformed block still IS a block — we just cannot offer any properties
    // for it. Callers must not rewrite what they could not understand.
    return { present: true, range, properties: [] };
  }

  const pairs = doc.contents.items.filter(isPair);
  const properties: NoteProperty[] = [];
  pairs.forEach((pair, index) => {
    if (!isScalar(pair.key)) return;
    const key = String(pair.key.value);
    const keyStart = (pair.key.range?.[0] ?? 0) + block.innerFrom;

    const valueNode = pair.value;
    const rawValue = valueNode && typeof (valueNode as { toJSON?: unknown }).toJSON === "function"
      ? (valueNode as { toJSON: () => unknown }).toJSON()
      : null;

    // Where the value's own text sits, so editing it touches nothing else.
    const valueFrom = valueNode?.range ? valueNode.range[0] + block.innerFrom : lineEnd(content, keyStart) - 1;
    const valueTo = valueNode?.range ? valueNode.range[1] + block.innerFrom : valueFrom;

    // The property's full lines run to the next property's first line. Comment
    // lines immediately above that next key introduce IT, not this one, so they
    // are handed back rather than swallowed by a removal.
    const nextPair = pairs[index + 1];
    let stop = nextPair && isScalar(nextPair.key) && nextPair.key.range
      ? lineStart(content, nextPair.key.range[0] + block.innerFrom)
      : block.innerTo;
    while (stop > lineStart(content, keyStart)) {
      const prevStart = lineStart(content, stop - 1);
      const text = content.slice(prevStart, stop).trim();
      if (!text.startsWith("#")) break;
      stop = prevStart;
    }

    properties.push({
      key,
      type: inferPropertyType(rawValue),
      value: rawValue,
      valueRange: [valueFrom, valueTo],
      lineRange: [lineStart(content, keyStart), stop],
    });
  });

  return { present: true, range, properties };
}

/** Replace one property's value text, byte for byte. Unknown key → unchanged. */
export function setPropertyValue(content: string, key: string, raw: string): string {
  const property = readFrontmatter(content).properties.find((entry) => entry.key === key);
  if (!property) return content;
  const [from, to] = property.valueRange;
  return `${content.slice(0, from)}${raw}${content.slice(to)}`;
}

/** Add a property, or overwrite it when the key is already present. Creates the
 *  block when the note has none. */
export function addProperty(content: string, key: string, raw: string): string {
  const front = readFrontmatter(content);
  if (front.properties.some((entry) => entry.key === key)) return setPropertyValue(content, key, raw);

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  if (!front.present) {
    return `---${newline}${key}: ${raw}${newline}---${newline}${content}`;
  }
  const block = locateBlock(content)!;
  const line = `${key}: ${raw}${newline}`;
  return `${content.slice(0, block.innerTo)}${line}${content.slice(block.innerTo)}`;
}

/** Drop a property and every line it owns. Removing the last one takes the
 *  whole block, so a note is never left wearing an empty `---\n---` hat. */
export function removeProperty(content: string, key: string): string {
  const front = readFrontmatter(content);
  const property = front.properties.find((entry) => entry.key === key);
  if (!property) return content;
  if (front.properties.length === 1 && front.range) {
    return content.slice(front.range[1]);
  }
  const [from, to] = property.lineRange;
  return `${content.slice(0, from)}${content.slice(to)}`;
}
