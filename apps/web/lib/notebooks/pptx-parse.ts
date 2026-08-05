// A PowerPoint deck as a ParsedDocument: one unit per slide, everything else
// hung off the slide it was measured on.
//
// This is the SAME reading ./office.ts already does — its parts walk, its
// per-slide relationship resolution, its emphasis handling, its picture plan —
// answering in the normalized shape instead of in one blob of markdown. Nothing
// here re-implements those decisions; they were measured against a real 121-deck
// corpus and re-deriving them would only produce a second, worse answer.
//
// What IS new:
//   • a slide table becomes a real DocTable with gridSpan/rowSpan, instead of
//     collapsing into bullets the way the flat markdown path leaves it;
//   • a chart or a piece of SmartArt becomes a DocVisual marked `composited`,
//     because it is drawn from shapes and no embedded-asset extractor could ever
//     find it — a later renderer needs to know to go and rasterise it;
//   • speaker notes get their own block kind instead of a "[Speaker notes: …]"
//     prefix a consumer would have to parse back out.
//
// 🔴 EVERY LOCATOR HERE IS MEASURED. A slide's index is the number in its own
// part name, exactly as ./slide-media numbers it, so a picture's `alsoAt` list
// and its unit agree. KNOWN LIMITATION, recorded rather than guessed at: true
// presentation order lives in `p:sldIdLst`, not in the file names, so a deck
// whose slides were reordered without being rewritten will cite the authored
// number. Diverging from ./slide-media to fix that would be worse — the two
// would disagree about which slide a picture is on.
import { strFromU8 } from "fflate";

import { unzipBounded } from "./office";
import {
  chartXmlToText,
  decodeXmlEntities,
  diagramXmlToText,
  orderSlideFiles,
  pptxNotesXmlToText,
  pptxSlideXmlToMarkdown,
  slideBoldIsUniform,
} from "./office-text";
import { readMediaParts, sha256Hex, visualRole } from "./ooxml-media";
import { embeddedRelIds, parseSlideRels, planSlideMedia, slideNumber, type MediaFact } from "./slide-media";
import type {
  DocBlock,
  DocCell,
  DocTable,
  DocUnit,
  DocVisual,
  DocumentParser,
  Locator,
  ParsedDocument,
} from "@nemesis/shared";

/** Bump when the extraction changes: a new value means a NEW parse row, so old
 *  parses stay reproducible rather than being silently reinterpreted. */
export const PPTX_PARSER_VERSION = "pptx@1";

export interface PptxParse {
  doc: ParsedDocument;
  /**
   * Visual id → bytes worth sending to a reader, for the pictures ./slide-media
   * planned to read. Keyed by DocVisual.id (the zip entry name), so a caller
   * stores them and writes the storage path back onto the visual.
   *
   * Deliberately a SUBSET of `doc.visuals`: the structure records every picture
   * that is on a slide, while the plan decides which are worth paying to look
   * at. A picture with no entry here was found and located, not lost.
   */
  imageBytes: Map<string, Uint8Array>;
}

/** Open a .pptx and return it in the normalized shape. Throws on a file that is
 *  not a deck (the route turns that into a friendly error). */
