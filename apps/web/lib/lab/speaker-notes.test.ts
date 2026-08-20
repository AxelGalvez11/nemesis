import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseDocument } from "@/lib/notebooks/parse-document";

import { splitSlideContent, speakerNotesText } from "./speaker-notes";

/**
 * 🔴 A ROUND TRIP THROUGH THE REAL PARSER AND A REAL DECK, not a hand-built block array.
 *
 * The repo's own rule: a structural field needs `real file → parser → model → consumer`, because six
 * fields have died AFTER passing their producer's unit tests. This splitter reads a TEXT MARKER
 * written by `office.ts` and re-split by `pptx-model.ts`; a hand-made fixture would keep passing
 * the day either of them changes the wrapper, and the Lab would quietly stop showing any notes at
 * all while looking exactly as it does now.
 */
test("🔴 speaker notes are recovered from a real deck, through the real parser", async () => {
  const bytes = new Uint8Array(readFileSync(new URL("../notebooks/fixtures/office/notes-lecture.pptx", import.meta.url)));
  const outcome = await parseDocument(bytes, "notes-lecture.pptx", "");
  assert.ok(outcome.ok, `the fixture deck must parse; got ${outcome.ok ? "" : outcome.reason}`);
  const model = outcome.document.model;
  assert.ok(model, "the deck must produce a model");

  const withNotes = model.units
    .map((unit) => splitSlideContent(model.blocks.filter((block) => block.unit === unit.index)))
    .filter((split) => split.recovered);

  assert.ok(withNotes.length > 0, "the notes fixture must yield at least one slide with speaker notes");
  for (const split of withNotes) {
    const text = speakerNotesText(split.notes);
    assert.ok(text.length > 0, "a recovered note must have readable text once unwrapped");
    assert.ok(!text.includes("[Speaker notes:"), "the parser's wrapper is stripped for reading");
    // And the split must be a partition: nothing is duplicated into both halves.
    for (const note of split.notes) {
      assert.ok(!split.content.includes(note), "a block is slide content or a note, never both");
    }
  }
});

test("a slide with no notes reports none recovered, rather than an empty notes pane", async () => {
  const bytes = new Uint8Array(readFileSync(new URL("../notebooks/fixtures/office/plain-lecture.pptx", import.meta.url)));
  const outcome = await parseDocument(bytes, "plain-lecture.pptx", "");
  assert.ok(outcome.ok);
  const model = outcome.document.model!;
  const splits = model.units.map((unit) =>
    splitSlideContent(model.blocks.filter((block) => block.unit === unit.index)),
  );
  assert.ok(splits.every((split) => !split.recovered), "the plain deck has no speaker notes");
  assert.ok(splits.some((split) => split.content.length > 0), "but it does have slide content");
});

test("a note spanning several lines keeps every line", () => {
  const block = (text: string, unit = 0) => ({
    headingPath: [] as string[],
    id: `b${text.length}${Math.random()}`,
    kind: "paragraph" as const,
    text,
    unit,
  });
  const split = splitSlideContent([
    block("Slide title"),
    block("[Speaker notes: first sentence"),
    block("second sentence"),
    block("third sentence]"),
    block("A bullet after the notes"),
  ]);
  assert.equal(split.notes.length, 3, "all three note lines belong to the note");
  assert.equal(split.content.length, 2, "the title and the trailing bullet are slide content");
  assert.equal(speakerNotesText(split.notes), "first sentence\nsecond sentence\nthird sentence");
});
