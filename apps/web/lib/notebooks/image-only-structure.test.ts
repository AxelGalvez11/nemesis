/**
 * #486 — an image-only PDF must survive the whole boundary, not just the parser.
 *
 * 🔴 THE STANDING RULE, MADE EXECUTABLE FOR THIS CASE (owner, 2026-08-11):
 *
 *     real file → parser → DocumentModel → JSON/storage → readDocumentModel()
 *              → consumer → locator RESOLVES
 *
 * Six structural fields have died at one of those arrows AFTER passing their own
 * parser's tests. A test that stops at "the parser produced a model" would have
 * passed for every one of them, which is exactly why it stops nowhere short of a
 * resolving locator here.
 *
 * WHAT WAS ACTUALLY BROKEN. Once #485 stopped writing `[Figure — not examined]`
 * into extracted text, an image-only PDF correctly reported no text — and
 * `parseDocument`'s `if (!text)` then discarded the model along with it. The
 * truthful refusal erased the evidence that a figure, a page and a rectangle
 * existed. Measured before the fix: 8 of 458 benchmark layout PDFs and 5 of 165
 * real course files, 17 units and 25 figures thrown away.
 *
 * THE FIXTURES ARE GENERATED, NOT COPIED (`scripts/make-image-only-pdf.mjs`).
 * The documents that exposed this are third-party benchmark PDFs and the owner's
 * own scanned records; neither belongs in this repository. What the parser reacts
 * to is structural — a content stream that draws an image and emits no glyphs —
 * and these are genuine PDFs read by the real pdf.js.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readStructureEnvelope, structureEnvelope, describeCoverage, type DocumentModel } from "@nemesis/shared";

import { parseDocument } from "./parse-document.ts";
import { capabilitiesOfStored, needsVision, parseQuality } from "@/lib/sources/source-capabilities";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

/** The parse, once, so eight assertions do not re-read the same file eight times. */
async function parseImageOnly() {
  const outcome = await parseDocument(fixture("image-only-page.pdf"), "image-only-page.pdf", "application/pdf");
  assert.equal(outcome.ok, false, "there is genuinely no text — the refusal is correct");
  assert.equal(outcome.ok === false && outcome.reason, "no-text", "and it must NOT be `empty`");
  assert.ok(outcome.ok === false && outcome.reason === "no-text" && outcome.document, "the refusal carries the document");
  if (outcome.ok || outcome.reason !== "no-text") throw new Error("unreachable");
  return outcome.document;
}

// ── the parser end ─────────────────────────────────────────────────────────

test("a page of pixels is refused WITH its structure, not as nothing", async () => {
  const document = await parseImageOnly();
  assert.equal(document.text, "", "no text is the honest answer, and it stays honest");
  const model = document.model;
  assert.ok(model, "the model is what the old `empty` branch threw away");
  assert.equal(model.units.length, 1, "the page is known");
  assert.ok(model.blocks.length > 0, "and something on it was located");
  const figures = model.blocks.filter((block) => block.kind === "figure" || block.figure !== undefined);
  assert.ok(figures.length > 0, "the picture survived as a picture");
  assert.ok(figures[0]!.rect, "with the rectangle that makes it addressable");
});

test("🔴 A BLANK PAGE IS STILL `empty` — the guard is calibrated with its own counter-example", async () => {
  // Without this, a rule that returned `no-text` for every textless file would
  // satisfy every other assertion in this file while being obviously wrong.
  const outcome = await parseDocument(fixture("blank-page.pdf"), "blank-page.pdf", "application/pdf");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, "empty", "nothing was found, so there is nothing to remember");
});

// ── coverage: what the record says was missed ──────────────────────────────

test("coverage records a picture found and nobody having looked at it", async () => {
  const { coverage } = await parseImageOnly();
  assert.equal(coverage.units, 1);
  assert.equal(coverage.unitsUnread, 1, "zero pages were read, and that is true");
  assert.equal(coverage.state, "failed", "read nothing, so `failed` — the word is not softened");
  assert.ok(coverage.figures.found > 0, "but the pictures ARE counted");
  assert.equal(coverage.figures.described, 0);
  assert.ok(
    Object.keys(coverage.figures.reasons).length > 0,
    "and a reason is given, so the loss is attributable rather than anonymous",
  );

  // 🔴 THE SENTENCE A STUDENT SEES MUST NOT COLLAPSE TO A SHRUG. `describeCoverage`
  // falls back to "Nothing in this file could be read." only when it has no parts
  // to report; here it has both a page count and a picture count.
  const sentence = describeCoverage(coverage);
  assert.ok(sentence, "a partial/failed record always has something to say");
  assert.match(sentence, /picture/, "including what was found, not only what was missed");
});

