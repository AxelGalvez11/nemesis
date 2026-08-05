// Which of a slide's pictures can actually be put on screen, which cannot, and
// which did not fit — decided in one place so the view only has to render it.
//
// This exists because all three of those used to collapse into one silent
// `.filter(Boolean)`. A real 37-slide immunology lecture (2026-08-05 acceptance
// pass) stores 61 of its 71 pictures as TIFF, which no browser draws, so 25 of
// its slides came out as captions with nothing above them and no hint that
// anything was missing. `officeImageUrl` returns null for exactly those formats
// and documents that "the caller says so instead" — this is how the caller says
// so.

/** A picture as `pptx-slides.ts` reports it: a path into the archive, or null
 *  when the relationship could not be resolved at all. */
export interface SlidePictureRef {
  target: string | null;
}

export interface ResolvedSlidePictures {
  /** Object URLs to draw, already limited to what the column can hold. */
  shown: string[];
  /** How many drawable pictures did not fit. Never silently dropped. */
  overflow: number;
  /** How many pictures exist but cannot be drawn in a browser. */
  missing: number;
  /** The formats those are in, upper-cased and de-duplicated, for the label —
   *  e.g. ["TIFF", "EMF"]. Empty when nothing is missing. */
  missingFormats: string[];
}

/** Upper-case extension of an archive path, or "" when it has none. */
function formatOf(target: string): string {
  const base = target.split("/").pop() ?? target;
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLocaleUpperCase();
}

export function resolveSlidePictures(
  pictures: readonly SlidePictureRef[],
  images: ReadonlyMap<string, string>,
  max: number,
): ResolvedSlidePictures {
  const drawable: string[] = [];
  const missingFormats: string[] = [];
  let missing = 0;

  for (const picture of pictures) {
    // A picture whose relationship never resolved is not a picture we can tell
    // the student anything useful about, so it is not counted as missing.
    if (!picture.target) continue;
    const url = images.get(picture.target);
    if (url) {
      drawable.push(url);
      continue;
    }
    missing += 1;
    const format = formatOf(picture.target);
    if (format && !missingFormats.includes(format)) missingFormats.push(format);
  }

  const limit = Math.max(0, max);
  return {
    shown: drawable.slice(0, limit),
    overflow: Math.max(0, drawable.length - limit),
    missing,
    missingFormats,
  };
}
