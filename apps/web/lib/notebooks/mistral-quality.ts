/**
 * Did the vendor's read lose something the file itself says is there?
 *
 * 🔴 THIS IS THE "QUALITY CHECK" BOX IN THE OWNER'S ARCHITECTURE (2026-08-13), AND IT IS BUILT SO
 * IT CANNOT BE A RUBBER STAMP. The decision above it is settled: Mistral is the primary semantic
 * extractor for PDF, PPTX and DOCX, and Nemesis is getting out of the parsing business. Some loss
 * of Office-native metadata is an accepted price — 94% instead of 97% is a good trade against
 * maintaining three parsers for ever. This gate is not here to relitigate that.
 *
 * It is here because one measured case is not 94-vs-97. On a real 57-slide lecture, Mistral's
 * vocabulary was a STRICT SUBSET of the local reader's — 399 content words against 1,141, with
 * ZERO words unique to Mistral — because a deck's speaker notes are not painted on the slide and an
 * optical model can only read what is painted. The words missing included `ultrarapid` and
 * `metabolizers` from a pharmacogenomics lecture. That is not tidier output; it is a document
 * arriving with a third of its concepts, and the owner's own instruction was to verify that enough
 * educational content survives before anything is retired.
 *
 * 🔴 IT COMPARES AGAINST THE FILE'S OWN CLAIM, NEVER AGAINST THE LEGACY PARSER'S OUTPUT. Running
 * both parsers to compare them would cost exactly what this change exists to stop paying, and would
 * make the legacy reader load-bearing again. An Office file is a zip of XML that STATES what it
 * holds: `ppt/notesSlides/` either exists or it does not, `<w:tbl>` either appears or it does not.
 * Reading that manifest is cheap, deterministic, and is not a second opinion about quality — it is
 * the document telling us what to look for. If Mistral returns it, the gate passes and the legacy
 * reader is never invoked.
 *
 * 🔴 AND IT IS DELIBERATELY NOT A GENERAL QUALITY SCORE. There is no threshold to tune, no ratio,
 * no model call. Two facts, both checkable, both of which mean "content this file demonstrably
 * contains did not arrive". Everything else is accepted as-is, on purpose.
 *
 * PDFs are not checked at all: a PDF makes no such claims about itself, and Mistral measurably beats
 * the local reader there — 16,823 words against 9,098, with 60 of the local ones corrupted.
 *
 * 🔴🔴 THE THIRD CASE, ADDED AFTER `LLAMAPARSE_API_KEY` WENT LIVE IN PRODUCTION (2026-08-14) AND
 * `llamaparse-model.ts` GOT WIRED INTO `parseDocument` (`vendorFor("pptx") === "llamaparse"`).
 * `modelFromLlama` handles `heading` and `table` items only — it has no branch for a picture at
 * all, so a deck routed through the vendor lane arrives with ZERO figure blocks, unconditionally.
 * `judgeMistralRead` previously checked only speaker notes and tables for PPTX, so a deck full of
 * diagrams and light on notes would sail through the gate having lost every figure — the entire
 * visual-teaching feature (descriptions AND §46.6 labels), not merely degraded. `ppt/media/` either
 * holds real pictures or it does not, exactly as checkable as `ppt/notesSlides/`.
 */

import type { DocumentModel } from "@nemesis/shared";

import { imageSize } from "./image-dimensions";
import { unzipBounded } from "./office";
import { imageMime, MIN_IMAGE_EDGE, MIN_IMAGE_PIXELS, MIN_UNKNOWN_BYTES } from "./slide-media";
import { isTiff } from "./tiff-image";

