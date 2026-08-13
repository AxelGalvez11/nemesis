/**
 * A student's own notes, read — and proved all the way to a resolved locator.
 *
 * 🔴 THE DEFECT THESE GUARD. Every upload control offered `.md` and `.txt`, storage accepted
 * both, and `parsed_documents` has allowed `doc_kind = 'text'` since 2026-08-06 — but `kindFor`
 * had no branch, so `parseDocument` returned `unsupported` and stopped. Production agreed
 * exactly: four markdown files and one text file stored, zero parses between them. A student
 * could upload their notes, watch them appear, and they were never read.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { documentToText, storedDocumentModel, structureEnvelope } from "@nemesis/shared";

import { buildSourceContext, resolveQuote, unitContent } from "@/lib/sources/source-context";
import { isMarkdown, kindFor, parseDocument } from "./parse-document";
import { readTextDocument } from "./text-structure";

const bytesOf = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/text/${name}`, import.meta.url)));

// ───────────────────────────────────────────────────────── the door that led nowhere

test("🔴 .md and .txt are recognised at all — the branch that did not exist", () => {
  assert.equal(kindFor("notes.md", ""), "text");
  assert.equal(kindFor("notes.markdown", ""), "text");
  assert.equal(kindFor("lecture.txt", ""), "text");
  assert.equal(kindFor("", "text/markdown"), "text");
  assert.equal(kindFor("", "text/plain"), "text");
});

test("🔴 a .csv is still a grid, not prose — the more specific claim wins", () => {
  // Both are text. Checking `.csv` first is what stops a spreadsheet being read as paragraphs.
  assert.equal(kindFor("grades.csv", ""), "csv");
  assert.equal(kindFor("", "text/csv"), "csv");
});

test("markdown-ness comes from the file's CLAIM, never from sniffing its content", () => {
  assert.equal(isMarkdown("notes.md", ""), true);
  assert.equal(isMarkdown("", "text/markdown"), true);
  // A .txt full of hashes is a person typing hashes.
  assert.equal(isMarkdown("lecture.txt", "text/plain"), false);
});

// ───────────────────────────────────────────────────────── what the reader recovers

test("markdown headings become headings, and nest into a heading path", () => {
  const { model, title } = readTextDocument(bytesOf("notes.md"), { markdown: true });
  assert.equal(model.format, "text");
  assert.equal(title, "Contract Formation");
  assert.equal(model.units.length, 1);
  assert.equal(model.units[0]?.kind, "body", "a text file has no pages and must not claim one");

  const headings = model.blocks.filter((b) => b.kind === "heading").map((b) => b.text);
  assert.deepEqual(headings, ["Contract Formation", "Offer", "Consideration"]);

  // 🔴 THE PATH IS THE POINT. A block under "## Offer" must know it sits beneath "Contract
  // Formation" too, or a citation into it loses the section that gives it meaning.
  const revoked = model.blocks.find((b) => b.text.startsWith("May be revoked"));
  assert.ok(revoked);
  assert.deepEqual(revoked.headingPath, ["Contract Formation", "Offer"]);
  assert.equal(revoked.kind, "listItem");

  // A sibling section pops the previous one rather than nesting under it.
  const nominal = model.blocks.find((b) => b.text.startsWith("Nominal consideration"));
  assert.deepEqual(nominal?.headingPath, ["Contract Formation", "Consideration"]);
});

test("🔴 a fenced code block is opaque — its comments do not become headings", () => {
  // The fixture's Python contains `# This is a comment` and `# - not a list item either`.
  // Parsed naively both become structure, and the heading would then be inherited by every
  // block after it via `headingPath` — inventing a section the author never wrote.
  const { model } = readTextDocument(bytesOf("notes.md"), { markdown: true });
  const headings = model.blocks.filter((b) => b.kind === "heading").map((b) => b.text);
  assert.ok(!headings.some((h) => h.includes("This is a comment")), "a code comment is not a heading");
  assert.ok(!model.blocks.some((b) => b.kind === "listItem" && b.text.includes("not a list item")));

  // And the code survives whole, with its indentation, as one block.
  const code = model.blocks.find((b) => b.text.includes("def total"));
  assert.ok(code, "the code sample is kept");
  assert.equal(code.kind, "paragraph");
  assert.ok(code.text.includes("    return sum(items)"), "indentation is preserved, not reflowed");
});

test("🔴 PLAIN TEXT INFERS NOTHING — a hash in a .txt is a hash", () => {
  const { model, title } = readTextDocument(bytesOf("plain.txt"), { markdown: false });
  assert.equal(title, null, "plain text states no title, so none is invented");
  assert.equal(model.blocks.filter((b) => b.kind === "heading").length, 0);
  const hashLine = model.blocks.find((b) => b.text.includes("not a heading"));
  assert.ok(hashLine);
  assert.equal(hashLine.kind, "paragraph", "the document does not claim a heading, so we must not");
  assert.deepEqual(hashLine.headingPath, []);
});

test("a BOM and CRLF line endings do not corrupt the first block", () => {
  // The fixture is deliberately written with a UTF-8 BOM and \r\n endings, as Windows editors do.
  const { model } = readTextDocument(bytesOf("plain.txt"), { markdown: false });
  const first = model.blocks[0];
  assert.ok(first);
  assert.equal(first.text, "Lecture 4 shorthand", "no BOM character, no stray carriage return");
  assert.ok(model.blocks.every((b) => !b.text.includes("\r")));
});

// ───────────────────────────────────────────────────────── the round trip

test("🔴 real file → parseDocument → model → JSON → read back → consumer → the locator RESOLVES", async () => {
  // Six structural fields have died at this boundary AFTER passing their own parser's tests. A
  // new format that only proves its reader has proved the half that was never in doubt.
  const outcome = await parseDocument(bytesOf("notes.md"), "notes.md", "text/markdown");
  assert.ok(outcome.ok, "a markdown file must parse — it returned `unsupported` before this change");
  assert.equal(outcome.document.kind, "text");
  assert.equal(outcome.document.title, "Contract Formation");
  assert.ok(outcome.document.text.includes("invitation to treat"));

  const model = outcome.document.model;
  assert.ok(model, "the structural model must exist, not only flat text");

  // 🔴 THROUGH THE ENVELOPE AND THROUGH JSON, exactly as `persistParse` stores it. `FORMATS` is a
  // hand-written Set and a format missing from it makes `readDocumentModel` return null for the
  // WHOLE document — which reads downstream as "this parse predates the model", not as a fault.
  const stored = JSON.parse(JSON.stringify(structureEnvelope({
    model,
    text: outcome.document.text,
    title: outcome.document.title,
  })));
  const readBack = storedDocumentModel(stored);
  assert.ok(readBack, "🔴 the whole model survived the envelope — a missing FORMATS member kills it");
  assert.equal(readBack.format, "text");
  assert.equal(readBack.blocks.length, model.blocks.length, "no block dropped at the boundary");
  assert.deepEqual(
    readBack.blocks.map((b) => b.headingPath),
    model.blocks.map((b) => b.headingPath),
    "headingPath survives — it has died at this exact boundary before",
  );

  // The production consumer: `loadCanonicalSource` builds this from the stored structure.
  const context = buildSourceContext({
    coverage: outcome.document.coverage as unknown,
    sourceId: "lib-notes",
    sourceKind: "text",
    structure: stored,
  });
  // A canonical "unit" is one CITABLE BLOCK, not one page — so a text file yields as many units
  // as it has blocks, all anchored to the single body.
  assert.equal(context.units.length, readBack.blocks.length, "every block is citable");
  assert.ok(
    context.units.every((u) => u.anchor.page === 1),
    "🔴 every anchor points at the one body unit — a text file must not mint page numbers it cannot know",
  );

  // 🔴 AND THE LOCATOR RESOLVES, through the real consumer. This is the assertion that fails if
  // the model survives the boundary but its text no longer lines up with the anchor.
  const exact = "An invitation to treat is not an offer";
  const unit = context.units.find((u) => (u.text ?? "").includes(exact));
  assert.ok(unit, "the consumer can find the sentence in a citable unit");

  const content = unitContent(unit);
  assert.equal(content.kind, "text", "a text file reads as prose, not as a grid");
  assert.notEqual(
    resolveQuote(content.text, { exact, prefix: "", suffix: "" }),
    -1,
    "the quote anchor resolves against the text a citation would be built from",
  );

  // And the section that gives it meaning survived with it.
  assert.deepEqual(unit.anchor.headingPath, ["Contract Formation", "Offer"]);
});

test("a .txt round-trips too, and carries no invented structure across the boundary", async () => {
  const outcome = await parseDocument(bytesOf("plain.txt"), "plain.txt", "text/plain");
  assert.ok(outcome.ok);
  assert.equal(outcome.document.kind, "text");
  assert.equal(outcome.document.title, null);

  const model = outcome.document.model;
  assert.ok(model);
  const readBack = storedDocumentModel(
    JSON.parse(JSON.stringify(structureEnvelope({ model, text: outcome.document.text, title: null }))),
  );
  assert.ok(readBack);
  assert.equal(readBack.blocks.filter((b) => b.kind === "heading").length, 0);
  assert.ok(documentToText(readBack).includes("Second paragraph after a blank line."));
});

test("coverage says one unit, read natively — never a page count it cannot know", async () => {
  const outcome = await parseDocument(bytesOf("notes.md"), "notes.md", "text/markdown");
  assert.ok(outcome.ok);
  const coverage = outcome.document.coverage;
  assert.equal(coverage.unitKind, "document");
  assert.equal(coverage.units, 1);
  assert.equal(coverage.unitsNative, 1);
  assert.equal(coverage.unitsUnread, 0);
  assert.equal(coverage.state, "complete");
});

test("an empty text file is refused as empty, not stored as a document that says nothing", async () => {
  const outcome = await parseDocument(new Uint8Array(Buffer.from("   \n\n  ")), "blank.txt", "text/plain");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "empty");
});
