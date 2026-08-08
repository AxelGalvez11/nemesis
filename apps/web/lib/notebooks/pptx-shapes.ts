/**
 * Where a shape sits on a slide, in the model's own coordinates.
 *
 * 🔴 WHY A DECK HAD NO GEOMETRY AT ALL, AND WHY THAT COST SOMETHING.
 *
 * Every PPTX block in the canonical model carried a unit ("slide 12") and
 * nothing else. That is enough to cite a slide and not enough to point at
 * anything on it: a reader cannot highlight the box an answer came from, a
 * figure cannot be cropped for a closer look, and two claims taken from
 * opposite corners of the same busy slide are indistinguishable. PowerPoint
 * states the position of nearly every shape — measured over the owner's 23
 * course decks, 3,017 of 3,540 shapes carry their own `<a:xfrm>` — so the
 * information was there and was being thrown away.
 *
 * ── THE PROMISE A RECT MAKES ──────────────────────────────────────────────
 *
 * A rect is a claim that a highlight drawn there lands on the right thing.
 * Everything in this file is arranged so that claim is either TRUE or ABSENT:
 *
 *   • A shape that states no position of its own is resolved through its
 *     layout and then its master placeholder — the same chain PowerPoint
 *     itself walks. All 523 such shapes in the corpus resolve. One that did
 *     not would get NO rect, because a box borrowed from the wrong
 *     placeholder points confidently at the wrong half of the slide.
 *   • A shape inside a group is mapped out of the group's own child
 *     coordinate space (`<a:chOff>` / `<a:chExt>`). Reading its raw offsets
 *     as slide coordinates is not a small error: child spaces routinely use
 *     a different origin and scale entirely.
 *   • A rotated shape gets the AXIS-ALIGNED BOX THAT CONTAINS IT, never its
 *     unrotated `off`/`ext`. The containing box is a true statement; the
 *     unrotated one is a different rectangle on the slide.
 *   • Anything that cannot be resolved — a zero-sized child space, a missing
 *     slide size, a shape entirely off the slide — returns nothing.
 *
 * PURE. Strings and numbers in, rectangles out. No zip, no I/O.
 */

import type { DocRect } from "@nemesis/shared";

/** English Metric Units per point. PowerPoint stores geometry in EMU (914,400
 *  to the inch); the model's `DocUnit.size` is in points, as the PDF lane's is,
 *  so a relative rect turns into a crop the same way for both formats. */
export const EMU_PER_POINT = 12_700;