export function parsePptx(bytes: Uint8Array, _fileName?: string): PptxParse {
  const files = unzipBounded(bytes);
  const slideNames = orderSlideFiles(Object.keys(files));
  if (!slideNames.length) throw new Error("That doesn't look like a PowerPoint (.pptx) file.");

  const read = (name: string): string | null => {
    const data = files[name];
    return data ? strFromU8(data) : null;
  };

  const slideXml = new Map<string, string>();
  const relsXml = new Map<string, string>();
  const locators = new Map<number, Locator>();
  const slides: SlideRead[] = [];
  let deckTitle: string | null = null;
  let notesPages = 0;
  let charts = 0;
  let diagrams = 0;

  for (const name of slideNames) {
    const xml = read(name);
    if (xml === null) continue;
    const index = slideNumber(name);
    slideXml.set(name, xml);

    const relsName = `ppt/slides/_rels/${name.split("/").pop()}.rels`;
    const rels = read(relsName);
    if (rels) relsXml.set(relsName, rels);
    const targets = rels ? parseSlideRels(rels) : new Map<string, string>();

    // Bold marking is switched off for a slide that is bold throughout, where
    // bold is the body font rather than a signal — the same test ./office.ts
    // applies, on the same (unstripped) XML.
    const markBold = !slideBoldIsUniform(xml);
    const frames = xml.match(TABLE_FRAME_RE) ?? [];
    // The table frames come OUT before the bullets are read. ./office-text's
    // shape walk deliberately includes a graphicFrame holding an <a:tbl> so its
    // cell text is not lost from the flat path; here the same cells become a
    // real grid, and leaving them in would emit every cell twice.
    const withoutTables = xml.replace(TABLE_FRAME_RE, "");
    const md = pptxSlideXmlToMarkdown(withoutTables, markBold);
    if (deckTitle === null && md.title) deckTitle = md.title;

    const locator: Locator = { kind: "slide", index, ...(md.title ? { label: md.title } : {}) };
    locators.set(index, locator);

    const notes: string[] = [];
    const composited: CompositedGraphic[] = [];
    // 🔴 THE SAME THREE PART TYPES ./office.ts DISPATCHES ON, and they must stay
    // in step: a fourth kind of part added to one file and not the other means a
    // deck reads differently depending on which path opened it.
    for (const target of targets.values()) {
      if (/^ppt\/charts\/chart\d+\.xml$/.test(target)) {
        charts += 1;
        composited.push({ target, text: chartXmlToText(read(target) ?? "") });
      } else if (/^ppt\/diagrams\/data\d+\.xml$/.test(target)) {
        diagrams += 1;
        composited.push({ target, text: diagramXmlToText(read(target) ?? "").replace(/\n+/g, " · ") });
      } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target)) {
        const text = pptxNotesXmlToText(read(target) ?? "");
        if (text) {
          notesPages += 1;
          notes.push(text);
        }
      }
    }

    const slideTables: DocTable[] = [];
    for (const frame of frames) slideTables.push(...readFrameTables(frame, locator, markBold, slideTables.length));

    slides.push({
      body: markedLines(md.body),
      composited,
      index,
      locator,
      notes,
      pictureCaptions: pictureCaptions(xml, targets),
      tables: slideTables,
      title: md.title,
    });
  }

  // Which picture is on which slide — the same walk ./slide-media does before it
  // plans, repeated here because the plan reports only the pictures it chose and
  // the structure has to record every one that is on a slide, glyphs included.
  const parts = readMediaParts(files, "ppt/media/");
  const facts = new Map<string, MediaFact>();
  for (const [name, entry] of parts.entries) facts.set(name, entry.fact);
  const slidesByEntry = new Map<string, number[]>();
  for (const [name, xml] of slideXml) {
    const index = slideNumber(name);
    if (!index) continue;
    const rels = relsXml.get(`ppt/slides/_rels/${name.split("/").pop()}.rels`);
    if (!rels) continue;
    const targets = parseSlideRels(rels);
    for (const relId of embeddedRelIds(xml)) {
      const target = targets.get(relId);
      if (!target) continue;
      const list = slidesByEntry.get(target) ?? [];
      if (!list.includes(index)) list.push(index);
      slidesByEntry.set(target, list);
    }
  }

  const plan = planSlideMedia({ media: facts, relsXml, slideXml });
  const keep = new Set(plan.images.map((image) => image.name));
  const recurring = new Map(plan.images.map((image) => [image.name, image.recurring]));

  const { visuals, byName } = groupVisuals({
    captionsBySlide: slides,
    facts,
    locators,
    recurring,
    slidesByEntry,
    totalSlides: slides.length,
  });

  // Keyed by the VISUAL's id, not by the entry the plan happened to pick, so a
  // caller storing these never has to know which copy of identical bytes won.
  const imageBytes = new Map<string, Uint8Array>();
  for (const name of keep) {
    const entry = parts.entries.get(name);
    if (entry?.bytes) imageBytes.set(byName.get(name) ?? name, entry.bytes);
  }

  const tables: DocTable[] = [];
  const units: DocUnit[] = [];
  const unitsUnread: number[] = [];
  const visualsBySlide = new Map<number, DocVisual[]>();
  for (const visual of visuals) {
    // A recurring graphic is noted at its FIRST appearance only. Repeating the
    // university crest under all 71 slides would bury the deck in its own
    // letterhead — the same rule ./slide-media applies to descriptions.
    const at = visual.role === "furniture" ? [visual.locator] : [visual.locator, ...(visual.alsoAt ?? [])];
    for (const locator of at) {
      const index = locator.index;
      if (index === undefined) continue;
      const list = visualsBySlide.get(index) ?? [];
      list.push(visual);
      visualsBySlide.set(index, list);
    }
  }

  let blockId = 0;
  let compositedCount = 0;
  for (const slide of slides) {
    const blocks: DocBlock[] = [];
    const push = (block: Omit<DocBlock, "id" | "ordinal">): void => {
      blocks.push({ ...block, id: `b${blockId++}`, ordinal: blocks.length });
    };

    if (slide.title) push({ depth: 1, kind: "heading", method: "ooxml", text: slide.title });
    // Every paragraph in a PowerPoint body placeholder carries an outline level;
    // the deck's own structure is a list, so that is what it is reported as.
    for (const line of slide.body) push({ depth: line.depth, kind: "listItem", method: "ooxml", text: line.text });

    for (const table of slide.tables) {
      tables.push(table);
      push({ kind: "table", method: "ooxml", tableId: table.id, text: tableText(table) });
    }

    for (const graphic of slide.composited) {
      const id = `s${slide.index}:${graphic.target}`;
      compositedCount += 1;
      visuals.push({
        composited: true,
        id,
        locator: slide.locator,
        role: "content",
        ...(graphic.text ? { nearbyText: graphic.text } : {}),
      });
      push({ kind: "figure", method: "ooxml", text: graphic.text, visualId: id });
    }

    for (const visual of visualsBySlide.get(slide.index) ?? []) {
      push({ kind: "figure", method: "ooxml", text: visual.caption ?? "", visualId: visual.id });
    }

    for (const note of slide.notes) push({ kind: "speakerNotes", method: "ooxml", text: note });

    if (!blocks.length) unitsUnread.push(slide.index);
    units.push({ blocks, locator: slide.locator });
  }

  const notes: string[] = [];
  if (plan.skippedGlyphs) notes.push(`${plan.skippedGlyphs} pictures are bullets, rules or icons.`);
  if (plan.droppedToCap) notes.push(`${plan.droppedToCap} pictures were left out of the figure read cap.`);
  if (plan.unreadable) notes.push(`${plan.unreadable} pictures are in a format nothing here can open.`);
  if (parts.unwrapped) notes.push(`${parts.unwrapped} pictures were recovered from a metafile wrapper.`);

  return {
    doc: {
      contentHash: sha256Hex(bytes),
      coverage: {
        tablesFound: tables.length,
        unitsFound: units.length,
        unitsRead: units.length - unitsUnread.length,
        visualsFound: visuals.length,
        // KEPT means retrievable: a picture whose bytes are here to send, plus a
        // composited graphic a renderer can go and make. A glyph, a picture past
        // the read cap and an unreadable metafile are all FOUND and located, and
        // none of them is kept — which is the whole point of reporting both.
        visualsKept: imageBytes.size + compositedCount,
        visualsUnreadable: plan.unreadable,
        ...(unitsUnread.length ? { unitsUnread } : {}),
        ...(notes.length ? { notes } : {}),
      },
      kind: "pptx",
      meta: {
        charts,
        diagrams,
        imagesDroppedToCap: plan.droppedToCap,
        imagesGlyphs: plan.skippedGlyphs,
        imagesUnwrapped: parts.unwrapped,
        notesPages,
        slideParts: slideNames.length,
        smartArtAndChartGraphics: compositedCount,
      },
      parserVersion: PPTX_PARSER_VERSION,
      tables,
      units,
      visuals,
      ...(deckTitle ? { title: deckTitle } : {}),
    },
    imageBytes,
  };
}

