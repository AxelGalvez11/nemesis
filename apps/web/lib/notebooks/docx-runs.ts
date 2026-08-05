// One Word paragraph's worth of reading: the runs it is built from, the emphasis
// the author put on them, the pictures hanging off them — and, just as much of
// the job, THE TEXT THAT MUST NOT BE READ.
//
// Split out of ./docx-parse because it is the half that answers "what does this
// paragraph say"; that file answers "what is this paragraph, and where does it
// sit". Both halves needed to stay readable.
//
// 🔴 THREE THINGS ARE EXCLUDED, AND THE EXCLUSION IS THE POINT:
//   w:del / w:moveFrom   text the author DELETED. A flat tag strip reads a
//                        struck-out clause as though it survived — a false
//                        statement about the document, not a fidelity gap.
//   w:instrText          field instruction text ("PAGE \\* MERGEFORMAT",
//                        "TOC \\o …"), which no reader ever sees.
//   w:delInstrText       both at once.
// Everything else a wrapper can hold — a tracked INSERTION, a moved-to block, a
// smart tag, a content control — is text that IS in the document, and is read.
import { runFormatForStyle, type DocxNumbering, type DocxStyles } from "./docx-styles";
import { attr, child, childrenNamed, descendantsNamed, isElement, isOn, type XmlElement } from "./ooxml-tree";

/** How deep a walk will follow nesting before giving up. Word nests tables in
 *  cells and content controls in content controls; a hand-built file can nest
 *  them forever, and every walk here is bounded so that a document cannot take
 *  the route down with it. */
export const MAX_NESTING = 32;

export interface PendingVisual {
  /** Zip entry name, or null for a graphic drawn from shapes (a chart, a
   *  SmartArt frame) that no embedded-asset extractor could ever find. */
  entry: string | null;
  caption?: string;
  nearbyText?: string;
}

/** Everything the walk needs to resolve what it meets, plus a tally of what it
 *  refused — a parse that drops content silently cannot report honestly. */
export interface WalkContext {
  styles: DocxStyles;
  numbering: DocxNumbering;
  rels: Map<string, { target: string; external: boolean }>;
  footnotes: Map<string, string>;
  counts: { deletions: number; fieldInstructions: number; footnotesRead: number; paragraphs: number };
}

export interface ParagraphRead {
  text: string;
  visuals: PendingVisual[];
  footnotes: string[];
}

interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface RunState {
  segments: Segment[];
  visuals: PendingVisual[];
  footnotes: string[];
}

export function readParagraph(paragraph: XmlElement, ctx: WalkContext): ParagraphRead {
  const state: RunState = { footnotes: [], segments: [], visuals: [] };
  collectInline(paragraph, ctx, state, 0);
  return { footnotes: state.footnotes, text: emphasize(state.segments), visuals: state.visuals };
}

/** Everything inside a paragraph that contributes text, and nothing that does not. */
function collectInline(element: XmlElement, ctx: WalkContext, state: RunState, depth: number): void {
  if (depth > MAX_NESTING) return;
  for (const node of element.children) {
    if (!isElement(node)) continue;
    switch (node.name) {
      case "w:pPr":
      case "w:rPr":
      case "w:tblPr":
        break;
      case "w:del":
      case "w:moveFrom":
        ctx.counts.deletions += 1;
        break;
      case "w:r":
        collectRun(node, ctx, state);
        break;
      case "w:hyperlink": {
        const before = state.segments.length;
        collectInline(node, ctx, state, depth + 1);
        wrapLink(state, before, linkTarget(node, ctx));
        break;
      }
      case "w:fldSimple":
        // The instruction lives in the @w:instr ATTRIBUTE and is not text; the
        // children are the field's RESULT, which is what the reader sees.
        ctx.counts.fieldInstructions += 1;
        collectInline(node, ctx, state, depth + 1);
        break;
      case "w:sdt": {
        const content = child(node, "w:sdtContent");
        if (content) collectInline(content, ctx, state, depth + 1);
        break;
      }
      default:
        // w:ins, w:moveTo, w:smartTag, w:bookmarkStart and friends: transparent
        // wrappers around runs that ARE in the document.
        collectInline(node, ctx, state, depth + 1);
        break;
    }
  }
}

function collectRun(run: XmlElement, ctx: WalkContext, state: RunState): void {
  const rPr = child(run, "w:rPr");
  const inherited = runFormatForStyle(ctx.styles, attr(rPr ? child(rPr, "w:rStyle") : undefined, "w:val"));
  const boldEl = rPr ? child(rPr, "w:b") : undefined;
  const italicEl = rPr ? child(rPr, "w:i") : undefined;
  const underlineEl = rPr ? child(rPr, "w:u") : undefined;
  const format = {
    bold: boldEl ? isOn(boldEl) : (inherited.bold ?? false),
    italic: italicEl ? isOn(italicEl) : (inherited.italic ?? false),
    underline: underlineEl ? (attr(underlineEl, "w:val") ?? "single") !== "none" : (inherited.underline ?? false),
  };

  // Adjacent runs with identical formatting are merged HERE, before any marker
  // is written. Word splits a word across runs at every edit and spell-check
  // boundary, and marking each piece separately gives `**C****max**` for "Cmax":
  // not valid emphasis, and a term no search or flashcard can match.
  const push = (text: string): void => {
    if (!text) return;
    const previous = state.segments[state.segments.length - 1];
    if (
      previous &&
      previous.bold === format.bold &&
      previous.italic === format.italic &&
      previous.underline === format.underline
    ) {
      previous.text += text;
    } else {
      state.segments.push({ ...format, text });
    }
  };

  for (const node of run.children) {
    if (!isElement(node)) continue;
    switch (node.name) {
      case "w:t":
        push(textOf(node));
        break;
      case "w:tab":
        push("\t");
        break;
      case "w:br":
      case "w:cr":
        push("\n");
        break;
      case "w:noBreakHyphen":
        push("-");
        break;
      case "w:instrText":
        ctx.counts.fieldInstructions += 1;
        break;
      case "w:delText":
      case "w:delInstrText":
        ctx.counts.deletions += 1;
        break;
      case "w:drawing":
        state.visuals.push(...readDrawing(node, ctx));
        break;
      case "w:pict":
      case "w:object":
        state.visuals.push(...readLegacyPicture(node, ctx));
        break;
      case "w:footnoteReference": {
        const id = attr(node, "w:id");
        if (id) state.footnotes.push(id);
        break;
      }
      default:
        break;
    }
  }
}

