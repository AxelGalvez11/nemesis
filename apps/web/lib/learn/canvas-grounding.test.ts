import assert from "node:assert/strict";
import { test } from "node:test";

import { buildExcerpts, groundingBlock, quotedExcerpt } from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";

test("a plain run of paragraphs becomes numbered excerpts with stable ids", () => {
  const excerpts = buildExcerpts("s1", "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.");
  assert.deepEqual(excerpts.map((e) => e.id), ["s1:e1", "s1:e2", "s1:e3"]);
  assert.equal(excerpts[1]?.text, "Second paragraph.");
});

test("a heading the document actually had becomes the excerpt's label", () => {
  // The extractor writes "## Slide 12" for slide decks. That label is real, so we keep it.
  const excerpts = buildExcerpts("s1", "## Slide 12\n\nSodium rushes in.\n\n## Slide 13\n\nThen calcium.");
  assert.equal(excerpts[0]?.label, "Slide 12");
  assert.equal(excerpts[0]?.text, "Sodium rushes in.");
  assert.equal(excerpts[1]?.label, "Slide 13");
});

test("a label carries to every excerpt under the same heading", () => {
  const excerpts = buildExcerpts("s1", "## Slide 4\n\nOne.\n\nTwo.\n\n## Slide 5\n\nThree.");
  assert.deepEqual(excerpts.map((e) => e.label), ["Slide 4", "Slide 4", "Slide 5"]);
});

test("text with no headings gets no labels rather than invented ones", () => {
  // Nemesis cannot cite below file level today. Making up "Page 3" would be a lie.
  const excerpts = buildExcerpts("s1", "Just prose.\n\nMore prose.");
  assert.deepEqual(excerpts.map((e) => e.label), [null, null]);
});

test("a very long paragraph is split so one excerpt is never the whole document", () => {
  const excerpts = buildExcerpts("s1", "word ".repeat(3000));
  assert.ok(excerpts.length > 1);
  for (const excerpt of excerpts) assert.ok(excerpt.text.length <= 2400, `${excerpt.text.length}`);
});

test("a long paragraph is split on sentence boundaries, not mid-word", () => {
  const sentence = "This is a complete sentence about ion channels. ";
  const excerpts = buildExcerpts("s1", sentence.repeat(120));
  for (const excerpt of excerpts) assert.ok(/\.$/.test(excerpt.text.trim()), excerpt.text.slice(-40));
});

test("blank and whitespace-only stretches produce no empty excerpts", () => {
  const excerpts = buildExcerpts("s1", "One.\n\n\n\n   \n\n\nTwo.");
  assert.equal(excerpts.length, 2);
});

test("empty text yields no excerpts at all", () => {
  assert.deepEqual(buildExcerpts("s1", "   \n\n  "), []);
});

test("ids stay stable when the same text is split twice", () => {
  const text = "A.\n\nB.\n\nC.";
  assert.deepEqual(buildExcerpts("s1", text), buildExcerpts("s1", text));
});

// ------------------------------------------------------------ prompt assembly

const SOURCE: CanvasSource = {
  id: "s1",
  title: "Cardiac lecture.pdf",
  kind: "pdf",
  excerpts: [
    { id: "s1:e1", label: "Slide 1", text: "Sodium influx depolarises the cell." },
    { id: "s1:e2", label: "Slide 2", text: "Calcium sustains the plateau." },
  ],
};

test("the grounding block tags every excerpt with the id the model must cite", () => {
  const text = groundingBlock([SOURCE]);
  assert.match(text, /\[s1:e1\]/);
  assert.match(text, /\[s1:e2\]/);
  assert.match(text, /Sodium influx depolarises the cell\./);
});

test("the grounding block names the source so the model knows what it is reading", () => {
  assert.match(groundingBlock([SOURCE]), /Cardiac lecture\.pdf/);
});

test("the grounding block includes the label the document gave the excerpt", () => {
  assert.match(groundingBlock([SOURCE]), /Slide 2/);
});

test("a half-read document says so in the grounding block", () => {
  // Otherwise the model reasons confidently from an absence and nobody can tell.
  const partial: CanvasSource = { ...SOURCE, coverageNote: "40 of 300 pages could be read." };
  assert.match(groundingBlock([partial]), /40 of 300 pages/);
});

test("no sources yields an empty grounding block, not a fake one", () => {
  assert.equal(groundingBlock([]), "");
});

test("grounding is capped so one enormous lecture cannot blow the context budget", () => {
  const huge: CanvasSource = {
    ...SOURCE,
    excerpts: Array.from({ length: 5000 }, (_, i) => ({
      id: `s1:e${i + 1}`,
      label: null,
      text: "A sentence about the heart that is reasonably long.",
    })),
  };
  const text = groundingBlock([huge]);
  assert.ok(text.length <= 130_000, `${text.length}`);
  assert.match(text, /not included/i);
});

test("quotedExcerpt returns the real text behind a citation", () => {
  const found = quotedExcerpt([SOURCE], { sourceId: "s1", excerptId: "s1:e2" });
  assert.equal(found?.excerpt.text, "Calcium sustains the plateau.");
  assert.equal(found?.source.title, "Cardiac lecture.pdf");
});

test("a citation pointing at nothing resolves to nothing rather than a plausible guess", () => {
  assert.equal(quotedExcerpt([SOURCE], { sourceId: "s1", excerptId: "s1:e99" }), null);
  assert.equal(quotedExcerpt([SOURCE], { sourceId: "s9", excerptId: "s1:e1" }), null);
});
