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
// 🔴🔴 BUT IT IS NOT A TEMPLATE EITHER, NOT SINCE 2026-09-03, AND THAT IS THE
// DIFFERENCE THE OWNER ASKED FOR. Every shape in a deck carries its own position
// and size, in EMU, in `a:xfrm` — and this module read the text out of the
// shapes and threw the geometry away. The reader then laid every slide out the
// same way: title on top, bullets down the left, pictures in a column on the
// right. A slide with a full-bleed diagram and a caption under it looked exactly
// like a slide with four bullets, because the deck's own arrangement was never
// consulted. Owner: *"with the PowerPoint too, any slide in the document should
// be able to be viewed."*
//
// So the boxes are read now, resolved through the layout and the master for
// placeholders that inherit theirs, and returned as fractions of the slide.
// Nothing is rasterised and no claim about fidelity has changed: what moved is
// that the shapes are where the author put them.

/** English Metric Units in one point. The unit every OOXML coordinate is in. */
export const EMU_PER_POINT = 12700;

/** A shape's box on the slide, as fractions of the slide's width and height, so
 *  the renderer can place it at any scale without knowing the deck's size. */
export interface SlideBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A slide's real size in EMU. Decks are not all 16:9 — 4:3 is still common in
 *  teaching material, and a 4:3 deck drawn in a 16:9 box is stretched. */
export interface DeckSize {
  cx: number;
  cy: number;
}

/** 13.333in × 7.5in: PowerPoint's own default, used when a deck does not say. */
export const DEFAULT_DECK_SIZE: DeckSize = { cx: 12192000, cy: 6858000 };
//
// Slide ORDER comes from presentation.xml, not from filenames: `slide10.xml`
// sorts before `slide2.xml` alphabetically, and a deck whose slides were
// reordered after creation has filenames that no longer match its order at all.

import { allNamed, childrenNamed, firstNamed, isElement, parseXml, textOf, type XmlElement } from "./xml-tree";

export interface SlideParagraph {
  text: string;
  /** Outline depth from the deck's own indent level: 0 is a top-level bullet. */
  level: number;
  /** True for the slide's title placeholder. */
  title: boolean;
  /** Point size the deck asked for on this paragraph's first run, or null when it inherits one
   *  from a theme this reader does not resolve. Null means "you choose", not "zero". */
  sizePt: number | null;
  /** `l` | `ctr` | `r` | `just`, or null when the deck does not say. */
  align: string | null;
  /** The deck's own bold flag on the first run. */
  bold: boolean;
  /**
   * Whether this line carries a bullet: true for `a:buChar`/`a:buAutoNum`, false for `a:buNone`,
   * null when the paragraph says nothing and inherits from the placeholder it sits in.
   *
   * 🔴 THREE STATES, NOT TWO, AND THE THIRD ONE IS THE COMMON CASE. Most paragraphs say nothing at
   * all — a body placeholder's bullets come from the master. Collapsing null to false strips the
   * bullets off nearly every lecture slide in existence; collapsing it to true puts a bullet in
   * front of every title, caption and floating label on the slide.
   */
  bullet: boolean | null;
}

export interface SlidePicture {
  /** Relationship id; resolved to a zip entry through the slide's own .rels. */
  relId: string;
  /** Zip entry the relationship points at, once resolved. */
  target: string | null;
  alt: string;
}

/**
 * One shape on a slide, where the author put it.
 *
 * 🔴 `box` IS NULLABLE AND A NULL IS NOT A FAILURE. A shape can legitimately have no geometry of its
 * own — a placeholder inherits the layout's, and the layout inherits the master's — and when that
 * chain runs out (a deck built by a tool that omits the layout, a shape in a group) there is no
 * honest answer. The renderer counts them: a slide where most shapes have boxes is drawn at its own
 * geometry, and one where they mostly do not falls back to the old template rather than piling
 * every shape at the origin.
 */