/** A rectangle in EMU, as the file states it. */
export interface Box {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** The slide box from `ppt/presentation.xml`, in EMU. */
export interface SlideSize {
  cx: number;
  cy: number;
}

/** Boxes a slide's shapes can inherit, keyed the two ways PowerPoint keys them. */
export interface PlaceholderBoxes {
  /** `<p:ph idx="…">`. An absent idx means 0, which is what the title uses. */
  byIdx: Map<string, Box>;
  /** `<p:ph type="…">`. `title` and `ctrTitle` are the same slot. */
  byType: Map<string, Box>;
}

export const NO_PLACEHOLDERS: PlaceholderBoxes = { byIdx: new Map(), byType: new Map() };

/** What a slide needs to turn a shape into a rect. */
export interface SlideGeometry {
  size: SlideSize;
  layout: PlaceholderBoxes;
  master: PlaceholderBoxes;
}

// ── Reading the XML ────────────────────────────────────────────────────────

const OFF_RE = /<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/;
const EXT_RE = /<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/;
const CH_OFF_RE = /<a:chOff\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/;
const CH_EXT_RE = /<a:chExt\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/;

/** The slide box, or null when the presentation does not state one — in which
 *  case no rect can be relative to anything and none is produced. */
export function readSlideSize(presentationXml: string): SlideSize | null {
  const tag = /<p:sldSz\b[^>]*>/.exec(presentationXml)?.[0];
  if (!tag) return null;
  const cx = Number(/\bcx="(\d+)"/.exec(tag)?.[1] ?? 0);
  const cy = Number(/\bcy="(\d+)"/.exec(tag)?.[1] ?? 0);
  return cx > 0 && cy > 0 ? { cx, cy } : null;
}

/**
 * One `<a:xfrm>` as a box, with rotation folded in.
 *
 * 🔴 `rot` IS NOT DECORATION. It is stored in 60,000ths of a degree and it
 * moves where the shape's corners actually are. A 90°-rotated caption running
 * up the side of a slide has a tall footprint and a wide `<a:ext>`; handing back
 * the `ext` unchanged would draw the highlight across the slide instead of down
 * it. What comes back here is the axis-aligned box that CONTAINS the rotated
 * shape — larger than the shape when the angle is oblique, but never somewhere
 * the shape is not.
 *
 * `flipH` / `flipV` mirror the shape INSIDE its box and are deliberately
 * ignored: a mirrored shape occupies exactly the same rectangle.
 */
export function boxOfXfrm(xfrmXml: string): Box | null {
  const off = OFF_RE.exec(xfrmXml);
  const ext = EXT_RE.exec(xfrmXml);
  if (!off || !ext) return null;
  const x = Number(off[1]);
  const y = Number(off[2]);
  const cx = Number(ext[1]);
  const cy = Number(ext[2]);
  if (![x, y, cx, cy].every(Number.isFinite) || cx <= 0 || cy <= 0) return null;

  const rot = Number(/<a:xfrm\b[^>]*\brot="(-?\d+)"/.exec(xfrmXml)?.[1] ?? 0);
  if (!Number.isFinite(rot) || rot % 21_600_000 === 0) return { cx, cy, x, y };
  const radians = ((rot / 60_000) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = cx * cos + cy * sin;
  const height = cx * sin + cy * cos;
  // The centre does not move; only the footprint around it changes.
  return { cx: width, cy: height, x: x + (cx - width) / 2, y: y + (cy - height) / 2 };
}

/** The `<a:xfrm>` element inside a container, or null. */
function xfrmOf(xml: string): string | null {
  return /<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/.exec(xml)?.[0] ?? null;
}

/**
 * A shape's own box, before any group is accounted for.
 *
 * 🔴 A `<p:graphicFrame>` DOES NOT USE `<p:spPr>`. Its position is a `<p:xfrm>`
 * that is a direct child of the frame — a different element in a different
 * namespace. Looking for `<p:spPr><a:xfrm>` on a frame finds nothing, and every
 * table in the corpus is a frame, so that mistake yields exactly zero table
 * rects while looking like it works everywhere else.
 */
export function shapeOwnBox(shapeXml: string): Box | null {
  if (shapeXml.startsWith("<p:graphicFrame")) {
    const frame = /<p:xfrm\b[^>]*>[\s\S]*?<\/p:xfrm>/.exec(shapeXml)?.[0];
    // A frame's `<p:xfrm>` holds `<a:off>` / `<a:ext>` and may carry `rot`;
    // rewritten so the shared reader sees the attribute it looks for.
    return frame ? boxOfXfrm(frame.replace("<p:xfrm", "<a:xfrm")) : null;
  }
  const props = /<p:spPr\b[^>]*>[\s\S]*?<\/p:spPr>/.exec(shapeXml)?.[0];
  if (!props) return null;
  const xfrm = xfrmOf(props);
  return xfrm ? boxOfXfrm(xfrm) : null;
}

/** A shape's placeholder identity, when it is one. */
export function placeholderOf(shapeXml: string): { type: string | null; idx: string } | null {
  const tag = /<p:ph\b[^>]*?\/?>/.exec(shapeXml)?.[0];
  if (!tag) return null;
  return {
    idx: /\bidx="(\d+)"/.exec(tag)?.[1] ?? "0",
    type: /\btype="([^"]+)"/.exec(tag)?.[1] ?? null,
  };
}

/** Every placeholder box a layout or master states, keyed both ways. */
export function readPlaceholderBoxes(xml: string): PlaceholderBoxes {
  const byIdx = new Map<string, Box>();
  const byType = new Map<string, Box>();
  for (const shape of xml.match(/<p:sp>(?:(?!<p:sp>)[\s\S])*?<\/p:sp>/g) ?? []) {
    const ph = placeholderOf(shape);
    if (!ph) continue;
    const box = shapeOwnBox(shape);
    if (!box) continue;
    if (!byIdx.has(ph.idx)) byIdx.set(ph.idx, box);
    if (ph.type && !byType.has(ph.type)) byType.set(ph.type, box);
  }
  return { byIdx, byType };
}

