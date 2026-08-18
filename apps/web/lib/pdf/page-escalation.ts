/**
 * Escalating SOME pages of a PDF, not the whole document.
 *
 * 🔴🔴 THE OWNER'S CONSTRAINT IS THE SPECIFICATION: *"Do not ship page-level escalation unless
 * provenance, page numbering, citations, tables, figures, and reconstruction remain correct."*
 * Everything in this file exists to make that sentence true rather than to make it likely.
 *
 * The danger is one specific, silent bug. A vendor handed three pages cut out of a forty-page
 * lecture answers about pages 0, 1 and 2 — ITS pages, not ours. Splicing that reply back without
 * translating the numbers files page 31's transcript under page 0, and every citation, every
 * "slide 12", every highlight rectangle and every reparse afterwards points at the wrong place
 * while looking perfectly well-formed. That is the same class of defect as the off-by-one in
 * `readPdfPagesWithVision` that filed every transcript on the page before the one it was read
 * from — recorded in `parse-document.ts`, found only by reading the output by eye.
 *
 * So the translation is not a line in a merge loop. It is `remapUnits`, it is pure, and it is
 * tested from both directions.
 *
 * 🔴 WHAT THIS MODULE DELIBERATELY DOES NOT DO: decide. `preflightPdf` decides, and it will only
 * ever hand this function the ONE cause that is local to a page — a page whose whole content is a
 * picture, which continues nothing from the page before it because there is no text layer to
 * continue from. A cause that spans pages (a broken font, a table crossing a page break) is
 * escalated whole, by `pageEscalationSafe`, and can never arrive here.
 */

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { modelFromMistral } from "@/lib/notebooks/mistral-model";
import { readWithMistral, type MistralOutcome } from "@/lib/notebooks/mistral-ocr";

/**
 * The most pages one document will ever escalate page-wise.
 *
 * 🔴 A BOUND, AND THE REASON IT IS SMALL. Page-wise escalation is only ever reached when the cheap
 * page lane has run out of budget, which means the document is already expensive. Paying a vendor
 * per page on top of that, without a ceiling, would turn the ledger that caught the problem into
 * the thing that funded it. Beyond this the pages keep the honest "not read" reason coverage
 * already knows how to report — the same choice `MAX_VISION_PAGES` makes one rung down, for the
 * same reason.
 */
export const MAX_ESCALATED_PAGES = 24;

/** What a page-wise escalation achieved, or why it did not happen. */
export type PageEscalation =
  | {
      readonly ok: true;
      /** The native model with the escalated pages' blocks replaced. */
      readonly model: DocumentModel;
      /** 0-based ORIGINAL page indices the vendor actually returned content for. */
      readonly pagesRead: readonly number[];
      /** Pages asked for and not returned. They keep whatever reason they already had. */
      readonly pagesMissed: readonly number[];
      /** What the vendor called itself, for the parse record's provenance. */
      readonly readBy: string;
      readonly durationMs: number;
    }
  | {
      readonly ok: false;
      /**
       * Never a verdict about the file.
       *
       * `not-configured` is the ordinary state of a local checkout; `slice-failed` means pdf-lib
       * could not cut the pages out; `vendor-declined` means the provider did not answer. All
       * three leave the native model exactly as it was, which is the graceful degradation the
       * owner asked for: a failed vendor call must not make a readable document unusable.
       */
      readonly reason: "not-configured" | "slice-failed" | "vendor-declined" | "nothing-returned";
      readonly durationMs: number;
    };

/**
 * Cut pages out of a PDF, preserving their order.
 *
 * Returns null rather than throwing: a document we cannot slice is a document that keeps its
 * native read, and that is a worse parse rather than a failed one.
 */
