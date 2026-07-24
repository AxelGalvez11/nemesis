// Which pictures in a PowerPoint deck are worth reading.
//
// A lecture's real content is often a picture: a pathway diagram, a dose-response
// curve, a labelled anatomy figure. The extractor pulled text only, so every one of
// those was invisible — a deck could be 60 slides of diagrams and arrive as a
// handful of titles.
//
// Sending every image to a vision model is the naive fix and it is bad on both
// counts. A deck's media folder is mostly the university crest, a bullet glyph, a
// divider bar and the lecturer's headshot, repeated on every slide — that is money
// spent to be told "a logo", and it buries the two diagrams that matter in noise.
//
// So this module decides what is CONTENT before anything is sent anywhere:
//
//   • Too small on disk → a glyph or an icon, not a figure.
//   • Used on many slides → template furniture (crest, footer bar, divider).
//   • Not a raster format the vision model accepts → skipped rather than failed.
//   • Hard cap per deck, newest-content-first, so one pathological deck cannot
//     run up an unbounded bill.
//
// Pure: zip entry names and byte lengths in, a plan out. No fetch, no unzip.

/** Below this a picture is a bullet glyph, an arrow, or a rule — not a figure.
 *  A real screenshot or diagram exported by PowerPoint clears this comfortably. */
export const MIN_IMAGE_BYTES = 12 * 1024;
/** An image on more than this many slides is template furniture, not content. */
export const MAX_SLIDES_BEFORE_DECORATIVE = 3;
/**
 * …but an absolute count alone is not enough, and a real deck proved it: in a
 * 3-slide deck the university crest sits on all 3 and clears any small threshold,
 * so it was being sent to the vision model as a figure. What actually marks
 * furniture is covering most of the DECK, whatever the deck's length. Applied only
 * from DECORATIVE_MIN_SLIDES up, because in a 2-slide deck there is no majority to
 * read and the safe guess is that a picture is content.
 */
export const DECORATIVE_SLIDE_SHARE = 0.6;
export const DECORATIVE_MIN_SLIDES = 3;
/** Per-deck ceiling. A 60-slide deck with a figure on every slide still costs a
 *  bounded amount, and the cap is reported so a caller can say what it skipped. */
export const MAX_IMAGES_PER_DECK = 24;

/** Raster formats Gemini accepts. EMF/WMF are vector metafiles PowerPoint emits for
 *  pasted Office drawings; they are not images to a vision model, so they are
 *  skipped rather than sent and rejected. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface SlideImage {
  /** Zip entry name, e.g. "ppt/media/image3.png". */
  name: string;
  mime: string;
  /** 1-based slide numbers this image appears on, ascending. */
  slides: number[];
}

export interface SlideMediaPlan {
  images: SlideImage[];
  /** How many content images were left out by MAX_IMAGES_PER_DECK. Reported, never
   *  silent — a truncated read that looks complete is a lie about the deck. */
  droppedToCap: number;
  /** Skipped as decoration or as too small, for the same reason. */
  skippedDecorative: number;
}

/** The mime type for a media entry, or null when it isn't a readable raster. PURE. */
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

/** Relationship ids a slide embeds pictures through, in document order. PURE. */
export function embeddedRelIds(slideXml: string): string[] {
  const ids: string[] = [];
  const pattern = /<a:blip\b[^>]*\br:(?:embed|link)="([^"]+)"/g;
  let match = pattern.exec(slideXml);
  while (match) {
    if (match[1]) ids.push(match[1]);
    match = pattern.exec(slideXml);
  }
  return ids;
}

/**
 * Is an image spread across the deck the way template furniture is? Two tests,
 * either sufficient: it is on more slides than a lecturer reuses one figure for, or
 * it covers most of a deck long enough for "most" to mean something. PURE.
 */
export function isDecorativeSpread(onSlides: number, totalSlides: number): boolean {
  if (onSlides > MAX_SLIDES_BEFORE_DECORATIVE) return true;
  if (totalSlides < DECORATIVE_MIN_SLIDES) return false;
  return onSlides >= totalSlides * DECORATIVE_SLIDE_SHARE;
}

export interface SlideMediaInput {
  /** Slide entry name → its XML. */
  slideXml: ReadonlyMap<string, string>;
  /** Slide rels entry name → its XML. */
  relsXml: ReadonlyMap<string, string>;
  /** Media entry name → byte length. */
  mediaSizes: ReadonlyMap<string, number>;
}

/**
 * Decide which of a deck's images to read. Returns them in slide order, so a
 * capped read still covers the beginning of the lecture — where the objectives and
 * the framing diagrams are — rather than a random scatter.
 */
export function planSlideMedia(input: SlideMediaInput): SlideMediaPlan {
  const slidesByImage = new Map<string, number[]>();

  for (const [slideName, xml] of input.slideXml) {
    const number = slideNumber(slideName);
    if (!number) continue;
    const rels = input.relsXml.get(`ppt/slides/_rels/${slideName.split("/").pop()}.rels`);
    if (!rels) continue;
    const targets = parseSlideRels(rels);
    for (const relId of embeddedRelIds(xml)) {
      const target = targets.get(relId);
      if (!target) continue;
      const list = slidesByImage.get(target) ?? [];
      if (!list.includes(number)) list.push(number);
      slidesByImage.set(target, list);
    }
  }

  const content: SlideImage[] = [];
  let skippedDecorative = 0;
  const totalSlides = [...input.slideXml.keys()].filter((name) => slideNumber(name) > 0).length;

  for (const [name, slides] of slidesByImage) {
    const mime = imageMime(name);
    const size = input.mediaSizes.get(name) ?? 0;
    const decorative = !mime || size < MIN_IMAGE_BYTES || isDecorativeSpread(slides.length, totalSlides);
    if (decorative) {
      skippedDecorative += 1;
      continue;
    }
    content.push({ mime, name, slides: [...slides].sort((a, b) => a - b) });
  }

  content.sort((a, b) => (a.slides[0] ?? 0) - (b.slides[0] ?? 0) || a.name.localeCompare(b.name));
  const kept = content.slice(0, MAX_IMAGES_PER_DECK);
  return { droppedToCap: content.length - kept.length, images: kept, skippedDecorative };
}

/**
 * Fold image descriptions back into the deck's text, under the slide they belong
 * to. Descriptions are bracketed and labelled so a reader — and any later
 * flashcard generator — can tell the model's reading of a figure from the
 * lecturer's own words. Never invent a slide that has no description. PURE.
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
    // An image reused on two slides is described once and noted on both.
    for (const slide of image.slides) {
      const list = bySlide.get(slide) ?? [];
      list.push(description);
      bySlide.set(slide, list);
    }
  }

  return slideTexts.map((text, index) => {
    const found = bySlide.get(index + 1);
    if (!found || found.length === 0) return text;
    const block = found.map((description) => `[Figure: ${description}]`).join("\n");
    return text.trim() ? `${text.trimEnd()}\n${block}` : block;
  });
}
