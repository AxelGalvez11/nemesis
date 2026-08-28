// PowerPoint decks, read in the browser: per-slide title, body text, speaker
// notes, and the pictures placed on each slide.
//
// 🔴 WHAT THIS IS NOT. It is not a render of a slide. Turning a slide into a
// picture needs a layout engine (LibreOffice), which cannot run inside a Vercel
// function — `docs/document-intelligence.md` §4 records that as a hard
// constraint and §6 defers it pending a decision about a separate rendering
// worker. So a slide whose diagram is DRAWN from arrows and boxes will show its
// text and not its drawing, and the reader labels what it shows as a
// reconstruction rather than calling it a slide image. When the rendering
// worker lands, real rasters replace this and the label goes away.
//
// Slide ORDER comes from presentation.xml, not from filenames: `slide10.xml`
// sorts before `slide2.xml` alphabetically, and a deck whose slides were
// reordered after creation has filenames that no longer match its order at all.

import { textSpansIn } from "./ooxml-edit";
import { allNamed, childrenNamed, firstNamed, isElement, parseXml, textOf, type Span, type XmlElement } from "./xml-tree";

export interface SlideParagraph {
  text: string;
  /** Outline depth from the deck's own indent level: 0 is a top-level bullet. */
  level: number;
  /** True for the slide's title placeholder. */
  title: boolean;
  /**
   * Where this line's words physically sit in the slide part, so an edit can be a splice rather
   * than a rewrite. See `ooxml-edit.ts`. Empty for a line with nothing replaceable in it — a line
   * built entirely from field codes or from empty runs — which is what makes it uneditable.
   */
  runs: readonly Span[];
}

export interface SlidePicture {
  /** Relationship id; resolved to a zip entry through the slide's own .rels. */
  relId: string;
  /** Zip entry the relationship points at, once resolved. */
  target: string | null;
  alt: string;
}

export interface ParsedSlide {
  /** 1-based, in presentation order. */
  index: number;
  /** The zip entry this slide was read from, e.g. `ppt/slides/slide4.xml`. An edit needs to know
   *  which part to splice, and the filenames do NOT follow the order (see the note at the top). */
  part: string;
  title: string | null;
  /** Where the title's words sit in the part. Flattened across the title's paragraphs: a title
   *  written on two lines edits as the one line it reads as. Empty when there is no title. */
  titleRuns: readonly Span[];
  paragraphs: SlideParagraph[];
  pictures: SlidePicture[];
  notes: string | null;
}

/** Placeholder types that mean "this is the slide's title". A deck in any
 *  language uses the same three values — they are part of the file format, not
 *  words an author typed. */
const TITLE_PLACEHOLDERS = new Set(["title", "ctrTitle"]);

function isTitleShape(shape: XmlElement): boolean {
  const placeholder = firstNamed(shape, "p:ph");
  const type = placeholder?.attrs["type"] ?? "";
  return TITLE_PLACEHOLDERS.has(type);
}

/** One text body → paragraphs, keeping indent level and joining the runs a
 *  deck splits a line into. */
function paragraphsOf(shape: XmlElement, title: boolean): SlideParagraph[] {
  const body = firstNamed(shape, "p:txBody");
  if (!body) return [];
  return childrenNamed(body, "a:p")
    .map((paragraph) => {
      let text = "";
      const runs: Span[] = [];
      for (const node of paragraph.children) {
        if (!isElement(node)) continue;
        if (node.name === "a:r") {
          const value = firstNamed(node, "a:t");
          text += textOf(value ?? node);
          // 🔴 ONLY `a:r` IS EDITABLE, AND `a:fld` DELIBERATELY IS NOT. A field is a slide number or
          // a date that PowerPoint recomputes; its `a:t` holds the last value it happened to render,
          // so writing over it produces a change that vanishes the next time the deck is opened.
          if (value) runs.push(...textSpansIn(value));
        } else if (node.name === "a:br") text += "\n";
        else if (node.name === "a:fld") text += textOf(firstNamed(node, "a:t") ?? node);
      }
      const level = Number.parseInt(childrenNamed(paragraph, "a:pPr")[0]?.attrs["lvl"] ?? "0", 10);
      return {
        text: text.replace(/[ \t]+/g, " ").trim(),
        level: Number.isInteger(level) && level > 0 ? Math.min(level, 4) : 0,
        runs,
        title,
      };
    })
    .filter((paragraph) => paragraph.text.length > 0);
}

function picturesOf(slide: XmlElement): SlidePicture[] {
  return allNamed(slide, "p:pic").flatMap((picture) => {
    const blip = firstNamed(picture, "a:blip");
    const relId = blip?.attrs["r:embed"] ?? blip?.attrs["r:link"];
    if (!relId) return [];
    const properties = firstNamed(picture, "p:cNvPr");
    return [{ relId, target: null, alt: properties?.attrs["descr"] || properties?.attrs["name"] || "" }];
  });
}

/** Relationship id → zip entry, from a part's `_rels/<part>.rels`. Targets are
 *  written relative to the part's own folder, so "../media/image1.png" from
 *  ppt/slides/slide1.xml means "ppt/media/image1.png". */