/** What an Office file states about its own contents, read from its XML parts. */
export interface ContentClaim {
  /** Slides carrying speaker notes. PPTX only. */
  notesSlides: number;
  /** Roughly how much text those notes hold — the lecturer's spoken explanation. */
  notesChars: number;
  /** Tables the document markup declares. DOCX only. */
  tables: number;
  /**
   * Real pictures under `ppt/media/`. PPTX only.
   *
   * 🔴 SAME FILTER AS `slide-media.ts`, REUSED RATHER THAN REBUILT. A raw entry count would flag a
   * deck whose only "picture" is a 3×3 bullet glyph, which is not a claim any real teaching content
   * went missing. `MIN_IMAGE_EDGE` / `MIN_IMAGE_PIXELS` are the exact bar `planSlideMedia` already
   * uses to tell a diagram from furniture, so this claim and the local lane's own triage cannot
   * disagree about what counts as a real image.
   */
  images: number;
}

const NO_CLAIM: ContentClaim = { images: 0, notesChars: 0, notesSlides: 0, tables: 0 };

/**
 * Notes worth failing a parse over.
 *
 * 🔴 A THRESHOLD ON PRESENCE, NOT ON QUALITY. PowerPoint writes an empty notes part for slides
 * nobody typed a note on, so "has a notes file" is not "has notes". This is set where a deck is
 * unambiguously carrying spoken content: a couple of sentences on a couple of slides. The measured
 * lecture carried 38,910 characters across 35 slides, two orders of magnitude above it.
 */
export const MIN_NOTES_CHARS = 400;
export const MIN_NOTES_SLIDES = 2;

/** The visible text inside an Office XML part, from its `<a:t>` / `<w:t>` runs. PURE. */
function runText(xml: string): string {
  const runs = xml.match(/<(?:a|w):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|w):t>/g) ?? [];
  return runs
    .map((run) => run.replace(/<[^>]+>/g, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What this file says it contains.
 *
 * Returns `NO_CLAIM` for anything that makes no checkable claim — a PDF, an image, or a zip we
 * could not open. A claim of nothing can never fail the gate, which is the safe direction.
 */
export function claimOf(kind: string, bytes: Uint8Array): ContentClaim {
  if (kind !== "pptx" && kind !== "docx") return NO_CLAIM;
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipBounded(bytes);
  } catch {
    // Unreadable as a zip is not a claim about content; let the parse proceed and be judged on
    // its own terms.
    return NO_CLAIM;
  }
  const decoder = new TextDecoder();

  if (kind === "pptx") {
    let notesSlides = 0;
    let notesChars = 0;
    let images = 0;
    for (const [name, data] of Object.entries(parts)) {
      if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) {
        const text = runText(decoder.decode(data));
        // A notes part whose only text is the slide number is PowerPoint's placeholder, not a note.
        if (text.replace(/\d+/g, "").trim().length < 8) continue;
        notesSlides += 1;
        notesChars += text.length;
        continue;
      }
      if (!name.startsWith("ppt/media/")) continue;
      // Same test slide-media.ts applies to the SAME zip parts: a readable raster format, above
      // the glyph floor. A vector metafile or an icon is not a claim of lost teaching content.
      if (imageMime(name)) {
        const size = imageSize(data);
        if (!size) continue;
        if (size.width < MIN_IMAGE_EDGE || size.height < MIN_IMAGE_EDGE) continue;
        if (size.width * size.height < MIN_IMAGE_PIXELS) continue;
        images += 1;
        continue;
      }
      // 🔴 TIFF, COUNTED BY SIGNATURE AND SIZE, NOT DECODED. `tiff-image.ts` fully decodes into a
      // PNG — real work, meant for the moment a figure is actually being sent somewhere. Spending
      // that here, on every media part of every vendor-routed deck, would tax the fast lane to
      // answer a yes/no question. Uncompressed TIFF is never small: `MIN_UNKNOWN_BYTES` is the same
      // floor `slide-media.ts` uses when a format's header is not cheaply readable for pixel size —
      // and a real Mac-authored deck's figures are routinely megabytes each, so this does not need
      // to be precise to be right. Measured on the owner's own 124.5 MB immunology deck: 34 TIFF
      // figures, all comfortably over this floor, none of them 3×3 glyphs.
      if (isTiff(data) && data.byteLength >= MIN_UNKNOWN_BYTES) images += 1;
    }
    return { images, notesChars, notesSlides, tables: 0 };
  }

  const document = parts["word/document.xml"];
  if (!document) return NO_CLAIM;
  const tables = (decoder.decode(document).match(/<w:tbl(?:\s|>)/g) ?? []).length;
  // Images are a PPTX-only claim: `modelFromLlama` has no image branch for either format, but a
  // Word document's pictures are decorative far more often than a lecture slide's, and Mistral's
  // own DOCX table loss was already the measured, real failure worth a gate — this does not widen
  // that without a measurement of its own.
  return { images: 0, notesChars: 0, notesSlides: 0, tables };
}