export async function slicePdfPages(bytes: Uint8Array, indices: readonly number[]): Promise<Uint8Array | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    // 🔴 A COPY. pdf-lib does not detach, but the CALLER's bytes are also handed to pdf.js
    // elsewhere in this parse, and a shared buffer between two libraries that both claim
    // ownership is the quietest possible corruption.
    const source = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true });
    const slice = await PDFDocument.create();
    const copied = await slice.copyPages(source, [...indices]);
    for (const page of copied) slice.addPage(page);
    return await slice.save();
  } catch (cause) {
    console.warn(
      JSON.stringify({
        event: "pdf_page_slice_failed",
        detail: cause instanceof Error ? cause.message.slice(0, 200) : String(cause).slice(0, 200),
        pages: indices.length,
      }),
    );
    return null;
  }
}

/**
 * Translate a model read from a SLICE into the coordinates of the ORIGINAL document.
 *
 * 🔴 THIS IS THE WHOLE SAFETY OF PAGE-LEVEL ESCALATION, IN ONE PURE FUNCTION. `order[i]` is the
 * original 0-based page that became page `i` of the slice, which is exactly the array
 * `preflightPdf` handed to the slicer, in the order it handed it. A block on slice page `i`
 * belongs to original page `order[i]`; a block on a slice page with no entry in `order` is a page
 * the vendor invented and is DROPPED rather than filed somewhere plausible.
 *
 * PURE, and it returns blocks without ids because `buildDocument` mints those positionally: a
 * spliced block that kept the slice's `b3` would collide with the native document's own `b3`, and
 * a duplicate id in a citation is indistinguishable from a correct one.
 */
export function remapUnits(
  blocks: readonly DocBlock[],
  order: readonly number[],
): Omit<DocBlock, "id">[] {
  const out: Omit<DocBlock, "id">[] = [];
  for (const block of blocks) {
    const original = order[block.unit];
    if (original === undefined) continue;
    const { id: _id, ...rest } = block;
    out.push({ ...rest, unit: original });
  }
  return out;
}

/**
 * Put the escalated pages' blocks back into the native document.
 *
 * 🔴 THE NATIVE UNITS SURVIVE UNTOUCHED, AND THAT IS NOT A DETAIL. `DocUnit` carries the page's
 * own size and its author-given label, and those come from the real file. Rebuilding the unit list
 * from a three-page slice would give a forty-page lecture three units, and every locator past page
 * two would point outside the document.
 *
 * 🔴 REPLACE, NOT APPEND, AND ONLY ON THE ESCALATED PAGES. A page whose entire content is a
 * picture has native blocks that are at best a figure rectangle and at worst nothing; keeping them
 * beside a full vendor read of the same page would show the learner the same content twice, which
 * downstream is indistinguishable from the document genuinely repeating itself. Every OTHER page
 * keeps its native blocks byte for byte — the whole point of escalating a region rather than a
 * document is that the rest of the document is not re-read.
 *
 * 🔴 EXCEPT THE FIGURES, WHICH ARE KEPT. A figure block carries geometry and, after the vision
 * pass, a description and labels; the vendor returns neither for a page it OCR'd. Dropping them
 * would trade a diagram the learner can be shown for a transcript of the words around it. This is
 * the same rule `accountForFigures` encodes one layer up: a region must arrive in SOME form, and
 * the form it already arrived in is not improved by deleting it.
 *
 * Reading order is restored by unit, then by the order each block arrived in. PURE.
 */
export function spliceEscalatedPages(
  native: DocumentModel,
  escalated: readonly Omit<DocBlock, "id">[],
  pages: readonly number[],
): DocumentModel {
  const replaced = new Set(pages);
  const kept = native.blocks.filter((block) => !replaced.has(block.unit) || block.kind === "figure");

  const merged: Omit<DocBlock, "id">[] = [];
  const byUnit = new Map<number, Omit<DocBlock, "id">[]>();
  const push = (block: Omit<DocBlock, "id">) => {
    const list = byUnit.get(block.unit);
    if (list) list.push(block);
    else byUnit.set(block.unit, [block]);
  };
  for (const block of kept) {
    const { id: _id, ...rest } = block;
    push(rest);
  }
  for (const block of escalated) push(block);

  for (const unit of [...byUnit.keys()].sort((a, b) => a - b)) {
    for (const block of byUnit.get(unit) ?? []) merged.push(block);
  }

  return buildDocument({
    blocks: merged,
    format: native.format,
    title: native.title,
    units: native.units,
  });
}

