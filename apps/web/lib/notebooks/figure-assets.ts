// Keeping the pictures a lecture teaches with, so nothing has to open the lecture again.
//
// WHY THIS EXISTS. A real immunology deck measured on the way in: 124.5 MB on disk,
// 38 slides, and 13,513 characters of text. The structured model of it — every slide,
// every heading, every table, every locator — serialises to 50 KB. That is 0.04% of
// the file. The other 99.96% is 34 uncompressed TIFF figures (61.7 MB) and 7 embedded
// videos (51.9 MB).
//
// The parser already handles that well: it unwraps all 34 TIFFs into PNG, ignores the
// video, dedupes by content, and drops nothing. The problem is what happens NEXT. The
// unwrapped pictures live in `PptxContents.imageBytes` only long enough to be sent to
// a vision model for description, and are then dropped. So the stored document knows
// that slide 12 has "a phagocyte engulfing a bacterium, labelled" — and cannot show it.
//
// That single gap is what forces the working set back up to the intake size. Every
// later use of a figure — rendering it, occluding a label and asking the learner to
// name it, showing them the diagram they just misread — has only one route back to
// the pixels: download the original 124.5 MB and parse it again. An intake limit had
// become the size of the thing Nemesis carries around.
//
// So the pictures are stored once, at the moment they are already in memory and
// already normalized, and the model records where they went.
//
// WHAT IS AND IS NOT NORMALIZATION HERE. The bytes stored are the ones the parser
// already produced: a TIFF arrives unwrapped to PNG and downscaled past MAX_PIXELS,
// a JPEG arrives untouched. This module does not re-encode. There is no WebP or JPEG
// encoder in this runtime — `emf-bitmap` writes PNG and nothing decodes PNG back to
// pixels — so a "convert everything to WebP at teaching resolution" step would need a
// native addon, and native addons here have broken both bundlers before. The measured
// reduction without one is already most of the win: 61.7 MB of TIFF becomes 9.6 MB of
// PNG, and the 51.9 MB of video is never carried at all.
//
// 🔴 THE BYTES MUST NOT REACH THE STORED RECORD. `NormalizedFigure` carries a
// `Uint8Array`; `DocFigureAsset` carries a path. The first is a working value that
// crosses one thread boundary and is uploaded; the second is what persists. Letting a
// figure array reach the parsed-document row would base64 20 MB into a database column
// and recreate the exact problem this module exists to end — so the two shapes are
// deliberately different types, and `strippedOfBytes` is the only bridge.

import { createHash } from "node:crypto";

import type { DocFigureAsset, DocumentModel } from "@nemesis/shared";

import { imageSize } from "./image-dimensions";
import type { SlideImage } from "./slide-media";

/** Where owner-scoped visual assets live. Same bucket the chat image path already
 *  uses, so its RLS — first path segment is the owner — governs these too. */
export const FIGURE_ASSET_BUCKET = "library-images";

/** Extension per mime, so a stored object is recognisable and servable. Only the
 *  formats `slide-media` calls readable can arrive here. */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * A picture the parser normalized, still in memory.
 *
 * Short-lived on purpose: produced during a parse, uploaded, and discarded. It is
 * never stored and never serialised into a document.
 */
export interface NormalizedFigure {
  /**
   * The parser's name for this picture — the zip entry it came from.
   *
   * 🔴 THIS IS THE JOIN KEY, and it is the same string `DocFigure.ref` carries for
   * a deck, because `pptx-model` sets `ref` from the media plan's entry name. That
   * agreement is what lets assets be attached to a finished model without either
   * side re-deriving which figure is which. `figure-assets.test.ts` asserts it
   * against a real parse rather than trusting the comment.
   */
  entry: string;
  /** Identity of the NORMALIZED bytes — not of the original container. A TIFF and
   *  a PNG of the same diagram converge here, which is what makes the store
   *  content-addressed across formats as well as across decks. */
  contentKey: string;
  mime: string;
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
}

