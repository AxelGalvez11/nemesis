// Which pictures in a PowerPoint deck get read, and how the reading is paid for.
//
// A lecture's real content is often a picture: a pathway diagram, a dose-response
// curve, a labelled anatomy figure. Text extraction sees none of it, so a deck of 60
// diagrams used to arrive as a handful of titles.
//
// The first version of this module dropped pictures to keep the vision bill down —
// by file size, and by how many slides they appeared on. Measuring a real
// pharmacokinetics course showed both rules discarding lecture content:
//
//   • a 1408×523 figure stored as flat line art is 4.6 KB, under any byte floor;
//   • a 16×16 icon saved as JPEG is 21.9 KB, over it — and was being described;
//   • 129 of 277 pictures in that course sat under the floor, and 45 of those were
//     bigger than 128×128.
//
// So the rules changed to match how a deck is actually built:
//
//   • DEDUPE BY CONTENT. The crest repeated on 71 slides is ONE picture. Describing
//     each distinct picture once is what makes a generous cap affordable at all —
//     it must happen before any counting, or a cap counts the same crest 71 times.
//   • DECIDE BY PIXELS, NOT BYTES. A glyph is small on screen whatever it compresses
//     to. Dimensions come from the file's own header (./image-dimensions).
//   • A PICTURE ON MANY SLIDES IS STILL READ — once — and marked as recurring, so a
//     later reader can discount it rather than never learn of it.
//   • WHAT CANNOT BE READ IS COUNTED AND REPORTED, never dropped in silence.
//
// Pure: facts about zip entries in, a plan out. No fetch, no unzip, no decoding.

/** Smaller than this on either edge and a picture is a bullet, a rule, or an icon.
 *  The smallest real figure measured across a 12-deck course was 140×134; the
 *  glyphs were 3×3, 16×16, 80×32 and 153×32. */
export const MIN_IMAGE_EDGE = 64;
/** …and a picture must also cover this many pixels, so a 700×20 divider bar goes too. */
export const MIN_IMAGE_PIXELS = 10_000;
/** Used only when a header cannot be read at all: below this, treat as a glyph.
 *  Deliberately tiny — unknown size must not mean "assume decoration". */
export const MIN_UNKNOWN_BYTES = 2 * 1024;
/** A picture on this share of a deck (or on more slides than a lecturer reuses one
 *  figure for) is template furniture: still described, but noted once instead of
 *  repeated under every slide it decorates. */
export const RECURRING_SLIDE_SHARE = 0.6;
export const RECURRING_MIN_SLIDES = 3;
export const MAX_SLIDES_BEFORE_RECURRING = 3;
/** Per-deck ceiling on DISTINCT pictures. With dedupe this is no longer a cost guard
 *  — a whole 161 MB course's figures cost about five cents — it is a runaway guard,
 *  set far above the biggest real deck measured (20 distinct figures). */
export const MAX_IMAGES_PER_DECK = 120;

/** Raster formats a vision model reads. EMF/WMF are metafiles; the ones that turn out
 *  to be wrapped bitmaps are unwrapped upstream (./emf-bitmap) and arrive here as PNG,
 *  and the ones that are genuine vector drawing arrive with a null mime and are
 *  reported unreadable. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** What the importer knows about one media entry before anything is described. */
export interface MediaFact {
  /** Mime a vision model accepts, or null when the format cannot be read. */
  mime: string | null;
  /** Pixel size from the file's own header, or null when it could not be read. */
  width: number | null;
  height: number | null;
  bytes: number;
  /** Identity of the CONTENT — a hash. Two zip entries with the same key are the
   *  same picture and are described once. */
  contentKey: string;
}

export interface SlideImage {
  /** Zip entry name of the copy that will be sent, e.g. "ppt/media/image3.png". */
  name: string;
  mime: string;
  /** 1-based slide numbers this picture appears on, ascending — every appearance,
   *  including copies stored under other entry names. */
  slides: number[];
  /** Template furniture: described once and noted once, not under every slide. */
  recurring: boolean;
}