/** The parser in the shape everything downstream consumes. Note it drops
 *  `imageBytes`: a caller that intends to store the figures wants `parsePptx`. */
export const pptxParser: DocumentParser = {
  kind: "pptx",
  parse: async (bytes: Uint8Array, fileName: string): Promise<ParsedDocument> => parsePptx(bytes, fileName).doc,
  version: PPTX_PARSER_VERSION,
};

// ── slide reading ───────────────────────────────────────────────────────────

interface CompositedGraphic {
  /** Zip entry of the chart or SmartArt data part. */
  target: string;
  text: string;
}

interface SlideRead {
  index: number;
  locator: Locator;
  title: string | null;
  body: MarkedLine[];
  tables: DocTable[];
  composited: CompositedGraphic[];
  notes: string[];
  /** Media entry name → the author's own alt text for it. */
  pictureCaptions: Map<string, string>;
}

export interface MarkedLine {
  /** 1-based nesting level: a top-level bullet is 1. */
  depth: number;
  text: string;
}

/**
 * A slide body, read back out of the markdown ./office-text emits.
 *
 * WHY GO THROUGH MARKDOWN AT ALL: `pptxSlideXmlToMarkdown` is where the measured
 * emphasis decisions live — merging adjacent runs so "Cmax" does not come out as
 * `**C****max**`, hugging the markers to the words, turning a soft break into a
 * word boundary, dropping slide-number chrome. Reading its output costs one
 * regular expression; growing a second run walker beside it would cost a slow
 * divergence, and the deck would be read two different ways depending on which
 * path opened it. The exported guard test pins the emitter's format. PURE.
 */
