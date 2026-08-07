/**
 * Phase 7, re-run against the INTEGRATED pipeline rather than one parser.
 *
 * 🔴 THE ORIGINAL HARDENING PASS TESTED `readPdfStructure` AND `extractDocxText`
 * IN ISOLATION, AND SAID SO. That found three real defects, and it could not
 * have found a fourth kind: something that survives the parser and then breaks
 * the stage after it. A document is not "handled" because it parsed — it has to
 * chunk, carry provenance, produce facts, and build artifacts without any stage
 * quietly inventing, dropping, or crashing on what the stage before it produced.
 *
 * So each fixture below goes the whole way:
 *
 *     bytes -> parseDocument -> model -> chunkDocument -> chunk rows
 *                                    -> extractFacts   -> artifacts
 *
 * The database half of that path is proven separately, against a real Postgres,
 * by `scripts/phase4-index-roundtrip.mts`. A mock here would only agree with
 * whatever this file asserted.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  chunkDocument,
  chunkedText,
  describeLocator,
  extractFacts,
  proposeArtifacts,
  type DocFact,
} from "@nemesis/shared";

import { parseDocument } from "./parse-document";
import { chunkRowsFor } from "./source-chunks";

const describe = (fact: DocFact) => describeLocator(fact.locator);
const samplePdf = () => new Uint8Array(readFileSync("public/reader-sample.pdf"));

/** Everything after the parse, so a fixture is one call away from the whole path. */
function downstream(model: Parameters<typeof chunkDocument>[0]) {
  const chunks = chunkDocument(model);
  const rows = chunkRowsFor(model, chunks);
  const facts = extractFacts(model);
  const artifacts = proposeArtifacts(model, describe, facts);
  return { artifacts, chunks, facts, rows };
}

test("a real document survives every stage with its provenance intact", async () => {
  const outcome = await parseDocument(samplePdf(), "sample.pdf", "application/pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const model = outcome.document.model;
  assert.ok(model, "the structural reader produced no model");

  const { artifacts, chunks, rows } = downstream(model!);
  assert.ok(chunks.length > 0);
  assert.equal(rows.length, chunks.length);

  for (const row of rows) {
    assert.ok(row.content.length > 0, "a chunk row with no content");
    // 🔴 A PAGE NUMBER ONLY WHERE THE FORMAT HAS PAGES. This is the whole
    // no-fabricated-locator rule, checked at the row that reaches the database.
    if (row.unit_kind === "document") assert.equal(row.unit_index, null);
    else assert.ok(typeof row.unit_index === "number" && row.unit_index >= 0);
  }
  for (const artifact of [...artifacts.cards, ...artifacts.events, ...artifacts.schemes]) {
    assert.ok(artifact.provenance.blockIds.length > 0);
  }
});

test("chunking a real document loses none of its text", async () => {
  const outcome = await parseDocument(samplePdf(), "sample.pdf", "application/pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok || !outcome.document.model) return;
  const joined = chunkedText(chunkDocument(outcome.document.model));
  // Sampled rather than compared whole: chunk joins normalise whitespace, and a
  // character-exact comparison would fail on a difference nobody can observe.
  for (const block of outcome.document.model.blocks.slice(0, 20)) {
    const text = block.text.trim();
    if (text.length < 20 || block.kind === "figure") continue;
    assert.ok(joined.includes(text), `chunking dropped: ${text.slice(0, 60)}`);
  }
});

test("a document that will not parse never reaches the stages after it", async () => {
  // The failure has to stop at the verdict. A parser that returns `ok: false`
  // and a caller that reads `.document.model` anyway is a crash one stage later,
  // with a message about chunking for a problem with the file.
  const outcome = await parseDocument(new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]), "broken.pdf", "application/pdf");
  assert.equal(outcome.ok, false);
});

test("an empty document produces no chunks and no artifacts, and does not throw", () => {
  const empty = { blocks: [], format: "pdf" as const, title: null, units: [] };
  const { artifacts, chunks, facts, rows } = downstream(empty);
  assert.equal(chunks.length, 0);
  assert.equal(rows.length, 0);
  assert.equal(facts.length, 0);
  assert.equal(artifacts.cards.length, 0);
  assert.equal(artifacts.events.length, 0);
});

