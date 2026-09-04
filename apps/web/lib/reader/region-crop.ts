// A boxed piece of a page, turned into something the model can actually look at.
//
// 🔴🔴 THE CROP USED TO BE COMPUTED AND THROWN AWAY. `ImageDocumentView` has always cut the boxed
// region out of the natural-size picture and handed back a data URL; `document-reader.tsx` stored
// it as `preview` and then sent the model a SENTENCE — "the region at 40%,30% (20% wide, 15%
// tall)". Coordinates are not something a vision model can look at, so boxing a diagram and asking
// "what is this showing?" was answered from the surrounding text or from nothing at all.
//
// The fix is this file: the same data URL, as a real attachment travelling with the question.

/** A `data:` URL as a File. Returns null for anything that is not base64 data — which is exactly
 *  what a tainted canvas leaves behind, and a null here is why the wording falls back to describing
 *  the box in words instead of pretending a picture went with it. */
export function fileFromDataUrl(dataUrl: string, fileName: string): File | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  if (!base64) return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], fileName, { type: mime });
  } catch {
    return null;
  }
}

/** What the cut-out is called in the attachment chip. The unit is in the name because a learner
 *  who boxes three things on three pages otherwise gets three identically named pictures. */
export function cropFileName(sourceFileName: string, unitLabel: string, unit: number | null): string {
  const base = sourceFileName.replace(/\.[^./\\]+$/, "").replace(/[\\/:]/g, "-").trim() || "document";
  const where = unit === null ? "" : ` ${unitLabel} ${unit}`;
  return `${base}${where}${CROP_SUFFIX}`;
}

/** The tail every cut-out's name ends with, so a crop can be told from a file the learner dropped. */
export const CROP_SUFFIX = " (marked area).png";

/**
 * Is this attachment a cut-out the reader made, rather than a file the learner dropped in?
 *
 * 🔴 BY NAME, BECAUSE THE NAME IS THE ONLY THING THAT SURVIVES. The crop is attached to the canvas
 * as an ordinary file (that is what keeps the MATERIAL after the session's thumbnail dies), so a
 * reopened conversation only has the source's title to go on. `cropFileName` writes the suffix;
 * this reads it. The conversation uses it to draw an annotation as an annotation ("1 annotation"
 * above the learner's note) instead of as a PNG card, which is what it drew until 2026-09-04.
 */
export function isCropFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(CROP_SUFFIX.toLowerCase());
}