export function markedLines(body: string): MarkedLine[] {
  const out: MarkedLine[] = [];
  for (const line of body.split("\n")) {
    const match = /^(\s*)-\s(.*)$/.exec(line);
    if (!match) {
      const plain = line.trim();
      if (plain) out.push({ depth: 1, text: plain });
      continue;
    }
    const text = (match[2] ?? "").trim();
    if (!text) continue;
    // The emitter indents two spaces per outline level, capped at six levels.
    out.push({ depth: Math.floor((match[1] ?? "").length / 2) + 1, text });
  }
  return out;
}

// 🔴 MUST STAY IDENTICAL to the second alternative of ./office-text's SHAPE_RE.
// That is the construct whose cell text the flat path already picks up; if this
// matched a different set of frames, a table would either be emitted twice
// (bullets AND grid) or vanish from both.
const TABLE_FRAME_RE =
  /<p:graphicFrame>(?=(?:(?!<\/p:graphicFrame>)[\s\S])*?<a:tbl>)[\s\S]*?<\/p:graphicFrame>/g;
const TBL_RE = /<a:tbl>[\s\S]*?<\/a:tbl>/g;
const ROW_RE = /<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g;
const CELL_RE = /<a:tc\b[^>]*(?:\/>|>[\s\S]*?<\/a:tc>)/g;

/**
 * The tables inside one graphic frame.
 *
 * DrawingML writes a spanned cell as the covering cell plus one continuation
 * cell per grid column it covers (`hMerge`/`vMerge`), so the column index always
 * advances by one per `<a:tc>` — unlike Word, where a single cell carries
 * gridSpan and the columns underneath it are implied. Only the covering cell is
 * emitted, carrying the span; the continuations are what make the grid
 * addressable and are not content of their own.
 */
export function readFrameTables(
  frameXml: string,
  locator: Locator,
  markBold: boolean,
  startIndex = 0,
): DocTable[] {
  const out: DocTable[] = [];
  for (const tableXml of frameXml.match(TBL_RE) ?? []) {
    const firstRowIsHeader = /<a:tblPr\b[^>]*\bfirstRow="(?:1|true)"/.test(tableXml);
    const rows: DocCell[][] = [];
    for (const rowXml of tableXml.match(ROW_RE) ?? []) {
      const row = rows.length;
      const cells: DocCell[] = [];
      let col = 0;
      for (const cellXml of rowXml.match(CELL_RE) ?? []) {
        const open = /^<a:tc\b([^>]*)>/.exec(cellXml)?.[1] ?? "";
        const covered = /\b[hv]Merge="(?:1|true)"/.test(open);
        if (covered) {
          col += 1;
          continue;
        }
        const colSpan = numberAttr(open, "gridSpan");
        const rowSpan = numberAttr(open, "rowSpan");
        cells.push({
          col,
          row,
          text: shapeText(cellXml, markBold),
          ...(colSpan > 1 ? { colSpan } : {}),
          ...(rowSpan > 1 ? { rowSpan } : {}),
          ...(firstRowIsHeader && row === 0 ? { header: true } : {}),
        });
        col += 1;
      }
      rows.push(cells);
    }
    if (!rows.length) continue;
    out.push({
      id: `s${locator.index ?? 0}:t${startIndex + out.length}`,
      locator,
      method: "ooxml",
      rows,
      // The slide's own title is the nearest heading a table on it has.
      ...(locator.label ? { title: locator.label } : {}),
    });
  }
  return out;
}

/** A table cell's text body is a `txBody` exactly like a shape's, so it is read
 *  by the same reader rather than by a second one that would drift from it. */