test("a block far larger than the chunk target stays whole through the whole path", () => {
  // 🔴 NEVER SOLVE CAPACITY BY SILENTLY DELETING CONTENT. A 20,000-character
  // paragraph is real — a licence, a wall of a statute, a transcript with no
  // paragraph breaks — and the two tempting answers are both lies: splitting it
  // produces text under the wrong heading, dropping it loses the content.
  const giant = "x".repeat(20_000);
  const model = {
    blocks: [
      { headingPath: [], id: "b0", kind: "heading" as const, level: 1, text: "One long section", unit: 0 },
      { headingPath: ["One long section"], id: "b1", kind: "paragraph" as const, text: giant, unit: 0 },
    ],
    format: "pdf" as const,
    title: null,
    units: [{ index: 0, kind: "page" as const }],
  };
  const { chunks, rows } = downstream(model);
  const oversized = chunks.find((chunk) => chunk.oversized);
  assert.ok(oversized, "the oversized block was split or dropped");
  assert.ok(rows.some((row) => row.content.includes(giant)), "the text did not survive to the row");
});

test("a document with thousands of tiny blocks does not explode into a row each", () => {
  // The other end of the same rule: a slide deck exported as one line per bullet
  // must not become one chunk per bullet, or retrieval returns fragments with no
  // context and the embedding bill is the number of lines.
  const model = {
    blocks: Array.from({ length: 3_000 }, (_, index) => ({
      headingPath: ["Bullets"],
      id: `b${index}`,
      kind: "listItem" as const,
      text: `Point number ${index} in a very long list of points.`,
      unit: 0,
    })),
    format: "pdf" as const,
    title: null,
    units: [{ index: 0, kind: "page" as const }],
  };
  const { chunks } = downstream(model);
  assert.ok(chunks.length < 300, `${chunks.length} chunks from 3,000 short blocks`);
  assert.ok(chunks.length > 0);
});

test("a block whose text is only whitespace produces no row at all", () => {
  const model = {
    blocks: [
      { headingPath: [], id: "b0", kind: "paragraph" as const, text: "   \n\t  ", unit: 0 },
      { headingPath: [], id: "b1", kind: "paragraph" as const, text: "Real content that should survive.", unit: 0 },
    ],
    format: "pdf" as const,
    title: null,
    units: [{ index: 0, kind: "page" as const }],
  };
  const { rows } = downstream(model);
  // An empty row would be embedded, stored, and returned as a search hit with
  // nothing in it — which reads as a document that contains blank pages.
  assert.ok(rows.every((row) => row.content.trim().length > 0));
});

test("a Word document never acquires a page number anywhere in the pipeline", () => {
  const model = {
    blocks: [
      { headingPath: [], id: "b0", kind: "heading" as const, level: 1, text: "Terms", unit: 0 },
      { headingPath: ["Terms"], id: "b1", kind: "paragraph" as const, text: "Offer — a manifestation of willingness to bargain.", unit: 0 },
      { headingPath: ["Terms"], id: "b2", kind: "paragraph" as const, text: "Acceptance — assent to the terms of an offer.", unit: 0 },
      { headingPath: ["Terms"], id: "b3", kind: "paragraph" as const, text: "Consideration — a bargained-for exchange.", unit: 0 },
    ],
    format: "docx" as const,
    title: null,
    units: [{ index: 0, kind: "body" as const }],
  };
  const { artifacts, rows } = downstream(model);
  for (const row of rows) {
    assert.equal(row.unit_kind, "document");
    assert.equal(row.unit_index, null);
  }
  for (const card of artifacts.cards) {
    assert.equal(card.provenance.unit, undefined);
    assert.ok(!/page/i.test(card.provenance.where));
  }
});

test("a block claiming a unit the document does not have cannot produce a locator", () => {
  // The shape a corrupted or hand-edited `structure` row would take. The stored
  // envelope validator rejects it; this checks the stage after that, so a row
  // reaching the pipeline some other way still cannot become a citation that
  // points at nothing — which passes every later check of it.
  const model = {
    blocks: [{ headingPath: [], id: "b0", kind: "paragraph" as const, text: "Text on a page that is not there.", unit: 7 }],
    format: "pdf" as const,
    title: null,
    units: [{ index: 0, kind: "page" as const }],
  };
  const { rows } = downstream(model);
  // `unitKind` falls back to `body`, which renders as no unit at all rather than
  // as "page 8".
  assert.ok(rows.every((row) => row.unit_kind === "document" && row.unit_index === null));
});