/**
 * The box a placeholder inherits: layout first, then master.
 *
 * 🔴 THE TITLE IS ONE SLOT UNDER TWO NAMES. A slide says `type="title"` and its
 * layout may say `type="ctrTitle"` (or the reverse) for the same box — that is
 * how PowerPoint distinguishes a title-slide title from an ordinary one, not a
 * different placeholder. Matching them strictly would leave 326 of the corpus's
 * 523 inheriting shapes without a box.
 *
 * `idx` is tried before `type` because it is the more specific key: a layout
 * with two body placeholders distinguishes them only by index.
 */
export function inheritedBox(
  ph: { type: string | null; idx: string },
  geometry: Pick<SlideGeometry, "layout" | "master">,
): Box | null {
  const titleish = ph.type === "title" || ph.type === "ctrTitle";
  for (const source of [geometry.layout, geometry.master]) {
    if (titleish) {
      const box = source.byType.get("title") ?? source.byType.get("ctrTitle");
      if (box) return box;
    }
    const byIdx = source.byIdx.get(ph.idx);
    if (byIdx) return byIdx;
    if (ph.type) {
      const byType = source.byType.get(ph.type);
      if (byType) return byType;
    }
  }
  return null;
}

// ── Groups ─────────────────────────────────────────────────────────────────

/** One `<p:grpSp>` and the transform its children live under. */
export interface GroupSpan {
  start: number;
  end: number;
  /** The group's own box on the slide (or in ITS parent's child space). */
  box: Box | null;
  /** The child coordinate space its children's offsets are expressed in. */
  child: Box | null;
}

/**
 * Every group in a slide, with its extent in the string.
 *
 * Found by offset rather than by parsing a tree so the shape walk — which is a
 * flat regex over the whole slide, and whose ORDER is what the deck's text
 * depends on — does not have to change at all. A shape belongs to every group
 * whose span contains its offset, innermost last.
 */
export function readGroups(slideXml: string): GroupSpan[] {
  const spans: GroupSpan[] = [];
  const stack: number[] = [];
  for (const token of slideXml.matchAll(/<p:grpSp>|<\/p:grpSp>/g)) {
    if (token[0] === "<p:grpSp>") {
      stack.push(token.index);
      continue;
    }
    const start = stack.pop();
    if (start === undefined) continue;
    const end = token.index + token[0].length;
    const props = /<p:grpSpPr\b[^>]*>[\s\S]*?<\/p:grpSpPr>/.exec(slideXml.slice(start, end))?.[0] ?? "";
    const xfrm = xfrmOf(props);
    const childOff = xfrm ? CH_OFF_RE.exec(xfrm) : null;
    const childExt = xfrm ? CH_EXT_RE.exec(xfrm) : null;
    spans.push({
      box: xfrm ? boxOfXfrm(xfrm) : null,
      child:
        childOff && childExt
          ? { cx: Number(childExt[1]), cy: Number(childExt[2]), x: Number(childOff[1]), y: Number(childOff[2]) }
          : null,
      end,
      start,
    });
  }
  return spans;
}

/** The groups containing an offset, OUTERMOST FIRST. */
export function groupsAt(spans: readonly GroupSpan[], offset: number): GroupSpan[] {
  return spans
    .filter((span) => offset > span.start && offset < span.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * A child box mapped out of its group's coordinate space and onto the slide.
 *
 * 🔴 A GROUP IS A CHANGE OF UNITS, NOT AN OFFSET. `<a:chOff>` / `<a:chExt>`
 * declare the coordinate system the children's own `<a:off>` values are written
 * in, and it is routinely a different origin AND a different scale from the
 * group's box on the slide. Adding the group's offset — the obvious reading —
 * puts a child in the wrong place whenever the two extents differ, which is the
 * normal case once a group has been resized.
 *
 * Returns null when the child space has no size, because dividing by it would
 * produce infinities and a rect that is worse than none.
 */
export function throughGroups(box: Box, groups: readonly GroupSpan[]): Box | null {
  let current = box;
  // Innermost first: a child's coordinates are written in the innermost child
  // space, and each step out translates them into the next one.
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i]!;
    if (!group.box || !group.child) return null;
    if (group.child.cx <= 0 || group.child.cy <= 0) return null;
    const scaleX = group.box.cx / group.child.cx;
    const scaleY = group.box.cy / group.child.cy;
    current = {
      cx: current.cx * scaleX,
      cy: current.cy * scaleY,
      x: group.box.x + (current.x - group.child.x) * scaleX,
      y: group.box.y + (current.y - group.child.y) * scaleY,
    };
  }
  return Number.isFinite(current.x) && Number.isFinite(current.y) && current.cx > 0 && current.cy > 0
    ? current
    : null;
}

