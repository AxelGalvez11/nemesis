import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { KIND_MARKS, fileKind, fileMark } from "./kind-mark";

// 🔴🔴 REPORTED 2026-09-03: *"the inputs need to have a unique icon depending on whether it's a
// docx, PowerPoint, Excel etc."* Every row in the sources panel drew `name="file"`, so a shelf of
// thirty attachments was thirty identical rows.

test("🔴🔴 the reported case: each format gets its own glyph, and no two share one", () => {
  const seen = new Map<string, string>();
  for (const [name, expected] of [
    ["08-insulin.pdf", "pdf"],
    ["24-pgx-questions.docx", "document"],
    ["31-pgx-lecture3.pptx", "slides"],
    ["beam-deflection-lab.xlsx", "sheet"],
    ["study-hours.csv", "sheet"],
    ["30-readme.md", "text"],
    ["notes.txt", "text"],
    ["whiteboard.png", "image"],
    ["lecture-recording.m4a", "audio"],
  ] as const) {
    assert.equal(fileKind(name), expected, name);
    const icon = fileMark(name).icon;
    const already = seen.get(icon);
    // `document` and `text` are allowed to share a tint (both blue) but never a glyph.
    assert.ok(!already || already === expected, `${expected} and ${already} both draw "${icon}"`);
    seen.set(icon, expected);
  }
});

test("🔴 case and the reader's own list are both respected", () => {
  // 🔴 STRUCTURAL, NEVER SUBJECT MATTER (CLAUDE.md). This reads an extension, so it reads the same
  // for a law student's brief and a mechanical engineer's tolerance chart.
  assert.equal(fileKind("Week 4.PPTX"), "slides");
  assert.equal(fileKind("Palsgraf v. Long Island R.R..pdf"), "pdf");
  assert.equal(fileKind("Kapitel 3.docx"), "document");
  // Straight from `readerKind`, so the shelf and the reader agree about what a file is.
  assert.equal(fileKind("scan.heic"), "image");
  assert.equal(fileKind("macros.xlsm"), "sheet");
});

test("🔴 an unknown extension gets the quiet grey mark, never a confident wrong colour", () => {
  // A wrong colour is worse than no colour: green says "spreadsheet" about something nobody has
  // identified.
  assert.equal(fileKind("archive.zip"), "file");
  assert.equal(KIND_MARKS.file.tint, "--ui-text-quaternary");
  assert.equal(KIND_MARKS.file.icon, "file");
});

test("🔴🔴 a canvas written before names were kept still gets the right icon", () => {
  // Every canvas written before 2026-09-03 had its source titles prettified — `08-insulin.pdf`
  // became `08 insulin` — so the extension is gone for good on 81 sources across 28 canvases
  // (counted on production). `CanvasSource.kind` is what the extractor called the file, and it is
  // the only thing left to read there. Without this fallback the fix would look broken on exactly
  // the canvases the owner opens.
  assert.equal(fileKind("08 insulin", "pdf"), "pdf");
  assert.equal(fileKind("31 pgx lecture3", "pptx"), "slides");
  assert.equal(fileKind("24 pgx questions", "docx"), "document");
  assert.equal(fileKind("a photo", "image"), "image");
  // A name with a dot in it is still read by its extension, and the declared kind is not consulted.
  assert.equal(fileKind("08-insulin.pdf", "image"), "pdf");
});

test("🔴 a name with no dot at all is not treated as its own extension", () => {
  // `"insulin notes".split(".").pop()` returns the whole string, which would make "insulin notes"
  // an extension and match nothing — silently, and only for files with no extension.
  assert.equal(fileKind("insulin notes"), "file");
  assert.equal(fileKind("pdf"), "file");
  assert.equal(fileKind(""), "file");
});

