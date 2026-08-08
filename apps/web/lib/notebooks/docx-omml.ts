/**
 * Word's equations, read as structure instead of as a bag of characters.
 *
 * 🔴 THE OLD READ WAS NOT MERELY UNFORMATTED — IT WAS INVERTED.
 *
 * `paragraphText` already knew that equation characters live in `<m:t>` inside
 * `<m:oMath>` rather than in `<w:t>`, and pulled them out. But it CONCATENATED
 * them in document order, and OMML writes a fraction as numerator-then-
 * denominator with the division implied by the markup. So on a real file from
 * the owner's pharmacokinetics folder:
 *
 *     <m:f><m:num>C₀</m:num><m:den>2k</m:den></m:f>
 *     old:  "Co2k"        — reads as C₀ × 2k
 *     new:  "C_o/(2k)"    — reads as C₀ ÷ 2k
 *
 * A student revising from the old text learned the formula BACKWARDS, and
 * nothing in the output looked wrong: the characters were all present, in a
 * plausible order, with no marker of loss. That is the worst shape a defect can
 * take.
 *
 * 🔴 WHY A LINEAR TEXT FORM AND NOT LaTeX.
 * Both are unambiguous, and Docling chooses LaTeX (`\frac{C_{o}}{2k}`). This
 * emits `C_o/(2k)` instead, for three reasons that are about THIS product:
 *   1. Nothing in Nemesis renders LaTeX. A student reading the document, a
 *      flashcard, or a chat answer sees the raw string either way — and
 *      `\frac{C_{o}}{2k}` is harder to read than `C_o/(2k)`, not easier.
 *   2. Retrieval is over text. `C_o/(2k)` still contains the symbols a student
 *      would type; `\frac{...}{...}` spends most of its characters on markup
 *      that matches nothing anyone searches for.
 *   3. Backslashes and braces survive a markdown pipeline badly. A rendering
 *      that is silently mangled downstream is the same class of bug again.
 * The choice is confined to the `render` function below, so reversing it is a
 * change in one place.
 *
 * 🔴 NOTHING IS DROPPED TO MAKE THE OUTPUT PRETTIER. `m:subHide` and `m:degHide`
 * are deliberately ignored: an element that exists and holds text is rendered,
 * because losing a character to a display flag is exactly the failure this
 * module exists to end. A test asserts every `<m:t>` character survives.
 *
 * PURE. Strings in, a string out.
 */

import { decodeXmlEntities } from "./office-text";

/** One element of an OMML subtree. `#text` nodes carry `text` and no children. */
interface OmmlNode {
  /** The qualified name as written, e.g. `m:sSub`. */
  name: string;
  attrs: string;
  children: OmmlNode[];
  text?: string;
}

const TEXT = "#text";

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

/**
 * The index of the `>` closing the tag that starts at `open`.
 *
 * Quote-aware, because an attribute value may legitimately contain `>` — a
 * naive `indexOf(">")` truncates the tag and every name after it shifts.
 */
function endOfTag(xml: string, open: number): number {
  let quote = "";
  for (let i = open + 1; i < xml.length; i += 1) {
    const c = xml[i]!;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return xml.length - 1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where the element named `name`, already open, closes.
 *
 * Depth-counted rather than non-greedy: `<m:e>` nests inside `<m:e>` constantly
 * (a fraction inside a subscript inside a fraction), and a lazy match would end
 * the outer element at the first inner close — silently truncating everything
 * after it.
 */
function findClose(xml: string, name: string, from: number): { body: number; next: number } {
  const re = new RegExp(`<${escapeRe(name)}(?=[\\s/>])|</${escapeRe(name)}\\s*>`, "g");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return { body: m.index, next: m.index + m[0].length };
      re.lastIndex = m.index + m[0].length;
      continue;
    }
    const end = endOfTag(xml, m.index);
    if (xml[end - 1] !== "/") depth += 1;
    re.lastIndex = end + 1;
  }
  // Unterminated: treat the rest as the body rather than losing it.
  return { body: xml.length, next: xml.length };
}