/** The vendor client, injectable so a test can prove a call was AVOIDED rather than merely failed. */
export interface PageEscalationClient {
  readWithMistral: typeof readWithMistral;
}

/**
 * Escalate exactly these pages, and splice the answer back under their real numbers.
 *
 * Never throws. Every failure path returns the native model untouched.
 */
export async function escalatePdfPages(
  bytes: Uint8Array,
  fileName: string,
  native: DocumentModel,
  pages: readonly number[],
  client: PageEscalationClient = { readWithMistral },
): Promise<PageEscalation> {
  const started = Date.now();
  const since = () => Date.now() - started;

  // 🔴 SORTED, DEDUPED AND CAPPED BEFORE ANYTHING IS SPENT. `copyPages` happily accepts a
  // duplicate index, which would put the same page in the slice twice and make `order` ambiguous
  // — two slice pages mapping to one original, with the second silently overwriting the first.
  const order = [...new Set(pages)]
    .filter((page) => Number.isInteger(page) && page >= 0 && page < native.units.length)
    .sort((a, b) => a - b)
    .slice(0, MAX_ESCALATED_PAGES);
  if (order.length === 0) return { durationMs: since(), ok: false, reason: "nothing-returned" };

  const sliced = await slicePdfPages(bytes, order);
  if (!sliced) return { durationMs: since(), ok: false, reason: "slice-failed" };

  let outcome: MistralOutcome;
  try {
    outcome = await client.readWithMistral(sliced, fileName, "application/pdf");
  } catch (cause) {
    console.warn(
      JSON.stringify({
        event: "pdf_page_escalation_threw",
        detail: cause instanceof Error ? cause.message.slice(0, 200) : String(cause).slice(0, 200),
      }),
    );
    return { durationMs: since(), ok: false, reason: "vendor-declined" };
  }
  if (!outcome.ok) {
    if (outcome.reason === "not-configured") return { durationMs: since(), ok: false, reason: "not-configured" };
    console.warn(JSON.stringify({ event: "pdf_page_escalation_declined", pages: order.length, reason: outcome.reason }));
    return { durationMs: since(), ok: false, reason: "vendor-declined" };
  }

  const sliceModel = modelFromMistral(outcome.response, "pdf", null);
  if (!sliceModel) return { durationMs: since(), ok: false, reason: "nothing-returned" };

  const remapped = remapUnits(sliceModel.blocks, order);
  if (remapped.length === 0) return { durationMs: since(), ok: false, reason: "nothing-returned" };

  // Which ORIGINAL pages actually came back with something readable. Asked-for and answered are
  // different facts, and counting the request as the result is how a failed page disappears.
  const answered = new Set(
    remapped.filter((block) => block.text.trim() || block.table).map((block) => block.unit),
  );
  const pagesRead = order.filter((page) => answered.has(page));
  if (pagesRead.length === 0) return { durationMs: since(), ok: false, reason: "nothing-returned" };

  // 🔴 ONLY THE PAGES THAT ANSWERED ARE REPLACED. A page we asked about and heard nothing for
  // keeps its native blocks and its honest reason; blanking it would turn a vendor's silence into
  // a claim that the page is empty.
  const model = spliceEscalatedPages(
    native,
    remapped.filter((block) => answered.has(block.unit)),
    pagesRead,
  );

  return {
    durationMs: since(),
    model,
    ok: true,
    pagesMissed: order.filter((page) => !answered.has(page)),
    pagesRead,
    readBy: `mistral/${outcome.response.model || "unknown"}`,
  };
}