/** Identity of what will be stored. */
export function figureContentKey(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

/**
 * Figures that arrived across a thread boundary, validated.
 *
 * 🔴 `postMessage` HANDS BACK `unknown` AND MEANS IT. The worker sends plain data and
 * the parent receives whatever the clone produced; a cast would let a shape change in
 * the thread turn into an upload of `undefined` bytes here, which storage would accept
 * as an empty object and every later render would show as a broken picture. Anything
 * that is not a figure with real bytes is dropped rather than repaired.
 */
export function readNormalizedFigures(value: unknown): NormalizedFigure[] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedFigure[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const figure = entry as Record<string, unknown>;
    const bytes = figure.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) continue;
    if (typeof figure.entry !== "string" || typeof figure.mime !== "string") continue;
    if (typeof figure.contentKey !== "string" || !figure.contentKey) continue;
    out.push({
      bytes,
      contentKey: figure.contentKey,
      entry: figure.entry,
      height: typeof figure.height === "number" ? figure.height : null,
      mime: figure.mime,
      width: typeof figure.width === "number" ? figure.width : null,
    });
  }
  return out;
}

/**
 * Object path for one stored figure.
 *
 * 🔴 THE OWNER'S ID IS THE FIRST SEGMENT AND THAT IS NOT COSMETIC. The bucket's
 * row-level security decides on the path, so a layout that buries the owner deeper
 * refuses every write — the failure that made recording durability v1 store nothing
 * while all of its unit tests passed.
 *
 * Content-addressed after that: the same diagram in two lectures is one object. PURE.
 */
export function figureAssetPath(uid: string, contentKey: string, mime: string): string {
  const extension = EXTENSION_BY_MIME[mime] ?? "bin";
  return `${uid}/figures/${contentKey}.${extension}`;
}

/**
 * The pictures worth storing out of a parsed deck, in slide order.
 *
 * Takes the media plan's own decisions rather than re-deciding: whatever
 * `planSlideMedia` judged a figure — after its dedupe, its pixel-size filter and its
 * per-deck ceiling — is what gets kept. Storing a different set from the one that was
 * described would leave descriptions pointing at absent pictures and pictures with no
 * description, and neither side would look broken on its own. PURE.
 */
export function normalizedFigures(
  imageBytes: ReadonlyMap<string, Uint8Array>,
  images: readonly SlideImage[],
): NormalizedFigure[] {
  const out: NormalizedFigure[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    const bytes = imageBytes.get(image.name);
    if (!bytes || bytes.byteLength === 0) continue;
    const contentKey = figureContentKey(bytes);
    // The plan already deduped by the ORIGINAL bytes. Two entries can still converge
    // here — an unwrapped TIFF and a PNG of the same picture — and uploading the
    // second would be a wasted round trip to the same object path.
    if (seen.has(contentKey)) continue;
    seen.add(contentKey);
    const size = imageSize(bytes);
    out.push({
      bytes,
      contentKey,
      entry: image.name,
      height: size?.height ?? null,
      mime: image.mime,
      width: size?.width ?? null,
    });
  }
  return out;
}

/** Total bytes a set of figures would store — the number that says whether the
 *  working set actually shrank. PURE. */
export function figureBytesTotal(figures: readonly NormalizedFigure[]): number {
  let total = 0;
  for (const figure of figures) total += figure.bytes.byteLength;
  return total;
}

/**
 * The same figures without their pixels.
 *
 * 🔴 THE ONE PLACE BYTES ARE ALLOWED TO BECOME A RECORD. Everything that persists a
 * parse goes through this, so a future field added to `NormalizedFigure` cannot leak
 * megabytes into a database row by being forgotten — it has to be named here first.
 * PURE.
 */