export interface SlideMediaPlan {
  images: SlideImage[];
  /** Distinct pictures left out by MAX_IMAGES_PER_DECK. Reported, never silent — a
   *  truncated read that looks complete is a lie about the deck. */
  droppedToCap: number;
  /** Bullets, rules and icons left out on pixel size. */
  skippedGlyphs: number;
  /** On slides but in a format nothing here can read (true vector metafiles).
   *  Counted so the student is told, rather than shown a quietly shorter deck. */
  unreadable: number;
  /** Total distinct pictures found on slides, before any of the above. */
  found: number;
}

/** The mime type for a media entry by extension, or null when it isn't a readable
 *  raster. PURE. */
export function imageMime(name: string): string | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** Slide number from a slide XML entry name, or 0. PURE. */
export function slideNumber(name: string): number {
  const match = /slide(\d+)\.xml/.exec(name);
  return match ? Number(match[1]) : 0;
}

/**
 * Relationship id → media entry name, from one slide's .rels XML.
 *
 * Targets are written relative to ppt/slides/, so "../media/image2.png" means
 * "ppt/media/image2.png". Resolving that here keeps the caller working in one
 * namespace — zip entry names — rather than two. PURE.
 */
export function parseSlideRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const pattern = /<Relationship\b[^>]*>/g;
  for (const tag of relsXml.match(pattern) ?? []) {
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    if (/\bTargetMode="External"/.test(tag)) continue;
    map.set(id, resolveTarget(target));
  }
  return map;
}

function resolveTarget(target: string): string {
  const clean = target.replace(/^\.\//, "");
  if (clean.startsWith("../")) return `ppt/${clean.slice(3)}`;
  if (clean.startsWith("/")) return clean.slice(1);
  return `ppt/slides/${clean}`;
}

/**
 * Relationship ids a slide embeds pictures through, in document order.
 *
 * Most pictures name their file on the <a:blip> itself. A picture inserted as an SVG
 * does not: the blip is empty and the real reference sits on a nested <asvg:svgBlip>.
 * Reading only the outer tag made those pictures invisible — not skipped, not
 * counted, simply never seen — so each blip is examined and its inner reference used
 * when it has no outer one. Where BOTH exist the outer wins: that is PowerPoint's own
 * raster fallback for the same picture, and it is the one a vision model can read. PURE.
 */
export function embeddedRelIds(slideXml: string): string[] {
  const ids: string[] = [];
  const blocks = slideXml.split("<a:blip").slice(1);
  for (const block of blocks) {
    const openTagEnd = block.indexOf(">");
    if (openTagEnd < 0) continue;
    const openTag = block.slice(0, openTagEnd);
    const outer = /\br:(?:embed|link)="([^"]+)"/.exec(openTag)?.[1];
    if (outer) {
      ids.push(outer);
      continue;
    }
    const body = block.slice(0, block.indexOf("</a:blip>") + 1 || undefined);
    const inner = /<asvg:svgBlip\b[^>]*\br:(?:embed|link)="([^"]+)"/.exec(body)?.[1];
    if (inner) ids.push(inner);
  }
  return ids;
}

/**
 * Is a picture spread across the deck the way template furniture is? Two tests,
 * either sufficient: it is on more slides than a lecturer reuses one figure for, or
 * it covers most of a deck long enough for "most" to mean something.
 *
 * This no longer decides whether to READ a picture — only whether to repeat its
 * description under every slide. PURE.
 */
export function isRecurring(onSlides: number, totalSlides: number): boolean {
  if (onSlides > MAX_SLIDES_BEFORE_RECURRING) return true;
  if (totalSlides < RECURRING_MIN_SLIDES) return false;
  return onSlides >= totalSlides * RECURRING_SLIDE_SHARE;
}

/**
 * Is this picture too small on screen to be a figure? Judged on pixels; falls back
 * to bytes ONLY when the header could not be read, and then only for the very
 * smallest files, because "size unknown" must never quietly mean "not content". PURE.
 */
export function isGlyph(fact: Pick<MediaFact, "bytes" | "height" | "width">): boolean {
  if (fact.width === null || fact.height === null) return fact.bytes < MIN_UNKNOWN_BYTES;
  if (Math.min(fact.width, fact.height) < MIN_IMAGE_EDGE) return true;
  return fact.width * fact.height < MIN_IMAGE_PIXELS;
}