/** The element nodes and text between `from` and `to`. */
function scan(xml: string, from: number, to: number): OmmlNode[] {
  const out: OmmlNode[] = [];
  const pushText = (raw: string) => {
    if (raw) out.push({ attrs: "", children: [], name: TEXT, text: decodeXmlEntities(raw) });
  };
  let i = from;
  while (i < to) {
    const lt = xml.indexOf("<", i);
    if (lt < 0 || lt >= to) {
      pushText(xml.slice(i, to));
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt));
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt);
      i = end < 0 ? to : end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      i = endOfTag(xml, lt) + 1;
      continue;
    }
    if (xml.startsWith("</", lt)) {
      i = endOfTag(xml, lt) + 1;
      continue;
    }
    const gt = endOfTag(xml, lt);
    const name = /^<([^\s/>]+)/.exec(xml.slice(lt, gt + 1))?.[1] ?? "";
    const attrs = xml.slice(lt + 1 + name.length, xml[gt - 1] === "/" ? gt - 1 : gt);
    if (!name) { i = gt + 1; continue; }
    if (xml[gt - 1] === "/") {
      out.push({ attrs, children: [], name });
      i = gt + 1;
      continue;
    }
    const close = findClose(xml, name, gt + 1);
    out.push({ attrs, children: scan(xml, gt + 1, close.body), name });
    i = close.next;
  }
  return out;
}

function attr(node: OmmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return new RegExp(`\\b${escapeRe(name)}="([^"]*)"`).exec(node.attrs)?.[1];
}

function child(node: OmmlNode, local: string): OmmlNode | undefined {
  return node.children.find((c) => localName(c.name) === local);
}

function childrenNamed(node: OmmlNode, local: string): OmmlNode[] {
  return node.children.filter((c) => localName(c.name) === local);
}

/** The `m:val` of a property element nested one level down, e.g. fPr > type. */
function propVal(node: OmmlNode, propLocal: string, valueLocal: string): string | undefined {
  const props = child(node, propLocal);
  return props ? attr(child(props, valueLocal), "m:val") : undefined;
}

// ── Bracketing ─────────────────────────────────────────────────────────────
//
// 🔴 THE BRACKETS ARE THE WHOLE FIX. `C_o/2k` is as wrong as `Co2k` — under any
// ordinary reading it is (C₀/2)·k. A denominator gets brackets whenever it is
// more than one character, and a numerator or base gets them whenever it
// contains anything that could bind differently.

/** A piece with no operator, space or division in it — safe to leave bare. */
const TIGHT = /^[\p{L}\p{N}.,_^]+$/u;

/** Already parenthesised as a whole, so a second pair would be noise. */
function wrapped(s: string): boolean {
  if (!s.startsWith("(") || !s.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0) return i === s.length - 1;
    }
  }
  return false;
}

/** A denominator or a script: bare only when it is a single character. */
function tightWrap(s: string): string {
  if (s.length <= 1 || wrapped(s)) return s;
  return `(${s})`;
}

