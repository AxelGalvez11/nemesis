import assert from "node:assert/strict";
import test from "node:test";

import { parseStudyTextImport } from "./study-import.ts";

test("parses Quizlet tab-separated exports and skips duplicate terms", () => {
  const result = parseStudyTextImport("Mitosis\tCell division\nATP\tEnergy currency\nMitosis\tDuplicate", "quizlet");
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0]?.front, "Mitosis");
  assert.equal(result.delimiter, "tab");
  assert.equal(result.skipped, 1);
});

test("parses quoted multiline Anki text and preserves cloze cards", () => {
  const result = parseStudyTextImport(
    '#separator:tab\n#html:true\n"The {{c1::mitochondrion}}\nis an organelle"\t"Extra"\tbiology organelles',
    "anki",
  );
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0]?.cardType, "cloze");
  assert.deepEqual(result.cards[0]?.tags, ["biology", "organelles"]);
  assert.match(result.cards[0]?.front ?? "", /mitochondrion/);
});

test("strips basic HTML from Anki fields", () => {
  const result = parseStudyTextImport("<b>Term</b>\tDefinition<br>Second line", "anki");
  assert.deepEqual(result.cards[0], {
    back: "Definition\nSecond line",
    cardType: "basic",
    front: "Term",
    tags: [],
  });
});
