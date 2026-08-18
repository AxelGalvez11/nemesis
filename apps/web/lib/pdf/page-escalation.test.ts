/**
 * Page-level escalation, proved on the thing that makes it dangerous.
 *
 * 🔴 THE TEST THAT MATTERS IS THE PAGE-NUMBER ONE. A vendor handed pages 12, 19 and 31 of a
 * forty-page lecture answers about pages 0, 1 and 2, and a splice that believes those numbers
 * produces a document that is well-formed, self-consistent, and wrong everywhere a citation
 * points. Nothing downstream can detect it. So the translation is pinned from both directions and
 * the identity case — "if this were correct by accident, the reverse mapping would still hold" —
 * is asserted rather than assumed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import {
  escalatePdfPages,
  MAX_ESCALATED_PAGES,
  remapUnits,
  spliceEscalatedPages,
} from "./page-escalation";
import type { MistralOcrResponse } from "@/lib/notebooks/mistral-ocr";

function block(unit: number, text: string, kind: DocBlock["kind"] = "paragraph"): Omit<DocBlock, "id"> {
  return { headingPath: [], kind, text, unit };
}

function nativeDoc(pages: number, texts: Record<number, string> = {}): DocumentModel {
  return buildDocument({
    blocks: Object.entries(texts).map(([unit, text]) => block(Number(unit), text)),
    format: "pdf",
    title: "Lecture",
    units: Array.from({ length: pages }, (_, index) => ({
      index,
      kind: "page" as const,
      size: { height: 792, width: 612 },
    })),
  });
}

/** A vendor reply about a k-page slice: its pages are always 0..k-1. */
function sliceReply(texts: readonly string[]): MistralOcrResponse {
  return {
    model: "mistral-ocr-latest",
    pages: texts.map((markdown, index) => ({ index, markdown })),
  };
}

test("🔴 a slice's page numbers become the original document's page numbers", () => {
  const blocks = [block(0, "read from slice page 0"), block(1, "slice page 1"), block(2, "slice page 2")].map(
    (pending, index) => ({ ...pending, id: `b${index}` }),
  );
  const remapped = remapUnits(blocks, [12, 19, 31]);
  assert.deepEqual(
    remapped.map((entry) => entry.unit),
    [12, 19, 31],
  );
  assert.deepEqual(
    remapped.map((entry) => entry.text),
    ["read from slice page 0", "slice page 1", "slice page 2"],
  );
});

test("🔴 a block on a page the slice never had is dropped, not filed somewhere plausible", () => {
  const blocks = [block(0, "real"), block(7, "invented")].map((pending, index) => ({ ...pending, id: `b${index}` }));
  const remapped = remapUnits(blocks, [4]);
  assert.equal(remapped.length, 1);
  assert.equal(remapped[0]?.unit, 4);
});

test("ids are dropped so the splice cannot collide with the native document's own", () => {
  const remapped = remapUnits([{ ...block(0, "x"), id: "b3" }], [9]);
  assert.equal("id" in remapped[0]!, false);
});

test("🔴 the native units survive, so a locator past the escalated pages still resolves", () => {
  const native = nativeDoc(40, { 0: "page one", 12: "thin", 39: "last page" });
  const merged = spliceEscalatedPages(native, [block(12, "the escalated read")], [12]);
  assert.equal(merged.units.length, 40, "a three-page slice must not shrink a forty-page document");
  assert.equal(merged.units[39]?.index, 39);
  assert.equal(merged.blocks.find((entry) => entry.unit === 39)?.text, "last page");
});

test("🔴 only the escalated pages are replaced — every other page keeps its native blocks", () => {
  const native = nativeDoc(5, { 0: "native zero", 2: "native two", 4: "native four" });
  const merged = spliceEscalatedPages(native, [block(2, "vendor two")], [2]);
  assert.equal(merged.blocks.find((entry) => entry.unit === 0)?.text, "native zero");
  assert.equal(merged.blocks.find((entry) => entry.unit === 4)?.text, "native four");
  const onTwo = merged.blocks.filter((entry) => entry.unit === 2);
  assert.equal(onTwo.length, 1, "the native block on an escalated page is replaced, never duplicated");
  assert.equal(onTwo[0]?.text, "vendor two");
});

