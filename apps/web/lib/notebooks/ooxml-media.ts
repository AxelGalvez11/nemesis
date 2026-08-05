// What a Word or PowerPoint file's embedded pictures ARE, before anything decides
// what to do with them.
//
// WHY THIS IS ITS OWN MODULE: ./office.ts already walks `ppt/media/`, recovers
// metafile-wrapped bitmaps, measures pixel size and content-hashes each entry —
// but it keeps those facts to itself and returns only the READ PLAN
// (`PptxContents.media`), which carries no width, no height and no content hash.
// The normalized document needs exactly those: DocVisual records size, identity
// and whether a picture is content or page furniture. Rather than have both
// parsers reach back into a plan that cannot answer, the fact-gathering lives
// here once and ./office.ts keeps its own copy for the notebook path it feeds.
//
// Reused, not rebuilt: ./slide-media decides what counts as a glyph and what
// counts as recurring furniture, both measured against a real 121-deck corpus,
// and ./emf-bitmap, ./tiff-image and ./image-dimensions do the format work.
import { createHash } from "node:crypto";

import { emfEmbeddedImage } from "./emf-bitmap";
import { imageSize } from "./image-dimensions";
import { imageMime, isGlyph, isRecurring, type MediaFact } from "./slide-media";
import { tiffImage } from "./tiff-image";
import type { DocVisual } from "@nemesis/shared";

export interface MediaEntry {
  /** Size, mime, byte count and content identity of the picture. */
  fact: MediaFact;
  /** The bytes a reader can actually open — the RECOVERED ones for a metafile
   *  that turned out to wrap a bitmap. Null when nothing here can read it. */
  bytes: Uint8Array | null;
}

export interface MediaParts {
  /** Zip entry name → what is known about it. */
  entries: Map<string, MediaEntry>;
  /** How many pictures were pulled out of a metafile wrapper. */
  unwrapped: number;
}

/**
 * A picture in a format no vision model accepts, turned into one it does — or
 * null when it genuinely cannot be read. Both formats here were found on real
 * slides holding real figures: metafile-wrapped screenshots and uncompressed
 * TIFFs from files built on a Mac. What still returns null is true vector
 * drawing (.wmf, hand-drawn .emf) and SVG, which is counted and reported rather
 * than quietly dropped.
 */
function recoverImage(name: string, bytes: Uint8Array): { bytes: Uint8Array; mime: string } | null {
  if (/\.emf$/i.test(name)) return emfEmbeddedImage(bytes);
  if (/\.tiff?$/i.test(name)) return tiffImage(bytes);
  return null;
}

/**
 * Read every media entry under `prefix` ("ppt/media/", "word/media/").
 *
 * The content hash is sha1 of the bytes actually kept, matching ./office.ts, so
 * the same picture has the same identity whichever path opened the file. It is a
 * DEDUPE key, not a security claim — the document-level content hash that the
 * database stores is sha256 of the original file, computed by the parser.
 */
export function readMediaParts(files: Record<string, Uint8Array>, prefix: string): MediaParts {
  const entries = new Map<string, MediaEntry>();
  let unwrapped = 0;

  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith(prefix)) continue;
    // Annotated because a recovered picture is freshly allocated: its buffer type
    // is the general one, not the exact type fflate hands back for a zip entry.
    let payload: Uint8Array<ArrayBufferLike> = data;
    let mime = imageMime(name);
    if (!mime) {
      const recovered = recoverImage(name, data);
      if (recovered) {
        payload = recovered.bytes;
        mime = recovered.mime;
        unwrapped += 1;
      }
    }
    const size = mime ? imageSize(payload) : null;
    entries.set(name, {
      bytes: mime ? payload : null,
      fact: {
        bytes: payload.byteLength,
        contentKey: createHash("sha1").update(payload).digest("hex"),
        height: size?.height ?? null,
        mime,
        width: size?.width ?? null,
      },
    });
  }

  return { entries, unwrapped };
}

/**
 * Content or page furniture? STRUCTURAL, never semantic.
 *
 * Two signals, both of which hold in any discipline and any language: a picture
 * too small on screen to be a figure is a bullet or an icon, and a picture that
 * appears on most of the document's units is letterhead. Neither asks what the
 * picture is OF — that question belongs to a layer above this one.
 *
 * `unknown` when the file's header could not be read at all, because "size
 * unknown" must never quietly mean "decoration".
 *
 * Both thresholds were measured on DECKS (./slide-media). They transfer to a
 * document's sections because they are about pixels and repetition rather than
 * about slides — but the "recurring" one is the looser fit, and inventing a
 * second, unmeasured number for documents would be worse than reusing this one.
 */
export function visualRole(fact: MediaFact, appearances: number, totalUnits: number): DocVisual["role"] {
  if (isGlyph(fact)) return "furniture";
  if (isRecurring(appearances, totalUnits)) return "furniture";
  return fact.width === null || fact.height === null ? "unknown" : "content";
}

/** sha256 of the original bytes — the document's physical identity, and the one
 *  the database checks the length of. Never the sha1 used to dedupe pictures. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