// ── the boundary: JSON, storage, and the validator production reads with ───

test("🔴 THE MODEL SURVIVES THE PERSISTENCE BOUNDARY — envelope, JSON, and back", async () => {
  const document = await parseImageOnly();
  const envelope = structureEnvelope({ model: document.model!, text: document.text, title: document.title });

  // Exactly what `parsed_documents.structure` holds: jsonb, so a round trip
  // through JSON is the real transport, not a formality.
  const stored = JSON.parse(JSON.stringify(envelope)) as unknown;
  const read = readStructureEnvelope(stored);

  assert.ok(read, "🔴 null here is the failure mode that killed three whole Word documents");
  assert.equal(read.shape, "units-blocks", "a model was stored, so `text-only` would be a silent downgrade");
  if (read.shape !== "units-blocks") throw new Error("unreachable");

  const before = document.model!;
  const after = read.model;
  assert.equal(after.units.length, before.units.length, "no unit vanished");
  assert.equal(after.blocks.length, before.blocks.length, "no block vanished");
  assert.deepEqual(
    after.blocks.map((block) => block.id),
    before.blocks.map((block) => block.id),
    "ids are locators — a changed id is a citation that stops resolving",
  );
  assert.deepEqual(
    after.blocks.map((block) => block.rect),
    before.blocks.map((block) => block.rect),
    "geometry is the point of keeping this at all",
  );
});

test("🔴 AND THE LOCATOR RESOLVES ON THE READ-BACK MODEL, not on the parser's copy", async () => {
  const document = await parseImageOnly();
  const stored = JSON.parse(JSON.stringify(
    structureEnvelope({ model: document.model!, text: document.text, title: document.title }),
  )) as unknown;
  const read = readStructureEnvelope(stored);
  if (!read || read.shape !== "units-blocks") throw new Error("the envelope did not survive");

  for (const block of read.model.blocks) {
    // Annotated because `assert.ok` is a type assertion: without it TS cannot
    // infer `unit` while the narrowing below depends on `unit` itself (TS7022).
    const unit: DocumentModel["units"][number] | undefined = read.model.units[block.unit];
    assert.ok(unit, `block ${block.id} points at unit ${block.unit}, which must exist`);
    assert.equal(unit.index, block.unit, "and the unit must be the one it names");
    if (!block.rect) continue;
    // A rectangle is stored in page-relative units; one outside [0,1] cannot be
    // drawn on the page it claims to be on.
    assert.ok(block.rect.x >= 0 && block.rect.x <= 1, `${block.id} x within the page`);
    assert.ok(block.rect.y >= 0 && block.rect.y <= 1, `${block.id} y within the page`);
    assert.ok(block.rect.width > 0 && block.rect.height > 0, `${block.id} has a real area`);
  }
});

// ── the consumer end ───────────────────────────────────────────────────────

test("a stored scan reports itself as located-but-unreadable, and asks for vision", async () => {
  const document = await parseImageOnly();
  const stored = JSON.parse(JSON.stringify(
    structureEnvelope({ model: document.model!, text: document.text, title: document.title }),
  )) as unknown;

  // 🔴 CAPABILITIES FROM THE STORED BYTES, which is the only claim that matters.
  const capabilities = capabilitiesOfStored(stored);
  assert.equal(capabilities.text, false, "there is no text, and pretending otherwise is the old bug");
  assert.equal(capabilities.figures, true, "there IS a picture");
  assert.equal(capabilities.geometry, true, "with a rectangle");
  assert.equal(capabilities.semanticUnits, true, "and it is addressable");
  assert.equal(capabilities.pageAnchors, true, "so a citation can name its page");

  assert.equal(needsVision(capabilities), true, "a reader that can see pixels would finish this job");

  // Unchanged and deliberately so: nothing can read this document, and quality
  // says exactly that. The improvement is that the shape survives, not that the
  // verdict is softened.
  assert.equal(parseQuality({ capabilities, sourceKind: "pdf" }), "failed");
});

test("🔴 `needsVision` IS FALSE WHEN NOTHING WAS FOUND — it names a rescuable document, not any failure", async () => {
  const outcome = await parseDocument(fixture("blank-page.pdf"), "blank-page.pdf", "application/pdf");
  assert.equal(outcome.ok, false);
  // Nothing is persisted for a blank page, so the honest consumer-side check is
  // the capability set such a row would have: no text and no figures either.
  assert.equal(needsVision({ ...capabilitiesOfStored(null) }), false);
});