test("🔴 a figure on an escalated page is kept — the vendor returns no pixels for it", () => {
  const native = buildDocument({
    blocks: [block(1, "thin caption"), block(1, "", "figure")],
    format: "pdf",
    title: null,
    units: [0, 1].map((index) => ({ index, kind: "page" as const })),
  });
  const merged = spliceEscalatedPages(native, [block(1, "vendor transcript")], [1]);
  const kinds = merged.blocks.filter((entry) => entry.unit === 1).map((entry) => entry.kind);
  assert.ok(kinds.includes("figure"), "a diagram must not be deleted to make room for a transcript of the words around it");
  assert.ok(kinds.includes("paragraph"));
});

test("blocks come out in unit order, so reading order survives the splice", () => {
  const native = nativeDoc(4, { 0: "a", 3: "d" });
  const merged = spliceEscalatedPages(native, [block(2, "c"), block(1, "b")], [1, 2]);
  assert.deepEqual(merged.blocks.map((entry) => entry.text), ["a", "b", "c", "d"]);
  assert.deepEqual(merged.blocks.map((entry) => entry.id), ["b0", "b1", "b2", "b3"]);
});

test("🔴 nothing is spent when there are no valid pages to escalate", async () => {
  let called = 0;
  const result = await escalatePdfPages(new Uint8Array([1, 2, 3]), "x.pdf", nativeDoc(3), [9, -1], {
    readWithMistral: async () => {
      called += 1;
      return { durationMs: 0, ok: false, reason: "not-configured" };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(called, 0, "a page outside the document must not reach a provider");
});

test("🔴 a provider that is not configured leaves the native model exactly as it was", async () => {
  // Real bytes, so the slice succeeds and the refusal is genuinely the provider's.
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let n = 0; n < 3; n += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();

  const result = await escalatePdfPages(new Uint8Array(bytes), "x.pdf", nativeDoc(3), [1], {
    readWithMistral: async () => ({ durationMs: 0, ok: false, reason: "not-configured" }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "not-configured");
});

test("🔴 an end-to-end escalation files the vendor's text under the original page number", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let n = 0; n < 10; n += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();

  const native = nativeDoc(10, { 0: "page zero text", 9: "page nine text" });
  const result = await escalatePdfPages(new Uint8Array(bytes), "lecture.pdf", native, [4, 7], {
    readWithMistral: async (sliced) => {
      assert.ok(sliced.byteLength > 0);
      return { durationMs: 12, ok: true, response: sliceReply(["what page four says", "what page seven says"]) };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.pagesRead, [4, 7]);
  assert.deepEqual(result.pagesMissed, []);
  assert.equal(result.readBy, "mistral/mistral-ocr-latest");
  assert.equal(result.model.units.length, 10);
  assert.equal(result.model.blocks.find((entry) => entry.unit === 4)?.text, "what page four says");
  assert.equal(result.model.blocks.find((entry) => entry.unit === 7)?.text, "what page seven says");
  assert.equal(result.model.blocks.find((entry) => entry.unit === 0)?.text, "page zero text");
  assert.equal(result.model.blocks.find((entry) => entry.unit === 9)?.text, "page nine text");
});

test("🔴 a page the vendor returned nothing for keeps its native read and is reported missed", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let n = 0; n < 6; n += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();

  const native = nativeDoc(6, { 2: "native two", 5: "native five" });
  const result = await escalatePdfPages(new Uint8Array(bytes), "lecture.pdf", native, [2, 5], {
    readWithMistral: async () => ({ durationMs: 5, ok: true, response: sliceReply(["vendor two", "   "]) }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.pagesRead, [2]);
  assert.deepEqual(result.pagesMissed, [5]);
  assert.equal(result.model.blocks.find((entry) => entry.unit === 5)?.text, "native five");
});

test("🔴 duplicates cannot make two slice pages map to one original", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let n = 0; n < 4; n += 1) doc.addPage([612, 792]);
  const bytes = await doc.save();

  let slicePages = -1;
  const result = await escalatePdfPages(new Uint8Array(bytes), "x.pdf", nativeDoc(4), [1, 1, 3, 1], {
    readWithMistral: async () => {
      slicePages = 2;
      return { durationMs: 1, ok: true, response: sliceReply(["one", "three"]) };
    },
  });
  assert.equal(slicePages, 2, "the slice holds two distinct pages, not four");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.pagesRead, [1, 3]);
});

test("page-wise escalation has a ceiling", () => {
  assert.ok(MAX_ESCALATED_PAGES > 0 && MAX_ESCALATED_PAGES <= 40);
});
