// Slim an oversized Office file down to its words, in the browser, before it
// is uploaded for extraction.
//
// 🔴 NOTHING CALLS slimOfficeArchive() ANY MORE, AND NOTHING MAY UNTIL IT CAN
// DECLARE ITS OWN DAMAGE.
//
// The claim in the last paragraph below — "a partial read is never presented as
// complete" — was false. The coverage report is built by the extractor from the
// bytes it was handed, and by then the pictures were already gone: it counted
// the zero images that remained, not the 57 that were deleted. So the owner's
// immunology lecture arrived as 0.11 MB, parsed cleanly, returned all 37 slides,
// and every layer downstream believed it had read the whole thing. A source that
// is incomplete while presenting as complete is worse than one that was refused,
// because nobody can tell.
//
// The functions stay because Tier 4 will need them, and they are correct at what
// they do. What is missing is the disclosure around them: assets removed, asset
// types, reason, and the resulting limitation, persisted on the source and
// carried into retrieval and model context so Nemesis can say the figures were
// unavailable rather than reasoning from their absence.
//
// The real fix is upstream and makes this path nearly unreachable: the same
// lecture repacks LOSSLESSLY to 24.0 MiB with all 57 figures intact, because its
// media is uncompressed twice over — raw RGBA inside zip entries stored at
// method 0. See docs/document-normalization.md.
//
// ORIGINAL RATIONALE, kept because the problem it solved is real:
//
// The extract route refuses anything over 25 MB — a sane ceiling for TEXT,
// except that a real lecture deck is mostly pictures: the owner's immunology
// deck weighs 123.8 MB of which the slide XML is well under 1 MB. Refusing it
// outright meant the model read NOTHING of a file whose entire text would fit
// a hundred times over (owner 2026-08-04: "it couldnt read the pptx file").
//
// A .pptx/.docx is a zip. Media lives under dedicated folders (ppt/media/,
// word/media/, plus embedded fonts and OLE objects) that the TEXT extractor
// never reads — slides, notes, charts and SmartArt are all XML parts. So:
// unzip WITHOUT inflating the media entries (the fflate filter skips them
// before any bytes are committed), re-zip what remains, and upload that.
// What is lost is only the figure-description pass, which requires the
// pictures; the coverage report the extractor already produces states how
// many images were found so a partial read is never presented as complete.
//   ^ THIS LAST CLAUSE IS THE BUG. The coverage report counts what survived the
//     strip, so it reported zero images found and called that complete coverage.

import { unzipSync, zipSync } from "fflate";

import { MAX_SOURCE_BYTES } from "@/lib/notebooks/ingest-ref";

/**
 * Above this, an office file is slimmed before upload.
 *
 * 🔴 THIS NUMBER WAS WRONG FOR MONTHS AND THE MISTAKE WAS EXPENSIVE. It was
 * 24 MB, "matching the extract route's 25 MB refusal" — but that 25 MB refusal
 * never fired, because Vercel rejects a request body over ~4.5 MB at the edge
 * first (measured 2026-08-05). So the rule ran backwards on both sides: a 10 MB
 * deck was NOT slimmed (10 < 24) and then died at the platform limit with an
 * unreadable error, while a 30 MB deck WAS slimmed and lost every picture in it
 * for no reason at all.
 *
 * Uploads no longer travel through the function, so the only ceiling left is the
 * `library-sources` bucket's own — and this now equals it exactly. Slimming is
 * once again what it was meant to be: the last resort for a file that genuinely
 * cannot be stored, not a routine tax on any deck with figures in it. Decks
 * under the ceiling keep their pictures, which is the point of everything
 * downstream.
 */
export const OFFICE_SLIM_THRESHOLD_BYTES = MAX_SOURCE_BYTES;

/** Zip entries the text extractor never reads. Media (pictures, video, audio),
 *  embedded fonts, and OLE embeddings (the binary spreadsheet behind a chart —
 *  the chart's own labels live in ppt/charts/chartN.xml, which is kept). */
const HEAVY_ENTRY = /^(?:ppt|word)\/(?:media|fonts|embeddings)\//i;

export function isSlimmableOfficeName(name: string): boolean {
  return /\.(pptx|docx)$/i.test(name);
}

/** Rebuild the archive without its heavy entries. Throws if the bytes are not
 *  a zip — callers treat that as "send the original and let the route answer". */
export function slimOfficeArchive(bytes: Uint8Array): Uint8Array {
  const kept = unzipSync(bytes, { filter: (entry) => !HEAVY_ENTRY.test(entry.name) });
  // Level 6 keeps the XML small without burning seconds of main-thread CPU on
  // what is at most a few MB of text.
  return zipSync(kept, { level: 6 });
}