export function strippedOfBytes(
  figures: readonly NormalizedFigure[],
  uid: string,
): Map<string, DocFigureAsset> {
  const byEntry = new Map<string, DocFigureAsset>();
  for (const figure of figures) {
    byEntry.set(figure.entry, {
      bytes: figure.bytes.byteLength,
      contentKey: figure.contentKey,
      mime: figure.mime,
      path: figureAssetPath(uid, figure.contentKey, figure.mime),
      ...(figure.width !== null ? { width: figure.width } : {}),
      ...(figure.height !== null ? { height: figure.height } : {}),
    });
  }
  return byEntry;
}

/**
 * A model whose figures know where their pictures are.
 *
 * Immutable: returns a new model, because the caller's copy is the one already
 * measured and recorded and must not change under it.
 *
 * Matching is by `DocFigure.ref` — the parser's own name for the picture — so this
 * works for any format whose figures carry one, not only for decks. A figure whose
 * ref has no stored asset is left exactly as it was: absent means "the pixels were
 * not kept", which is a true statement, where a guessed path would be a locator that
 * resolves to nothing. PURE.
 */
export function attachFigureAssets(
  model: DocumentModel,
  byEntry: ReadonlyMap<string, DocFigureAsset>,
): DocumentModel {
  if (byEntry.size === 0) return model;
  return {
    ...model,
    blocks: model.blocks.map((block) => {
      const ref = block.figure?.ref;
      if (!ref) return block;
      const asset = byEntry.get(ref);
      if (!asset) return block;
      return { ...block, figure: { ...block.figure, asset } };
    }),
  };
}

/** How many figures in a model can actually be shown. The number a coverage claim
 *  about visual teaching has to be built from. PURE. */
export function figuresWithAssets(model: DocumentModel): number {
  return model.blocks.filter((block) => block.figure?.asset).length;
}

/**
 * Somewhere to put a picture.
 *
 * Structural rather than a Supabase client on purpose: the store is then testable
 * without a network or a service key, and the one real implementation lives with the
 * code that already holds credentials.
 */
export interface FigureAssetUploader {
  /** Resolves `true` when the object is in place — INCLUDING when it was already
   *  there. Paths are content hashes, so "exists" means "identical bytes exist". */
  put(path: string, bytes: Uint8Array, mime: string): Promise<boolean>;
}

export interface StoredFigureAssets {
  /** Ready to attach to a model — only the figures actually in storage. */
  byEntry: Map<string, DocFigureAsset>;
  stored: number;
  /** Uploads that did not land. Counted and reported, never silent: a figure that
   *  failed to store is a figure the learner will never be shown, and a model that
   *  claimed it anyway would carry a locator pointing at nothing. */
  failed: number;
  bytes: number;
}

/**
 * Put a parse's figures in storage and report what actually landed.
 *
 * 🔴 ONLY WHAT UPLOADED GETS A PATH. The obvious shortcut — build every path up
 * front, upload, and attach them all — produces a model whose figures all look
 * showable while some of them 404 on first render. Failure here is partial by
 * nature (one object can be rejected while the rest succeed), so the record has to
 * be built from outcomes rather than intentions.
 */
export async function storeFigureAssets(
  uploader: FigureAssetUploader,
  uid: string,
  figures: readonly NormalizedFigure[],
): Promise<StoredFigureAssets> {
  const byEntry = new Map<string, DocFigureAsset>();
  const planned = strippedOfBytes(figures, uid);
  let failed = 0;
  let bytes = 0;
  for (const figure of figures) {
    const asset = planned.get(figure.entry);
    if (!asset) continue;
    let ok = false;
    try {
      ok = await uploader.put(asset.path, figure.bytes, figure.mime);
    } catch {
      ok = false;
    }
    if (!ok) {
      failed += 1;
      continue;
    }
    byEntry.set(figure.entry, asset);
    bytes += figure.bytes.byteLength;
  }
  return { byEntry, bytes, failed, stored: byEntry.size };
}
