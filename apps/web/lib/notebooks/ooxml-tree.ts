// A tiny XML reader for the OOXML parts a Word file is made of.
//
// WHY THIS EXISTS ALONGSIDE ./office-text: that module pulls text out of OOXML
// with regular expressions, and for a PowerPoint slide that is exactly right — a
// slide is a flat list of shapes, and a run is a run. A Word document is not
// flat. A table sits inside a cell sits inside a table; a tracked deletion wraps
// runs that must NOT be read; a field wraps instruction text that must not be
// read either. Asking "is this run inside a w:del?" with a regex means guessing
// at nesting, and guessing at nesting is precisely how the flat tag strip in
// ./office-text ends up letting deleted text and field codes into a document.
//
// So: one pass into a tree, and the walker asks structural questions of the tree.
// This is a reader for files Word itself wrote, not a general XML processor —
// there is no validation, no namespace resolution (OOXML prefixes are fixed in
// practice), and no DTD. PURE: a string in, a tree out.
import { decodeXmlEntities } from "./office-text";

/**
 * Most nodes one part may expand to.
 *
 * ./office.ts caps what comes OUT of the zip at 400 MB, which stops a zip bomb
 * but not a single pathological part: a few megabytes of `<a><a><a>…` is a
 * legitimate-looking entry that becomes tens of millions of objects. The ceiling
 * is far above any real document — a 300-page Word file with tracked changes
 * runs to a few hundred thousand nodes.
 */
export const XML_MAX_NODES = 2_000_000;

export interface XmlElement {
  /** The qualified name exactly as written, e.g. "w:p". */
  name: string;
  attrs: Readonly<Record<string, string>>;
  children: XmlNode[];
}

export interface XmlText {
  text: string;
}

export type XmlNode = XmlElement | XmlText;

export function isElement(node: XmlNode): node is XmlElement {
  return "name" in node;
}

/**
 * Parse one OOXML part into a tree, or null when it holds no element at all.
 *
 * Iterative on purpose — every walk in this file uses an explicit stack, because
 * a hostile (or merely deep) document must not be able to overflow the call
 * stack of the route that opened it.
 */
export function parseXml(xml: string): XmlElement | null {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let nodes = 0;
  let i = 0;

  const pushText = (raw: string): void => {
    const parent = stack[stack.length - 1];
    if (!parent) return;
    // Whitespace between elements is layout, not content — except inside a text
    // element, where a lone space IS the document's own word boundary. Word
    // writes `<w:t xml:space="preserve"> </w:t>` between two emphasised words,
    // and dropping it fuses them.
    if (!raw.trim() && !isTextElement(parent.name)) return;
    nodes += 1;
    if (nodes > XML_MAX_NODES) throw new Error("That document is too complex to open safely.");
    parent.children.push({ text: decodeXmlEntities(raw) });
  };

  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      pushText(xml.slice(i));
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt));

    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt);
      const body = xml.slice(lt + 9, end < 0 ? xml.length : end);
      const parent = stack[stack.length - 1];
      // CDATA is literal: it carries no entities to decode.
      if (parent && (body.trim() || isTextElement(parent.name))) parent.children.push({ text: body });
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    // Declarations and processing instructions carry nothing this reader wants.
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt);
      i = end < 0 ? xml.length : end + 1;
      continue;
    }

    const gt = tagEnd(xml, lt);
    if (gt < 0) break;
    const raw = xml.slice(lt + 1, gt);
    i = gt + 1;

    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      // Pop to the matching open tag rather than assuming the top of the stack
      // is it. A part with one unclosed element should lose that element, not
      // every element after it.
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k]?.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameEnd = body.search(/[\s/]/);
    const name = (nameEnd < 0 ? body : body.slice(0, nameEnd)).trim();
    if (!name) continue;

    nodes += 1;
    if (nodes > XML_MAX_NODES) throw new Error("That document is too complex to open safely.");
    const element: XmlElement = {
      attrs: nameEnd < 0 ? {} : readAttrs(body.slice(nameEnd)),
      children: [],
      name,
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else root ??= element;
    if (!selfClosing) stack.push(element);
  }

  return root;
}

/** Direct child elements with this qualified name, in document order. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const node of element.children) if (isElement(node) && node.name === name) out.push(node);
  return out;
}

/** The first direct child with this name, or undefined. */
export function child(element: XmlElement, name: string): XmlElement | undefined {
  for (const node of element.children) if (isElement(node) && node.name === name) return node;
  return undefined;
}

/** Follow a chain of first-children, e.g. firstPath(p, "w:pPr", "w:numPr", "w:ilvl"). */
export function firstPath(element: XmlElement, ...names: string[]): XmlElement | undefined {
  let current: XmlElement | undefined = element;
  for (const name of names) {
    if (!current) return undefined;
    current = child(current, name);
  }
  return current;
}

export function attr(element: XmlElement | undefined, name: string): string | undefined {
  return element?.attrs[name];
}

/** Every descendant with this name, in document order. Iterative — see parseXml. */
export function* descendantsNamed(element: XmlElement, name: string): Generator<XmlElement> {
  const stack: XmlNode[] = [...element.children].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (!node || !isElement(node)) continue;
    if (node.name === name) yield node;
    for (let k = node.children.length - 1; k >= 0; k -= 1) {
      const kid = node.children[k];
      if (kid) stack.push(kid);
    }
  }
}

/**
 * An OOXML on/off attribute. `<w:b/>` means bold; `<w:b w:val="0"/>` means the
 * style said bold and this run turns it back off. Reading only for the element's
 * presence is what makes "not bold" text arrive bold inside a bold style.
 */
export function isOn(element: XmlElement | undefined): boolean {
  if (!element) return false;
  const value = element.attrs["w:val"];
  if (value === undefined) return true;
  return value !== "0" && value !== "false" && value !== "off";
}

/** An integer attribute, or undefined when absent or unparseable. */
export function intAttr(element: XmlElement | undefined, name: string): number | undefined {
  const raw = element?.attrs[name];
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

/** Elements whose text content is content even when it is only whitespace. */
function isTextElement(name: string): boolean {
  return (
    name.endsWith(":t") || name === "w:instrText" || name === "w:delText" || name === "w:delInstrText" || name === "t"
  );
}

/** The `>` that closes the tag opened at `lt`, skipping any inside quoted values.
 *  XML allows a bare `>` in an attribute value, and Word writes alt text verbatim. */
function tagEnd(xml: string, lt: number): number {
  let quote = "";
  for (let k = lt + 1; k < xml.length; k += 1) {
    const ch = xml[k];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return k;
  }
  return -1;
}

const ATTR_RE = /([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function readAttrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1];
    if (!name) continue;
    out[name] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return out;
}