export interface SlideShape {
  kind: "text" | "picture";
  box: SlideBox | null;
  /** Text shapes only. */
  paragraphs: SlideParagraph[];
  /** How the deck anchors this text vertically inside its own box: `t`, `ctr` or `b`. */
  anchor: string | null;
  /** Picture shapes only — resolved through the slide's relationships like any other. */
  relId: string | null;
  target: string | null;
  alt: string;
  /** True for the slide's title placeholder, so it can keep its weight. */
  title: boolean;
  /** The placeholder type this shape fills (`body`, `subTitle`, `title`, …), "" for a placeholder
   *  identified only by index, or null for a free-standing text box. It decides whether a
   *  paragraph that says nothing about bullets gets one. */
  placeholder: string | null;
}

export interface ParsedSlide {
  /** 1-based, in presentation order. */
  index: number;
  title: string | null;
  paragraphs: SlideParagraph[];
  pictures: SlidePicture[];
  notes: string | null;
  /** Every shape, in the deck's own paint order, with the geometry it was given. */
  shapes: SlideShape[];
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
      for (const node of paragraph.children) {
        if (!isElement(node)) continue;
        if (node.name === "a:r") text += textOf(firstNamed(node, "a:t") ?? node);
        else if (node.name === "a:br") text += "\n";
        else if (node.name === "a:fld") text += textOf(firstNamed(node, "a:t") ?? node);
      }
      const properties = childrenNamed(paragraph, "a:pPr")[0];
      const level = Number.parseInt(properties?.attrs["lvl"] ?? "0", 10);
      // 🔴 THE FIRST RUN'S PROPERTIES STAND FOR THE PARAGRAPH. A paragraph whose runs disagree about
      // size is a paragraph with a word in a different size, which is a level of fidelity nothing
      // downstream can express — the reconstruction draws one size per line. Taking the first run
      // matches what a reader sees as "the size of this line".
      const run = childrenNamed(paragraph, "a:r").find((node) => firstNamed(node, "a:rPr"));
      const runProperties = run ? firstNamed(run, "a:rPr") : null;
      const hundredths = Number.parseInt(runProperties?.attrs["sz"] ?? "", 10);
      const bullet = properties
        ? firstNamed(properties, "a:buNone")
          ? false
          : firstNamed(properties, "a:buChar") || firstNamed(properties, "a:buAutoNum")
            ? true
            : null
        : null;
      return {
        align: properties?.attrs["algn"] ?? null,
        bold: runProperties?.attrs["b"] === "1",
        bullet,
        sizePt: Number.isFinite(hundredths) && hundredths > 0 ? hundredths / 100 : null,
        text: text.replace(/[ \t]+/g, " ").trim(),
        level: Number.isInteger(level) && level > 0 ? Math.min(level, 4) : 0,
        title,
      };
    })
    .filter((paragraph) => paragraph.text.length > 0);
}

/** A shape's own box, in EMU, or null when it does not carry one. `a:xfrm` sits under `p:spPr` for
 *  a shape or a picture and directly under `p:xfrm` for a graphic frame; `firstNamed` finds either
 *  because it searches the subtree rather than a fixed path. */
function boxOf(shape: XmlElement): { x: number; y: number; cx: number; cy: number } | null {
  const xfrm = firstNamed(shape, "a:xfrm") ?? firstNamed(shape, "p:xfrm");
  if (!xfrm) return null;
  const off = firstNamed(xfrm, "a:off");
  const ext = firstNamed(xfrm, "a:ext");
  if (!off || !ext) return null;
  const x = Number.parseInt(off.attrs["x"] ?? "", 10);
  const y = Number.parseInt(off.attrs["y"] ?? "", 10);
  const cx = Number.parseInt(ext.attrs["cx"] ?? "", 10);
  const cy = Number.parseInt(ext.attrs["cy"] ?? "", 10);
  if (![x, y, cx, cy].every(Number.isFinite) || cx <= 0 || cy <= 0) return null;
  return { cx, cy, x, y };
}

/** The placeholder a shape fills, as `type` and `idx`. Either may be absent: a body placeholder
 *  usually has only an `idx`, a title only a `type`. */