// ── Out to the model ───────────────────────────────────────────────────────

/**
 * An EMU box as the model's unit-relative rect, clipped to the slide.
 *
 * A shape can hang off the edge — a decorative band, a figure dragged half out
 * of frame. Clipping keeps every value inside 0..1 as `DocRect` requires; a
 * shape entirely off the slide has no on-slide position to report and returns
 * nothing.
 */
export function toDocRect(box: Box, size: SlideSize): DocRect | undefined {
  if (size.cx <= 0 || size.cy <= 0) return undefined;
  const left = Math.max(0, Math.min(box.x, size.cx));
  const top = Math.max(0, Math.min(box.y, size.cy));
  const right = Math.max(0, Math.min(box.x + box.cx, size.cx));
  const bottom = Math.max(0, Math.min(box.y + box.cy, size.cy));
  if (right <= left || bottom <= top) return undefined;
  return {
    height: (bottom - top) / size.cy,
    width: (right - left) / size.cx,
    x: left / size.cx,
    y: top / size.cy,
  };
}

/**
 * One shape's rect: its own box or an inherited one, out of any groups, clipped.
 *
 * `offset` is where the shape starts in the slide XML, which is how its groups
 * are known without re-parsing the slide as a tree.
 */
export function rectForShape(
  shapeXml: string,
  offset: number,
  groups: readonly GroupSpan[],
  geometry: SlideGeometry | null,
): DocRect | undefined {
  if (!geometry) return undefined;
  let box = shapeOwnBox(shapeXml);
  if (!box) {
    const ph = placeholderOf(shapeXml);
    // 🔴 NOT A PLACEHOLDER AND NO POSITION MEANS NO RECT. There is nothing left
    // to inherit from, and a default box would be an invention.
    if (!ph) return undefined;
    // An inheriting placeholder takes the LAYOUT's box, which is already in
    // slide coordinates — the group chain does not apply to it.
    const inherited = inheritedBox(ph, geometry);
    return inherited ? toDocRect(inherited, geometry.size) : undefined;
  }
  const onSlide = throughGroups(box, groupsAt(groups, offset));
  return onSlide ? toDocRect(onSlide, geometry.size) : undefined;
}

/**
 * Every `<p:graphicFrame>` on a slide, by every relationship it names.
 *
 * A chart and a SmartArt diagram are reached through the SLIDE'S relationships,
 * not by walking its shapes — that is what lets their text be found at all, and
 * it is why they arrive with no idea where they sat. A frame names the parts it
 * shows (`r:id` for a chart, `r:dm` and friends for a diagram), so mapping every
 * such id to the frame's own box reunites the two without changing how the text
 * is found.
 */
export function frameRectsByRelId(
  slideXml: string,
  groups: readonly GroupSpan[],
  geometry: SlideGeometry | null,
): Map<string, DocRect> {
  const out = new Map<string, DocRect>();
  if (!geometry) return out;
  for (const match of slideXml.matchAll(/<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g)) {
    const rect = rectForShape(match[0], match.index, groups, geometry);
    if (!rect) continue;
    for (const id of match[0].matchAll(/\br:[a-zA-Z]+="([^"]+)"/g)) {
      if (!out.has(id[1]!)) out.set(id[1]!, rect);
    }
  }
  return out;
}

/**
 * Every picture on a slide, by the relationship id it embeds.
 *
 * A picture that appears more than once on one slide is deliberately left
 * without a rect: the deck's figure text names the picture, not the placement,
 * so there is no way to say which of the two a description belongs to — and
 * picking the first would be a coin toss dressed up as a locator.
 */
export function pictureRects(
  slideXml: string,
  groups: readonly GroupSpan[],
  geometry: SlideGeometry | null,
): Map<string, DocRect> {
  const found = new Map<string, DocRect | null>();
  for (const match of slideXml.matchAll(/<p:pic>(?:(?!<p:pic>)[\s\S])*?<\/p:pic>/g)) {
    const pic = match[0];
    const relId = /<a:blip\b[^>]*\br:(?:embed|link)="([^"]+)"/.exec(pic)?.[1];
    if (!relId) continue;
    const rect = rectForShape(pic, match.index, groups, geometry);
    found.set(relId, found.has(relId) ? null : (rect ?? null));
  }
  const out = new Map<string, DocRect>();
  for (const [relId, rect] of found) if (rect) out.set(relId, rect);
  return out;
}