export function resolveRelationships(relsXml: string | null, partPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!relsXml) return map;
  const root = parseXml(relsXml);
  if (!root) return map;
  const folder = partPath.split("/").slice(0, -1).join("/");
  for (const relationship of allNamed(root, "Relationship")) {
    const id = relationship.attrs["Id"];
    const target = relationship.attrs["Target"];
    if (!id || !target || /^https?:/i.test(target)) continue;
    const segments = `${folder}/${target}`.split("/");
    const resolved: string[] = [];
    for (const segment of segments) {
      if (segment === "." || segment === "") continue;
      if (segment === "..") resolved.pop();
      else resolved.push(segment);
    }
    map.set(id, resolved.join("/"));
  }
  return map;
}

/** Slide part paths in PRESENTATION order, read from presentation.xml through
 *  its relationships. Falls back to a natural-numeric filename sort when the
 *  presentation part is missing or unreadable — better than alphabetical, which
 *  puts slide 10 before slide 2. */
export function slideOrder(files: Readonly<Record<string, unknown>>, presentationXml: string | null, presentationRels: string | null): string[] {
  const names = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const byNumber = [...names].sort((a, b) => {
    const numberOf = (name: string) => Number.parseInt(/slide(\d+)\.xml$/.exec(name)?.[1] ?? "0", 10);
    return numberOf(a) - numberOf(b);
  });
  if (!presentationXml || !presentationRels) return byNumber;

  const root = parseXml(presentationXml);
  if (!root) return byNumber;
  const relationships = resolveRelationships(presentationRels, "ppt/presentation.xml");
  const ordered: string[] = [];
  for (const entry of allNamed(root, "p:sldId")) {
    const relId = entry.attrs["r:id"];
    const target = relId ? relationships.get(relId) : undefined;
    if (target && names.includes(target)) ordered.push(target);
  }
  // Any slide the presentation part forgot still gets shown, at the end, rather
  // than silently disappearing from the deck.
  for (const name of byNumber) if (!ordered.includes(name)) ordered.push(name);
  return ordered;
}

/** Everything the reader shows for one slide. `files` maps zip entry name to
 *  its XML text; the caller unzips (bytes stay out of this pure module). */
export function parseSlide(
  index: number,
  slideXml: string,
  relsXml: string | null,
  slidePath: string,
  notesXml: string | null,
): ParsedSlide {
  const root = parseXml(slideXml);
  if (!root) return { index, part: slidePath, title: null, titleRuns: [], paragraphs: [], pictures: [], notes: null };

  const shapes = allNamed(root, "p:sp");
  const titleShape = shapes.find(isTitleShape) ?? null;
  const titleParagraphs = titleShape ? paragraphsOf(titleShape, true) : [];
  const title = titleParagraphs.map((paragraph) => paragraph.text).join(" ").trim() || null;
  const titleRuns = titleParagraphs.flatMap((paragraph) => paragraph.runs);

  const paragraphs = shapes
    .filter((shape) => shape !== titleShape)
    .flatMap((shape) => paragraphsOf(shape, false));

  // Text inside a table on a slide lives in a:tbl, not in a p:sp text body.
  for (const table of allNamed(root, "a:tbl")) {
    for (const row of childrenNamed(table, "a:tr")) {
      const cells = childrenNamed(row, "a:tc").map((cell) => textOf(cell).replace(/\s+/g, " ").trim());
      const line = cells.filter(Boolean).join(" · ");
      // 🔴 NO RUNS, SO NOT EDITABLE. A table row is several cells joined with a separator for
      // READING; splicing that joined string back would need to know which cell each word came
      // from, and guessing would put a whole row into one cell.
      if (line) paragraphs.push({ text: line, level: 0, runs: [], title: false });
    }
  }

  const relationships = resolveRelationships(relsXml, slidePath);
  const pictures = picturesOf(root).map((picture) => ({ ...picture, target: relationships.get(picture.relId) ?? null }));

  let notes: string | null = null;
  if (notesXml) {
    const notesRoot = parseXml(notesXml);
    if (notesRoot) {
      const lines = allNamed(notesRoot, "p:sp")
        // The notes page repeats the slide number in its own placeholder; that
        // is furniture, not something the lecturer wrote.
        .filter((shape) => (firstNamed(shape, "p:ph")?.attrs["type"] ?? "") !== "sldNum")
        .flatMap((shape) => paragraphsOf(shape, false))
        .map((paragraph) => paragraph.text)
        .filter(Boolean);
      notes = lines.length > 0 ? lines.join("\n") : null;
    }
  }

  return { index, part: slidePath, title, titleRuns, paragraphs, pictures, notes };
}

/** The notes part that belongs to a slide, via the slide's own relationships —
 *  never by matching slide numbers, which do not line up in a deck that has had
 *  slides deleted. */
export function notesPathFor(relsXml: string | null, slidePath: string): string | null {
  const relationships = resolveRelationships(relsXml, slidePath);
  for (const target of relationships.values()) if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(target)) return target;
  return null;
}

/** Plain text of a slide, for search. */
export function slideText(slide: ParsedSlide): string {
  return [slide.title, ...slide.paragraphs.map((paragraph) => paragraph.text), slide.notes]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}