function shapeText(cellXml: string, markBold: boolean): string {
  return markedLines(pptxSlideXmlToMarkdown(`<p:sp>${cellXml}</p:sp>`, markBold).body)
    .map((line) => line.text)
    .join("\n");
}

function numberAttr(openTag: string, name: string): number {
  const raw = new RegExp(`\\b${name}="(\\d+)"`).exec(openTag)?.[1];
  return raw ? Number(raw) : 1;
}

/** A table rendered as text, so the block stream a chunker walks carries the
 *  grid's words and not just a pointer to it. */
function tableText(table: DocTable): string {
  return table.rows.map((row) => row.map((cell) => cell.text.replace(/\n+/g, " ")).join("\t")).join("\n");
}

/** Media entry name → the author's own description of the picture. `descr` is
 *  alt text a person typed; `name` is PowerPoint's own "Picture 3" and is not. */
function pictureCaptions(slideXml: string, targets: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const pic of slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? []) {
    const descr = /<p:cNvPr\b[^>]*\bdescr="([^"]*)"/.exec(pic)?.[1];
    if (!descr) continue;
    const relId = embeddedRelIds(pic)[0];
    const target = relId ? targets.get(relId) : undefined;
    const text = decodeXmlEntities(descr).trim();
    if (target && text && !out.has(target)) out.set(target, text);
  }
  return out;
}

// ── pictures ────────────────────────────────────────────────────────────────

interface GroupInput {
  slidesByEntry: ReadonlyMap<string, number[]>;
  facts: ReadonlyMap<string, MediaFact>;
  locators: ReadonlyMap<number, Locator>;
  recurring: ReadonlyMap<string, boolean>;
  captionsBySlide: readonly SlideRead[];
  totalSlides: number;
}

/**
 * Identical bytes are ONE picture in many places. The crest on 71 slides is one
 * visual with 70 `alsoAt` locators, not seventy visuals — folding them together
 * is what lets the structure record every picture without drowning in
 * letterhead. The surviving entry name is the lexicographically earliest, the
 * same choice ./slide-media makes, so its plan and this grouping agree on which
 * copy they are talking about.
 */
function groupVisuals(input: GroupInput): { visuals: DocVisual[]; byName: Map<string, string> } {
  interface Distinct {
    name: string;
    fact: MediaFact;
    slides: Set<number>;
    entries: string[];
  }
  const byContent = new Map<string, Distinct>();
  for (const [entry, slides] of input.slidesByEntry) {
    const fact = input.facts.get(entry);
    if (!fact) continue;
    const key = fact.contentKey || entry;
    const existing = byContent.get(key);
    if (existing) {
      for (const slide of slides) existing.slides.add(slide);
      existing.entries.push(entry);
      if (entry < existing.name) existing.name = entry;
    } else {
      byContent.set(key, { entries: [entry], fact, name: entry, slides: new Set(slides) });
    }
  }

  const captions = new Map<string, string>();
  for (const slide of input.captionsBySlide) {
    for (const [entry, text] of slide.pictureCaptions) if (!captions.has(entry)) captions.set(entry, text);
  }

  const visuals: DocVisual[] = [];
  const byName = new Map<string, string>();
  for (const distinct of byContent.values()) {
    const slides = [...distinct.slides].sort((a, b) => a - b);
    const at = slides.map((index) => input.locators.get(index)).filter((l): l is Locator => l !== undefined);
    const home = at[0];
    if (!home) continue;
    // The plan's own recurring judgement where it has one, so structure and read
    // plan never disagree; the same test otherwise, for a picture it left out.
    const isFurniture = input.recurring.get(distinct.name);
    const role =
      isFurniture === true ? "furniture" : visualRole(distinct.fact, slides.length, input.totalSlides);
    const caption = distinct.entries.map((entry) => captions.get(entry)).find((text) => text);
    visuals.push({
      id: distinct.name,
      locator: home,
      role,
      ...(at.length > 1 ? { alsoAt: at.slice(1) } : {}),
      ...(distinct.fact.contentKey ? { contentHash: distinct.fact.contentKey } : {}),
      ...(distinct.fact.width !== null ? { width: distinct.fact.width } : {}),
      ...(distinct.fact.height !== null ? { height: distinct.fact.height } : {}),
      ...(caption ? { caption } : {}),
    });
    for (const entry of distinct.entries) byName.set(entry, distinct.name);
  }
  return { byName, visuals };
}