/** The direct text children of an element, joined. */
export function textOf(element: XmlElement): string {
  let out = "";
  for (const node of element.children) if (!isElement(node)) out += node.text;
  return out;
}

/**
 * Segments turned into text with the author's emphasis marked.
 *
 * A marker must HUG its word: "** bold **" renders as literal asterisks, so any
 * surrounding space is carried outside the markers — the same rule
 * ./office-text applies to a slide, for the same measured reason. The logic is
 * not shared with that module because it reads a different namespace and owns
 * slide-specific chrome rules of its own.
 */
function emphasize(segments: readonly Segment[]): string {
  let out = "";
  for (const segment of segments) {
    const lead = /^\s*/.exec(segment.text)?.[0] ?? "";
    const tail = /\s*$/.exec(segment.text)?.[0] ?? "";
    const core = segment.text.slice(lead.length, segment.text.length - tail.length);
    if (!core) {
      out += segment.text;
      continue;
    }
    let marked = core;
    if (segment.underline) marked = `<u>${marked}</u>`;
    if (segment.italic) marked = `*${marked}*`;
    if (segment.bold) marked = `**${marked}**`;
    out += `${lead}${marked}${tail}`;
  }
  return out;
}

/** Wrap the segments a hyperlink produced in markdown, keeping its target. */
function wrapLink(state: RunState, from: number, target: string | undefined): void {
  const inner = state.segments.slice(from);
  if (!inner.length) return;
  const text = emphasize(inner).trim();
  state.segments.length = from;
  if (!text) return;
  // No target resolved: the words are still the document's, the destination is
  // simply not recorded. Inventing one would be provenance we do not have.
  state.segments.push({ bold: false, italic: false, text: target ? `[${text}](${target})` : text, underline: false });
}

function linkTarget(hyperlink: XmlElement, ctx: WalkContext): string | undefined {
  const relId = attr(hyperlink, "r:id");
  const anchor = attr(hyperlink, "w:anchor");
  const resolved = relId ? ctx.rels.get(relId)?.target : undefined;
  if (resolved && anchor) return `${resolved}#${anchor}`;
  if (resolved) return resolved;
  return anchor ? `#${anchor}` : undefined;
}

/** A modern `w:drawing`: one or more anchored/inline graphics. */
function readDrawing(drawing: XmlElement, ctx: WalkContext): PendingVisual[] {
  const out: PendingVisual[] = [];
  for (const container of [...childrenNamed(drawing, "wp:inline"), ...childrenNamed(drawing, "wp:anchor")]) {
    // wp:docPr@descr is alt text a PERSON typed. @name is Word's own
    // "Picture 3" and is not a caption.
    const descr = attr(child(container, "wp:docPr"), "descr")?.trim();
    const caption = descr ? { caption: descr } : {};
    const blip = [...descendantsNamed(container, "a:blip")][0];
    // A picture inserted as SVG leaves the outer blip empty and names the file
    // on a nested svgBlip — the same shape ./slide-media handles for a deck.
    const relId = blip
      ? (attr(blip, "r:embed") ??
        attr(blip, "r:link") ??
        attr([...descendantsNamed(blip, "asvg:svgBlip")][0], "r:embed"))
      : undefined;
    const target = relId ? ctx.rels.get(relId) : undefined;
    if (target && !target.external) {
      out.push({ entry: target.target, ...caption });
      continue;
    }
    // No stored bytes: a chart or a SmartArt frame, drawn from shapes. Recorded
    // so a later renderer knows there is something here to go and get.
    if ([...descendantsNamed(container, "a:graphicData")].length) out.push({ entry: null, ...caption });
  }
  return out;
}

/** The pre-2007 shape (`w:pict` / `w:object`), still emitted by converters. */
function readLegacyPicture(element: XmlElement, ctx: WalkContext): PendingVisual[] {
  const out: PendingVisual[] = [];
  for (const data of descendantsNamed(element, "v:imagedata")) {
    const relId = attr(data, "r:id");
    const target = relId ? ctx.rels.get(relId) : undefined;
    if (!target || target.external) continue;
    const alt = attr(data, "o:title")?.trim();
    out.push({ entry: target.target, ...(alt ? { caption: alt } : {}) });
  }
  return out;
}