/** Why a vendor read was rejected, in words that name the missing thing. */
export type QualityVerdict =
  | { ok: true }
  | { ok: false; detail: string; missing: "speaker-notes" | "tables" | "figures" };

/**
 * Whether the vendor's document is good enough to use.
 *
 * 🔴 EVERY CHECK IS "THE FILE SAYS X EXISTS AND X DID NOT ARRIVE". Nothing here judges phrasing,
 * ordering, or how many blocks something was split into — those are the differences the owner has
 * explicitly accepted. Only demonstrable absence fails.
 */
export function judgeMistralRead(claim: ContentClaim, model: DocumentModel): QualityVerdict {
  const text = model.blocks.map((block) => block.text).join(" ");

  // 🔴 THE SPEAKER-NOTES CASE. A deck that states it carries the lecturer's spoken explanation, and
  // a read that came back with none of it, is a lecture missing its teaching — not a lecture
  // formatted differently. Length is the test rather than a phrase match, because notes and slide
  // text share vocabulary and any single probe string would be a guess.
  if (claim.notesSlides >= MIN_NOTES_SLIDES && claim.notesChars >= MIN_NOTES_CHARS) {
    // Half is generous on purpose: the gate is for wholesale loss, not for shortfall.
    if (text.length < claim.notesChars / 2) {
      return {
        detail: `deck states ${claim.notesChars} characters of speaker notes across ${claim.notesSlides} slides; the read returned ${text.length} characters in total`,
        missing: "speaker-notes",
        ok: false,
      };
    }
  }

  // 🔴 THE WORD-TABLE CASE. `<w:tbl>` is the document declaring a grid. Mistral renders .docx and
  // writes its tables as markdown pipes, which break apart wherever a cell contains a line break —
  // measured on a real activity sheet, six declared tables arrived as zero.
  if (claim.tables > 0) {
    const found = model.blocks.filter((block) => block.kind === "table").length;
    if (found < claim.tables) {
      return {
        detail: `document declares ${claim.tables} table(s); the read returned ${found}`,
        missing: "tables",
        ok: false,
      };
    }
  }

  // 🔴 THE PPTX-FIGURE CASE, ADDED WITH LLAMAPARSE LIVE IN PRODUCTION. `modelFromLlama` has no item
  // type for a picture, so a vendor-routed deck arrives with EXACTLY ZERO figure blocks regardless
  // of how many `ppt/media/` holds — not a shortfall, a categorical gap. Checked as a shortfall
  // anyway (`found < claim.images`, not `=== 0`), the same shape as the table case, so a future
  // vendor lane that recovers SOME figures is judged on what it actually lost rather than being
  // held to a today-only absolute.
  if (claim.images > 0) {
    const found = model.blocks.filter((block) => block.kind === "figure").length;
    if (found < claim.images) {
      return {
        detail: `deck holds ${claim.images} real picture(s) in ppt/media/; the read returned ${found} figure block(s)`,
        missing: "figures",
        ok: false,
      };
    }
  }

  return { ok: true };
}