test("🔴🔴 the shelf and the artifact card draw from ONE record, not two", () => {
  // Calibration: give `artifact-card.tsx` its own literal glyphs back and this reddens.
  //
  // The whole point of the report is that a learner should be able to tell a deck from a
  // spreadsheet at a glance — which only works if the deck Nemesis MADE and the deck they ATTACHED
  // look the same. Two tables would agree today and drift the first time either was adjusted.
  const card = readFileSync(new URL("../../components/workspace/learn/artifact-card.tsx", import.meta.url), "utf8");
  assert.match(card, /KIND_MARKS/, "the artifact card went back to its own private glyph table");
  for (const [output, mark] of [
    ["document", "document"],
    ["note", "text"],
    ["pdf", "pdf"],
    ["sheet", "sheet"],
    ["slides", "slides"],
  ] as const) {
    assert.match(
      card,
      new RegExp(`${output}: \\{ extension: "[a-z]*", \\.\\.\\.KIND_MARKS\\.${mark} \\}`),
      `the produced ${output} stopped matching an attached one`,
    );
  }
});

test("🔴 both source surfaces draw the mark, or one of them is still a wall of identical rows", () => {
  // The shelf the owner reported, and the reading pane's tab strip, where six documents truncate
  // to 220px each and the glyph is most of what distinguishes them.
  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  // 🔴 THE STRIP MOVED TO `dock-switcher.tsx` when documents and artifacts became one sidebar
  // (owner, 2026-09-03), and became a dropdown a few hours later when the owner asked for the tabs
  // and the icons on one row. The mark moved with it both times. Reading `source-preview.tsx` for
  // it now would pass on an empty search and say nothing about what a learner sees.
  const tabs = readFileSync(new URL("../../components/workspace/learn/dock-switcher.tsx", import.meta.url), "utf8");
  assert.match(controls, /fileMark\(source\.title, source\.kind\)/, "the sources shelf is back to one glyph for everything");
  assert.match(tabs, /fileMark\(item\.source\.title, item\.source\.kind\)/, "the sidebar's document rows are back to one glyph for everything");
  // 🔴 AN ARTIFACT TAB WEARS ITS KIND TOO. A study guide, a deck and a spreadsheet sit in the same
  // strip as the lectures now, and giving only the documents a mark would make the artifacts the
  // wall of identical rows this test exists to prevent.
  assert.match(tabs, /fileMark\(item\.output\.title, item\.output\.kind\)/, "artifact rows draw one glyph for everything");
  assert.ok(!/name="file"\s+size="14px"/.test(tabs), "the switcher still hard-codes the generic page glyph");
});

test("🔴🔴 a coverage note may not evict the file name from its own row", () => {
  // Measured on the owner's canvas 2026-09-03: three rows of thirty showed no name at all, just a
  // glyph and "Incomplete source: 14 pictures were not read. If the student…" running off the edge.
  // The note is written for the MODEL (`coverageNoticeForModel`) and is a sentence, so an
  // unshrinkable one took the whole row and the truncating name beside it collapsed to zero.
  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  // 🔴 REPOINTED 2026-09-03: the condition gained the learner's spelling of the same disclosure
  // (`coverageLabel ?? coverageNote`), so a regex anchored on `coverageNote &&` stopped matching.
  // The property is unchanged: whatever renders the disclosure must shrink and truncate, or it
  // evicts the name the row exists to show.
  const note = /coverage(?:Label \?\? source\.coverageNote|Note)\) && \(\s*<span\s+className="([^"]+)"/.exec(controls);
  const classes = note?.[1] ?? "";
  assert.ok(note, "the coverage note's row treatment could not be found");
  assert.ok(!classes.includes("shrink-0"), "the coverage note is unshrinkable again, so it deletes the file name");
  assert.match(classes, /truncate/, "the coverage note runs off the row instead of truncating");
  // 🔴 AND A CAP, OR "TRUNCATE" ALONE STILL LOSES. Two shrinkable items share the row in proportion
  // to their natural widths, and a sentence beats a file name every time — measured live on
  // production: with `min-w-0 truncate` and no cap, the name still collapsed to "21…".
  assert.match(classes, /max-w-\[\d+%\]/, "the coverage note has no width cap, so it still crowds out the name");
});