function placeholderOf(shape: XmlElement): { type: string; idx: string } | null {
  const ph = firstNamed(shape, "p:ph");
  if (!ph) return null;
  return { idx: ph.attrs["idx"] ?? "", type: ph.attrs["type"] ?? "" };
}

/**
 * The box a placeholder INHERITS, walking the layout and then the master.
 *
 * 🔴🔴 WITHOUT THIS, MOST SLIDES HAVE ALMOST NO GEOMETRY AT ALL. PowerPoint omits `a:xfrm` on any
 * placeholder the author did not move or resize by hand — which is the common case and, on a deck
 * built from a template, very nearly every shape on every slide. A first pass that read only the
 * slide's own boxes found geometry on the handful of shapes someone had dragged, and nothing else,
 * which is worse than the template it replaces.
 *
 * 🔴 `idx` BEFORE `type`, AND BOTH ARE NEEDED. A layout with two body placeholders distinguishes
 * them by `idx` alone (both have type `body`, or no type at all), so matching on type first puts
 * the right-hand column's text in the left-hand column's box. But a title carries a `type` and no
 * `idx`, so `idx` alone matches nothing on the one shape every slide has.
 */
function inheritedBox(
  placeholder: { type: string; idx: string },
  ancestors: readonly XmlElement[],
): { x: number; y: number; cx: number; cy: number } | null {
  for (const ancestor of ancestors) {
    const shapes = allNamed(ancestor, "p:sp");
    const byIndex = placeholder.idx
      ? shapes.find((shape) => placeholderOf(shape)?.idx === placeholder.idx)
      : undefined;
    const byType = placeholder.type
      ? shapes.find((shape) => {
          const found = placeholderOf(shape);
          if (!found) return false;
          // A layout writes `ctrTitle` where a slide writes `title` and vice versa; both mean the
          // slide's heading, and treating them as different loses the title's box on title slides.
          if (TITLE_PLACEHOLDERS.has(placeholder.type) && TITLE_PLACEHOLDERS.has(found.type)) return true;
          return found.type === placeholder.type;
        })
      : undefined;
    const box = (byIndex && boxOf(byIndex)) || (byType && boxOf(byType)) || null;
    if (box) return box;
  }
  return null;
}

