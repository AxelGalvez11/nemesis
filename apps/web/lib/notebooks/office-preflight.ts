/**
 * Did OUR read of this Office file lose anything the file itself declares?
 *
 * 🔴🔴 THE SAME GATE, POINTED THE OTHER WAY, AND THAT SYMMETRY IS THE WHOLE IDEA.
 * `judgeMistralRead` asks "did the VENDOR's read lose something the file says is there" and, when
 * the answer is yes, throws the vendor's answer away and falls back to the local reader. Which
 * means production has been paying LlamaParse for a great many reads whose outcome was decided
 * before the call: the deck's own XML already said what was in it, and our own reader already had
 * it. A PPTX with real pictures is the case that was already caught deterministically
 * (`vendor_skipped_would_lose_figures`); it is not the only one.
 *
 * So the question is asked of OUR read FIRST. If the local lane recovered everything the file
 * declares — the speaker notes in `ppt/notesSlides/`, the `<w:tbl>` grids, the pictures in
 * `ppt/media/` and `word/media/` — then there is nothing a vendor could restore, and calling one
 * buys a differently-worded copy of the same document at a per-page price.
 *
 * 🔴 WHAT THIS IS NOT: A CLAIM THAT OUR PARSER IS BETTER. It is a claim that on THIS FILE nothing
 * measurable is missing. The repo's own bake-off is explicit about where each side wins — our PPTX
 * lane extracted more text than the alternative on 23 decks out of 23, and our DOCX numbering
 * resolves 2,497 of 2,497 markers; the vendor is better at header-row marking and at some
 * positioned content. Header marking is presentation, and this gate is about CONTENT: the owner's
 * line is *"a parser call costing a few cents may be completely justified if it prevents Nemesis
 * from losing an important drug contraindication, speaker note, table, equation, or diagram"*, and
 * every one of those is a thing the file declares and this gate checks.
 *
 * 🔴 AND IT IS NOT A SCORE. There is no ratio, no threshold and no model call — two counts and a
 * length, all read from the file's own zip parts, all of which mean "content this file
 * demonstrably contains did not arrive". Everything else is accepted, on purpose, exactly as
 * `judgeMistralRead` accepts it in the other direction.
 *
 * PURE. The claim is read elsewhere (`claimOf`), the model is built elsewhere; this decides.
 */

import type { DocumentModel } from "@nemesis/shared";

import { judgeMistralRead, MIN_NOTES_CHARS, MIN_NOTES_SLIDES, type ContentClaim } from "./mistral-quality";

/** Why the specialist is worth paying for on an Office file. */
export type OfficeEscalation =
  /** The deck states it carries the lecturer's spoken explanation and our read did not return it. */
  | "speaker-notes"
  /** The document declares grids we did not reconstruct. */
  | "tables"
  /** The file holds real pictures and our read produced no figure for them. */
  | "figures"
  /**
   * The file declares content and our read returned no readable text at all.
   *
   * 🔴 THE CASE NO COUNT CATCHES. A Word document whose body lives entirely inside text boxes, a
   * deck built from grouped shapes an old exporter wrote unusually — the manifest looks ordinary,
   * every count is zero on both sides, and the parse is empty. Zero against zero passes every
   * comparison above, which is exactly why this is checked separately.
   */
  | "nothing-readable";

export interface OfficeSignals {
  readonly notesSlides: number;
  readonly notesChars: number;
  readonly claimedTables: number;
  readonly claimedImages: number;
  readonly recoveredTables: number;
  readonly recoveredFigures: number;
  readonly recoveredBlocks: number;
  readonly textChars: number;
}

export type OfficePreflight =
  | { readonly route: "native"; readonly reason: "native-read-sufficient"; readonly detail: string; readonly signals: OfficeSignals }
  | { readonly route: "vendor"; readonly reason: OfficeEscalation; readonly detail: string; readonly signals: OfficeSignals };

/**
 * A deck or document, judged against its own manifest. PURE.
 *
 * `text` is the readable text the native lane produced. Passed in rather than derived here because
 * the two lanes render a model to text differently and this must judge what the LEARNER would
 * actually receive.
 */
export function preflightOffice(
  kind: "docx" | "pptx",
  claim: ContentClaim,
  model: DocumentModel | null,
  text: string,
): OfficePreflight {
  const blocks = model?.blocks ?? [];
  const recoveredTables = blocks.filter((block) => block.kind === "table").length;
  const recoveredFigures = blocks.filter((block) => block.kind === "figure").length;
  const claimedImages = kind === "pptx" ? claim.images : claim.docxImages;

  const signals: OfficeSignals = {
    claimedImages,
    claimedTables: claim.tables,
    notesChars: claim.notesChars,
    notesSlides: claim.notesSlides,
    recoveredBlocks: blocks.length,
    recoveredFigures,
    recoveredTables,
    textChars: text.trim().length,
  };

  const vendor = (reason: OfficeEscalation, detail: string): OfficePreflight => ({
    detail,
    reason,
    route: "vendor",
    signals,
  });

  // 🔴 CHECKED FIRST, BECAUSE EVERY COMPARISON BELOW IT PASSES TRIVIALLY ON AN EMPTY READ. A file
  // that declares slides, tables or pictures and yielded no words is the strongest escalation an
  // Office file can produce, and it is the one a count-based gate is blind to.
  const declaresSomething =
    claim.notesSlides > 0 || claim.tables > 0 || claimedImages > 0 || blocks.length > 0;
  if (!text.trim() && declaresSomething) {
    return vendor(
      "nothing-readable",
      `the file declares content (${claim.notesSlides} notes slide(s), ${claim.tables} table(s), ${claimedImages} picture(s)) and the native read returned no readable text`,
    );
  }

  // 🔴 THE SHARED GATE, REUSED RATHER THAN RESTATED. `judgeMistralRead` already encodes exactly
  // which absences matter and which differences are accepted; a second implementation here would
  // be a second rule the moment either was edited, and the two would then disagree about the same
  // document depending on which lane happened to read it.
  if (model) {
    const verdict = judgeMistralRead(claim, model);
    if (!verdict.ok) return vendor(verdict.missing, verdict.detail);
  }

  // 🔴 THE WORD-PICTURE CASE, WHICH THE SHARED GATE DELIBERATELY DOES NOT ASK. See `docxImages`:
  // the shared gate cannot ask it, because `modelFromLlama` structurally returns no figures, so
  // asking would reject every vendor read of a picture-bearing Word document without a measurement
  // to justify it. Asking it of OUR OWN read is a different and answerable question — the Word lane
  // does emit figure blocks — and its answer is the one that decides whether a vendor is worth a
  // call at all.
  if (kind === "docx" && claim.docxImages > 0 && recoveredFigures < claim.docxImages) {
    return vendor(
      "figures",
      `the document holds ${claim.docxImages} real picture(s) in word/media/; the native read produced ${recoveredFigures} figure block(s)`,
    );
  }

  const notes =
    claim.notesSlides >= MIN_NOTES_SLIDES && claim.notesChars >= MIN_NOTES_CHARS
      ? `${claim.notesChars} chars of speaker notes recovered, `
      : "";
  return {
    detail: `${notes}${recoveredTables}/${claim.tables} table(s), ${recoveredFigures}/${claimedImages} picture(s), ${signals.textChars} chars of text`,
    reason: "native-read-sufficient",
    route: "native",
    signals,
  };
}