export interface SlideMediaInput {
  /** Slide entry name → its XML. */
  slideXml: ReadonlyMap<string, string>;
  /** Slide rels entry name → its XML. */
  relsXml: ReadonlyMap<string, string>;
  /** Media entry name → what is known about it. */
  media: ReadonlyMap<string, MediaFact>;
}

/**
 * Decide which of a deck's pictures to read. Returns them in slide order, so a
 * capped read still covers the beginning of the lecture — where the objectives and
 * the framing diagrams are — rather than a random scatter.
 */
export function planSlideMedia(input: SlideMediaInput): SlideMediaPlan {
  const slidesByEntry = new Map<string, number[]>();

  for (const [slideName, xml] of input.slideXml) {
    const number = slideNumber(slideName);
    if (!number) continue;
    const rels = input.relsXml.get(`ppt/slides/_rels/${slideName.split("/").pop()}.rels`);
    if (!rels) continue;
    const targets = parseSlideRels(rels);
    for (const relId of embeddedRelIds(xml)) {
      const target = targets.get(relId);
      if (!target) continue;
      const list = slidesByEntry.get(target) ?? [];
      if (!list.includes(number)) list.push(number);
      slidesByEntry.set(target, list);
    }
  }

  // Fold entries that hold the same picture together FIRST. Everything downstream —
  // the counts, the cap, the bill — is per distinct picture, not per zip entry.
  interface Distinct {
    name: string;
    fact: MediaFact;
    slides: Set<number>;
  }
  const byContent = new Map<string, Distinct>();
  for (const [entry, slides] of slidesByEntry) {
    const fact = input.media.get(entry);
    if (!fact) continue;
    const key = fact.contentKey || entry;
    const existing = byContent.get(key);
    if (existing) {
      for (const slide of slides) existing.slides.add(slide);
      // Keep the earliest-named copy so the choice is stable across runs.
      if (entry < existing.name) existing.name = entry;
    } else {
      byContent.set(key, { fact, name: entry, slides: new Set(slides) });
    }
  }

  const totalSlides = [...input.slideXml.keys()].filter((name) => slideNumber(name) > 0).length;
  const content: SlideImage[] = [];
  let skippedGlyphs = 0;
  let unreadable = 0;

  for (const distinct of byContent.values()) {
    const { fact } = distinct;
    if (!fact.mime) {
      unreadable += 1;
      continue;
    }
    if (isGlyph(fact)) {
      skippedGlyphs += 1;
      continue;
    }
    const slides = [...distinct.slides].sort((a, b) => a - b);
    content.push({
      mime: fact.mime,
      name: distinct.name,
      recurring: isRecurring(slides.length, totalSlides),
      slides,
    });
  }

  content.sort((a, b) => (a.slides[0] ?? 0) - (b.slides[0] ?? 0) || a.name.localeCompare(b.name));
  const kept = content.slice(0, MAX_IMAGES_PER_DECK);
  return {
    droppedToCap: content.length - kept.length,
    found: byContent.size,
    images: kept,
    skippedGlyphs,
    unreadable,
  };
}

/**
 * Fold picture descriptions back into the deck's text, under the slide they belong
 * to. Descriptions are bracketed and labelled so a reader — and any later flashcard
 * generator — can tell the model's reading of a figure from the lecturer's own words.
 *
 * A recurring graphic is noted ONCE, at its first appearance. Repeating "the
 * university crest" under all 71 slides would bury the lecture in its own letterhead.
 * PURE.
 */
export function mergeImageDescriptions(
  slideTexts: readonly string[],
  descriptions: ReadonlyMap<string, string>,
  images: readonly SlideImage[],
): string[] {
  const bySlide = new Map<number, string[]>();
  for (const image of images) {
    const description = descriptions.get(image.name)?.trim();
    if (!description) continue;
    const label = image.recurring ? "Recurring graphic" : "Figure";
    const slides = image.recurring ? image.slides.slice(0, 1) : image.slides;
    for (const slide of slides) {
      const list = bySlide.get(slide) ?? [];
      list.push(`[${label}: ${description}]`);
      bySlide.set(slide, list);
    }
  }

  return slideTexts.map((text, index) => {
    const found = bySlide.get(index + 1);
    if (!found || found.length === 0) return text;
    const block = found.join("\n");
    return text.trim() ? `${text.trimEnd()}\n${block}` : block;
  });
}