/** A numerator or a base: bare unless it holds an operator or a space. */
function looseWrap(s: string): string {
  if (!s || TIGHT.test(s) || wrapped(s)) return s;
  return `(${s})`;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderAll(nodes: readonly OmmlNode[]): string {
  return nodes.map(render).join("");
}

function renderChild(node: OmmlNode, local: string): string {
  const found = child(node, local);
  return found ? renderAll(found.children) : "";
}

/**
 * One OMML node as linear text.
 *
 * The default case concatenates children, which is what the old reader did to
 * EVERYTHING. It is correct for the containers (`m:e`, `m:num`, a run) and it is
 * the reason an unknown construct degrades to the previous behaviour instead of
 * disappearing — but every construct that carries meaning in its SHAPE is listed
 * above it, because for those, concatenation is a lie.
 */
function render(node: OmmlNode): string {
  if (node.name === TEXT) return node.text ?? "";
  const tag = localName(node.name);

  // Property elements never hold content; they hold formatting. Skipping them by
  // shape rather than by name means a property this code has never heard of is
  // skipped too, instead of leaking a stray character into the equation.
  if (tag.endsWith("Pr")) return "";

  switch (tag) {
    case "f": {
      const num = renderChild(node, "num");
      const den = renderChild(node, "den");
      // A "no bar" fraction is a binomial coefficient stacked without a rule.
      // Rendering it as a division would invent an operation the author did not
      // write, which is the same class of error as gluing the two together.
      if (propVal(node, "fPr", "type") === "noBar") return `binom(${num}, ${den})`;
      if (!num && !den) return "";
      return `${looseWrap(num)}/${tightWrap(den)}`;
    }
    case "sSub":
      return `${looseWrap(renderChild(node, "e"))}_${tightWrap(renderChild(node, "sub"))}`;
    case "sSup":
      return `${looseWrap(renderChild(node, "e"))}^${tightWrap(renderChild(node, "sup"))}`;
    case "sSubSup":
      return (
        `${looseWrap(renderChild(node, "e"))}` +
        `_${tightWrap(renderChild(node, "sub"))}` +
        `^${tightWrap(renderChild(node, "sup"))}`
      );
    case "sPre": {
      // Pre-scripts sit BEFORE the base, e.g. ₙCₖ. Written after it they would
      // read as the base's own scripts and mean something else entirely.
      const sub = renderChild(node, "sub");
      const sup = renderChild(node, "sup");
      const base = renderChild(node, "e");
      return `${sub ? `_${tightWrap(sub)}` : ""}${sup ? `^${tightWrap(sup)}` : ""}${base}`;
    }
    case "rad": {
      const degree = renderChild(node, "deg");
      const body = renderChild(node, "e");
      return degree ? `root(${degree}, ${body})` : `sqrt(${body})`;
    }
    case "d": {
      // Word states the brackets it drew. An empty `m:begChr` means the author
      // asked for none — honoured, rather than substituted with a default.
      const props = child(node, "dPr");
      const begin = attr(props ? child(props, "begChr") : undefined, "m:val") ?? "(";
      const end = attr(props ? child(props, "endChr") : undefined, "m:val") ?? ")";
      const separator = attr(props ? child(props, "sepChr") : undefined, "m:val") ?? "|";
      const slots = childrenNamed(node, "e").map((e) => renderAll(e.children));
      return `${begin}${slots.join(separator)}${end}`;
    }
    case "nary": {
      // The operator itself lives in an ATTRIBUTE, so the old reader dropped
      // every sum and integral sign while keeping their limits — leaving the
      // bounds of an operation with no operation.
      const props = child(node, "naryPr");
      const operator = attr(props ? child(props, "chr") : undefined, "m:val") ?? "∫";
      const sub = renderChild(node, "sub");
      const sup = renderChild(node, "sup");
      const body = renderChild(node, "e");
      return (
        `${operator}${sub ? `_${tightWrap(sub)}` : ""}${sup ? `^${tightWrap(sup)}` : ""}` +
        `${body ? ` ${body}` : ""}`
      );
    }
    case "func":
      return `${renderChild(node, "fName")}(${renderChild(node, "e")})`;
    case "limLow":
      return `${renderChild(node, "e")}_${tightWrap(renderChild(node, "lim"))}`;
    case "limUpp":
      return `${renderChild(node, "e")}^${tightWrap(renderChild(node, "lim"))}`;
    case "bar":
      return `bar(${renderChild(node, "e")})`;
    case "acc": {
      // The accent is a combining mark, so it belongs AFTER the character it
      // sits on. Appending it keeps the string one grapheme per symbol.
      const props = child(node, "accPr");
      const mark = attr(props ? child(props, "chr") : undefined, "m:val") ?? "̂";
      return `${renderChild(node, "e")}${mark}`;
    }
    case "m":
      // A matrix, rows separated. Losing the row boundary would run the last
      // entry of one row into the first of the next.
      return `[${childrenNamed(node, "mr")
        .map((row) => childrenNamed(row, "e").map((e) => renderAll(e.children)).join(", "))
        .join("; ")}]`;
    case "eqArr":
      return childrenNamed(node, "e").map((e) => renderAll(e.children)).join("; ");
    default:
      return renderAll(node.children);
  }
}

/**
 * One `<m:oMath>` element (the whole tag, not its inside) as linear text.
 *
 * Whitespace inside math is presentational; the caller collapses runs of it
 * anyway, so this only trims the ends.
 */
export function renderOmml(omathXml: string): string {
  const nodes = scan(omathXml, 0, omathXml.length);
  return renderAll(nodes).replace(/\s+/g, " ").trim();
}

/**
 * Every `<m:oMath>` in `xml`, rendered, with the span each one occupied.
 *
 * The spans are what let `paragraphText` walk a paragraph ONCE and put the
 * equation exactly where it was written, instead of appending math to the end of
 * a sentence it belonged in the middle of.
 */
export function ommlSpans(xml: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const re = /<m:oMath(?=[\s/>])/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const gt = endOfTag(xml, m.index);
    if (xml[gt - 1] === "/") {
      out.push({ end: gt + 1, start: m.index, text: "" });
      re.lastIndex = gt + 1;
      continue;
    }
    const close = findClose(xml, "m:oMath", gt + 1);
    out.push({ end: close.next, start: m.index, text: renderOmml(xml.slice(m.index, close.next)) });
    re.lastIndex = close.next;
  }
  return out;
}
