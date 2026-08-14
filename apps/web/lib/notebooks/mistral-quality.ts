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
 */

import type { DocumentModel } from "@nemesis/shared";

import { unzipBounded } from "./office";

/** What an Office file states about its own contents, read from its XML parts. */
export interface ContentClaim {
  /** Slides carrying speaker notes. PPTX only. */
  notesSlides: number;
  /** Roughly how much text those notes hold — the lecturer's spoken explanation. */
  notesChars: number;
  /** Tables the document markup declares. DOCX only. */
  tables: number;
}

const NO_CLAIM: ContentClaim = { notesChars: 0, notesSlides: 0, tables: 0 };

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
    for (const [name, data] of Object.entries(parts)) {
      if (!/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) continue;
      const text = runText(decoder.decode(data));
      // A notes part whose only text is the slide number is PowerPoint's placeholder, not a note.
      if (text.replace(/\d+/g, "").trim().length < 8) continue;
      notesSlides += 1;
      notesChars += text.length;
    }
    return { notesChars, notesSlides, tables: 0 };
  }

  const document = parts["word/document.xml"];
  if (!document) return NO_CLAIM;
  const tables = (decoder.decode(document).match(/<w:tbl(?:\s|>)/g) ?? []).length;
  return { notesChars: 0, notesSlides: 0, tables };
}

/** Why a vendor read was rejected, in words that name the missing thing. */
export type QualityVerdict =
  | { ok: true }
  | { ok: false; detail: string; missing: "speaker-notes" | "tables" };

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

  return { ok: true };
}
