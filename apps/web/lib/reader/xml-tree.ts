// A very small XML reader, used to walk the inside of .docx and .pptx files.
//
// Why not the browser's DOMParser: this has to be unit-testable, and the test
// runner is plain Node with no DOM. Why not a library: the whole job is 80
// lines, OOXML is always well-formed (it is machine-written), and a dependency
// that parses untrusted markup is a bigger surface than the problem.
//
// Why not regular expressions, which is what the existing server-side
// extractors use: a regex can find text but it cannot tell you that this
// paragraph is inside that table cell — and structure is the entire point of
// the reader. `docs/document-intelligence.md` lists "DOCX structure entirely"
// as a FATAL loss caused by exactly that shortcut.
//
// Deliberately not supported, because OOXML never uses them: DTDs, entities
// beyond the five predefined ones, processing instructions with markup inside,
// and namespace resolution (tag names are kept with their prefix, which is what
// callers match on anyway).

export interface XmlElement {
  /** Tag name with its prefix, e.g. "w:p". */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Where this element's OPEN tag sits in the string that was parsed, half-open. See `XmlText`. */
  open: Span;
}

/**
 * Text, and where it came from.
 *
 * 🔴🔴 THE OFFSETS ARE WHAT MAKE AN EDIT SURGICAL. A .pptx is a zip of XML parts, one per slide, so
 * changing a line on slide 4 is a change to a few characters inside `ppt/slides/slide4.xml` and
 * nothing else. Knowing WHERE those characters are means an edit can be a splice into the original
 * string: every byte outside it is carried across untouched, including the parts of the file this
 * reader never understood. Re-serialising the tree instead would put every attribute, namespace and
 * whitespace decision in the file at the mercy of this 150-line parser — a bug there would corrupt
 * a document rather than damage a sentence.
 *
 * `start`/`end` bracket the RAW text, before entities were decoded, which is the form a splice has
 * to write back.
 */
export interface XmlText {
  text: string;
  start: number;
  end: number;
}

export interface Span {
  start: number;
  end: number;
}

export type XmlNode = XmlElement | XmlText;

export function isElement(node: XmlNode): node is XmlElement {
  return "name" in node;
}

export function isText(node: XmlNode): node is XmlText {
  return !("name" in node);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g)) {
    const name = match[1] ?? match[3];
    const value = match[2] ?? match[4] ?? "";
    if (name) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/** Parse a whole XML document into a tree. Returns null when there is no root
 *  element — a truncated or non-XML part, which callers treat as "this part
 *  isn't there" rather than as an error. */
export function parseXml(xml: string): XmlElement | null {
  const root: XmlElement = { name: "#document", attrs: {}, children: [], open: { start: 0, end: 0 } };
  const stack: XmlElement[] = [root];
  const tagPattern = /<(\/)?([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>/g;
  let cursor = 0;

  for (let match = tagPattern.exec(xml); match !== null; match = tagPattern.exec(xml)) {
    const parent = stack[stack.length - 1] ?? root;
    if (match.index > cursor) {
      const text = xml.slice(cursor, match.index);
      if (text) parent.children.push({ text: decodeEntities(text), start: cursor, end: match.index });
    }
    const tagStart = match.index;
    cursor = match.index + match[0].length;

    const cdata = match[5];
    if (cdata !== undefined) {
      // The span is the payload, not the wrapper: a splice writes between the markers.
      const open = match[0].indexOf("[CDATA[") + "[CDATA[".length + tagStart;
      parent.children.push({ text: cdata, start: open, end: open + cdata.length });
      continue;
    }
    const name = match[2];
    if (name === undefined) continue; // a comment, PI or doctype

    if (match[1]) {
      // A closing tag: unwind to it, tolerating the odd unmatched tag rather
      // than throwing away the rest of a document that is 99% readable.
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]?.name === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const element: XmlElement = { name, attrs: parseAttrs(match[3] ?? ""), children: [], open: { start: tagStart, end: cursor } };
    parent.children.push(element);
    if (!match[4]) stack.push(element);
  }

  if (cursor < xml.length) {
    const tail = xml.slice(cursor);
    if (tail.trim()) (stack[stack.length - 1] ?? root).children.push({ text: decodeEntities(tail), start: cursor, end: xml.length });
  }

  return root.children.find(isElement) ?? null;
}

/** Direct children with this tag name. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((node): node is XmlElement => isElement(node) && node.name === name);
}

/** The first descendant with this tag name, at any depth. */
export function firstNamed(element: XmlElement, name: string): XmlElement | null {
  for (const node of element.children) {
    if (!isElement(node)) continue;
    if (node.name === name) return node;
    const found = firstNamed(node, name);
    if (found) return found;
  }
  return null;
}

/** Every descendant with this tag name, in document order. */
export function allNamed(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (child.name === name) found.push(child);
      walk(child);
    }
  };
  walk(element);
  return found;
}

/** All text inside an element, concatenated in document order. */
export function textOf(element: XmlElement): string {
  let text = "";
  const walk = (node: XmlNode): void => {
    if (!isElement(node)) {
      text += node.text;
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(element);
  return text;
}
