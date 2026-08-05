import assert from "node:assert/strict";
import { test } from "node:test";

import { locatorPhrase, READER_ACTIONS, readerActionPrompt, type ReaderActionContext } from "./reader-actions";

const base: ReaderActionContext = {
  fileName: "Week 4 handout.pdf",
  unitLabel: "page",
  unit: 7,
  selection: "the burden must be clearly excessive",
};

test("a measured page is named in words", () => {
  assert.equal(locatorPhrase({ unitLabel: "page", unit: 7 }), " (page 7)");
  assert.equal(locatorPhrase({ unitLabel: "slide", unit: 2 }), " (slide 2)");
});

test("an unmeasured location produces no locator at all", () => {
  assert.equal(locatorPhrase({ unitLabel: "page", unit: null }), "");
  for (const action of READER_ACTIONS) {
    const prompt = readerActionPrompt(action.id, { ...base, unit: null });
    assert.ok(!/page \d/.test(prompt), `${action.id} invented a page number: ${prompt}`);
  }
});

test("every action names the file it came from", () => {
  for (const action of READER_ACTIONS) {
    const prompt = readerActionPrompt(action.id, base);
    assert.ok(prompt.includes("Week 4 handout.pdf"), `${action.id} did not name the file`);
  }
});

test("every action carries the measured page when there is one", () => {
  for (const action of READER_ACTIONS) {
    assert.ok(readerActionPrompt(action.id, base).includes("page 7"), `${action.id} dropped the page`);
  }
});

test("the selected passage is sent verbatim, never truncated", () => {
  const long = "x".repeat(4000);
  const prompt = readerActionPrompt("ask", { ...base, selection: long });
  assert.ok(prompt.includes(long), "the passage was shortened");
});

test("quotes inside a selection cannot unbalance the quoting", () => {
  const prompt = readerActionPrompt("note", { ...base, selection: 'he said "no" firmly' });
  assert.equal((prompt.match(/"/g) ?? []).length % 2, 0);
});

test("a whole-document action still names the document", () => {
  const prompt = readerActionPrompt("flashcards", { ...base, selection: null });
  assert.ok(prompt.includes("Week 4 handout.pdf"));
  assert.ok(!prompt.includes('""'));
});

test("a boxed image region is described as fractions of the picture", () => {
  const prompt = readerActionPrompt("ask", {
    fileName: "diagram.png",
    unitLabel: "image",
    unit: null,
    selection: null,
    region: { x: 0.25, y: 0.5, width: 0.2, height: 0.1 },
  });
  assert.ok(prompt.includes("25%,50%"), prompt);
  assert.ok(prompt.includes("diagram.png"));
});

test("a text selection beats a region when both somehow exist", () => {
  const prompt = readerActionPrompt("explain", { ...base, region: { x: 0, y: 0, width: 1, height: 1 } });
  assert.ok(prompt.includes("clearly excessive"));
  assert.ok(!prompt.includes("region at"));
});

test("every listed action produces a non-empty prompt in every shape", () => {
  const shapes: ReaderActionContext[] = [
    base,
    { ...base, selection: null },
    { ...base, unit: null, selection: null },
    { fileName: "scan.jpg", unitLabel: "image", unit: null, selection: null, region: { x: 0, y: 0, width: 0.5, height: 0.5 } },
  ];
  for (const action of READER_ACTIONS) {
    for (const shape of shapes) {
      const prompt = readerActionPrompt(action.id, shape);
      assert.ok(typeof prompt === "string" && prompt.trim().length > 20, `${action.id} produced "${prompt}"`);
    }
  }
});