/** The deck's slide size, in EMU. */
export function deckSize(presentationXml: string | null): DeckSize {
  if (!presentationXml) return DEFAULT_DECK_SIZE;
  const root = parseXml(presentationXml);
  const size = root ? firstNamed(root, "p:sldSz") : null;
  const cx = Number.parseInt(size?.attrs["cx"] ?? "", 10);
  const cy = Number.parseInt(size?.attrs["cy"] ?? "", 10);
  return Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0 ? { cx, cy } : DEFAULT_DECK_SIZE;
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

/** How a group's child coordinates map onto the slide. Identity for a shape at the top level. */
interface Frame {
  /** Slide-space origin of the child space. */
  x: number;
  y: number;
  /** Scale from child units to slide units. */
  sx: number;
  sy: number;
}

const ROOT_FRAME: Frame = { sx: 1, sy: 1, x: 0, y: 0 };

/**
 * A group's own frame, composed with the frame it sits in.
 *
 * 🔴 A GROUP HAS TWO BOXES AND USING THE WRONG ONE PUTS EVERY CHILD IN THE CORNER. `a:off`/`a:ext`
 * say where the group sits on the slide; `a:chOff`/`a:chExt` declare the coordinate space its
 * CHILDREN are written in, and that space is usually neither the slide's origin nor its scale. A
 * child at x=4000000 inside a group whose `chOff.x` is 3800000 is 200000 EMU from the group's left
 * edge, not 4000000 EMU from the slide's.
 */
function groupFrame(group: XmlElement, outer: Frame): Frame {
  const xfrm = firstNamed(group, "a:xfrm");
  const off = xfrm ? firstNamed(xfrm, "a:off") : null;
  const ext = xfrm ? firstNamed(xfrm, "a:ext") : null;
  const childOff = xfrm ? firstNamed(xfrm, "a:chOff") : null;
  const childExt = xfrm ? firstNamed(xfrm, "a:chExt") : null;
  const number = (element: XmlElement | null, name: string) => Number.parseInt(element?.attrs[name] ?? "", 10);

  const x = number(off, "x");
  const y = number(off, "y");
  const cx = number(ext, "cx");
  const cy = number(ext, "cy");
  const cox = number(childOff, "x");
  const coy = number(childOff, "y");
  const cex = number(childExt, "cx");
  const cey = number(childExt, "cy");
  if (![x, y, cx, cy, cox, coy, cex, cey].every(Number.isFinite) || cex <= 0 || cey <= 0) return outer;

  const sx = cx / cex;
  const sy = cy / cey;
  return {
    sx: outer.sx * sx,
    sy: outer.sy * sy,
    x: outer.x + (x - cox * sx) * outer.sx,
    y: outer.y + (y - coy * sy) * outer.sy,
  };
}

function place(
  raw: { x: number; y: number; cx: number; cy: number } | null,
  frame: Frame,
  size: DeckSize,
): SlideBox | null {
  if (!raw) return null;
  return {
    h: (raw.cy * frame.sy) / size.cy,
    w: (raw.cx * frame.sx) / size.cx,
    x: (frame.x + raw.x * frame.sx) / size.cx,
    y: (frame.y + raw.y * frame.sy) / size.cy,
  };
}

/**
 * Every shape on a slide, in the deck's own paint order, with the box it was given.
 *
 * 🔴 THE TREE IS WALKED, NOT SEARCHED. `allNamed` would find shapes nested inside groups too — and
 * their coordinates are in the GROUP's space, so they would all be placed as though the group were
 * the slide. Walking gives each level the frame it is actually written against.
 */
function shapesIn(
  container: XmlElement,
  frame: Frame,
  size: DeckSize,
  ancestors: readonly XmlElement[],
  relationships: ReadonlyMap<string, string>,
): SlideShape[] {
  const found: SlideShape[] = [];
  for (const node of container.children) {
    if (!isElement(node)) continue;

    if (node.name === "p:grpSp") {
      found.push(...shapesIn(node, groupFrame(node, frame), size, ancestors, relationships));
      continue;
    }

    if (node.name === "p:pic") {
      const blip = firstNamed(node, "a:blip");
      const relId = blip?.attrs["r:embed"] ?? blip?.attrs["r:link"] ?? null;
      if (!relId) continue;
      const properties = firstNamed(node, "p:cNvPr");
      found.push({
        alt: properties?.attrs["descr"] || properties?.attrs["name"] || "",
        anchor: null,
        box: place(boxOf(node), frame, size),
        kind: "picture",
        paragraphs: [],
        placeholder: null,
        relId,
        target: relationships.get(relId) ?? null,
        title: false,
      });
      continue;
    }

    if (node.name === "p:sp") {
      const title = isTitleShape(node);
      const paragraphs = paragraphsOf(node, title);
      if (paragraphs.length === 0) continue;
      const placeholder = placeholderOf(node);
      const own = boxOf(node);
      const raw = own ?? (placeholder ? inheritedBox(placeholder, ancestors) : null);
      found.push({
        alt: "",
        anchor: firstNamed(node, "a:bodyPr")?.attrs["anchor"] ?? null,
        box: place(raw, frame, size),
        kind: "text",
        paragraphs,
        placeholder: placeholder?.type ?? (placeholder ? "" : null),
        relId: null,
        target: null,
        title,
      });
      continue;
    }

    if (node.name === "p:graphicFrame") {
      // A table on a slide. Its rows are pulled out as lines, at the frame's own box.
      const lines: SlideParagraph[] = [];
      for (const table of allNamed(node, "a:tbl")) {
        for (const row of childrenNamed(table, "a:tr")) {
          const cells = childrenNamed(row, "a:tc").map((cell) => textOf(cell).replace(/\s+/g, " ").trim());
          const line = cells.filter(Boolean).join(" · ");
          if (line) lines.push({ align: null, bold: false, bullet: false, level: 0, sizePt: null, text: line, title: false });
        }
      }
      if (lines.length === 0) continue;
      found.push({
        alt: "",
        anchor: null,
        box: place(boxOf(node), frame, size),
        kind: "text",
        paragraphs: lines,
        placeholder: null,
        relId: null,
        target: null,
        title: false,
      });
    }
  }
  return found;
}

/** Everything the reader shows for one slide. `files` maps zip entry name to
 *  its XML text; the caller unzips (bytes stay out of this pure module). */
export function parseSlide(
  index: number,
  slideXml: string,
  relsXml: string | null,
  slidePath: string,
  notesXml: string | null,
  /** The slide's layout and then its master, as XML. Optional: without them the geometry of any
   *  placeholder the author never moved is unknown, and the reader falls back to its template. */
  ancestorsXml: readonly (string | null)[] = [],
  size: DeckSize = DEFAULT_DECK_SIZE,
): ParsedSlide {
  const root = parseXml(slideXml);
  if (!root) return { index, title: null, paragraphs: [], pictures: [], notes: null, shapes: [] };

  const shapes = allNamed(root, "p:sp");
  const titleShape = shapes.find(isTitleShape) ?? null;
  const title = titleShape
    ? paragraphsOf(titleShape, true).map((paragraph) => paragraph.text).join(" ").trim() || null
    : null;

  const paragraphs = shapes
    .filter((shape) => shape !== titleShape)
    .flatMap((shape) => paragraphsOf(shape, false));

  // Text inside a table on a slide lives in a:tbl, not in a p:sp text body.
  for (const table of allNamed(root, "a:tbl")) {
    for (const row of childrenNamed(table, "a:tr")) {
      const cells = childrenNamed(row, "a:tc").map((cell) => textOf(cell).replace(/\s+/g, " ").trim());
      const line = cells.filter(Boolean).join(" · ");
      if (line) paragraphs.push({ align: null, bold: false, bullet: false, level: 0, sizePt: null, text: line, title: false });
    }
  }

  const relationships = resolveRelationships(relsXml, slidePath);
  const pictures = picturesOf(root).map((picture) => ({ ...picture, target: relationships.get(picture.relId) ?? null }));

  const ancestors = ancestorsXml
    .map((xml) => (xml ? parseXml(xml) : null))
    .filter((node): node is XmlElement => node !== null);
  const tree = firstNamed(root, "p:spTree");
  const placed = tree ? shapesIn(tree, ROOT_FRAME, size, ancestors, relationships) : [];

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

  return { index, title, paragraphs, pictures, notes, shapes: placed };
}

/**
 * Whether a slide's own geometry is worth drawing.
 *
 * 🔴 A THRESHOLD, NOT A BOOLEAN, AND THE FALLBACK IS THE POINT. A deck exported by a tool that
 * omits layouts leaves most placeholders with no box anywhere in the chain, and drawing that slide
 * "at its own geometry" stacks every shape at the slide's top-left corner — visibly worse than the
 * template it replaced. Below the bar, the reader lays the slide out the way it always did.
 */
export function slideIsPlaced(slide: ParsedSlide): boolean {
  if (slide.shapes.length === 0) return false;
  const placed = slide.shapes.filter((shape) => shape.box !== null).length;
  return placed === slide.shapes.length || placed / slide.shapes.length >= 0.75;
}

/** The layout part a slide points at, through its own relationships. */
export function layoutPathFor(relsXml: string | null, slidePath: string): string | null {
  for (const target of resolveRelationships(relsXml, slidePath).values()) {
    if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(target)) return target;
  }
  return null;
}

/** The master a layout points at, through the layout's own relationships. */
export function masterPathFor(layoutRelsXml: string | null, layoutPath: string): string | null {
  for (const target of resolveRelationships(layoutRelsXml, layoutPath).values()) {
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(target)) return target;
  }
  return null;
}

/** `_rels/<part>.rels` for any part path. */
export function relsPathFor(partPath: string): string {
  return partPath.replace(/^(.*)\/([^/]+)$/, "$1/_rels/$2.rels");
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
