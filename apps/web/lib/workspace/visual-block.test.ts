// A designed figure is drawn from a spec the model wrote, or it is not drawn at all.
//
// Owner, 2026-09-04, with his own wondering canvas open beside ours: *"the diagrams are too big and
// also plain and boring unlike the wondering.app ones"*. Theirs are typed figures; this is the
// reader for ours, and every assertion here is a shape that must be refused rather than half drawn.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MAX_VISUAL_ITEMS, readVisualSpec, VISUAL_INSTRUCTION } from "./visual-block";
import { readModelJson } from "@/lib/model-json";

const three = {
  kind: "comparison",
  title: "Onset, peak and duration",
  rows: ["Onset", "Peak"],
  items: [
    { label: "Aspart", lines: ["10 to 20 minutes", "1 to 3 hours"] },
    { label: "Glargine", lines: ["1 to 2 hours", "None"] },
    { label: "Degludec", lines: ["30 to 60 minutes", "None"] },
  ],
  footer: { label: "All three", text: "Injected under the skin" },
};

describe("a figure is read from what the model wrote", () => {
  it("reads a comparison whole, footer and all", () => {
    const spec = readVisualSpec(three);
    assert.equal(spec?.kind, "comparison");
    assert.equal(spec?.items.length, 3);
    assert.deepEqual(spec?.rows, ["Onset", "Peak"]);
    assert.equal(spec?.footer?.text, "Injected under the skin");
  });

  it("takes the names a model reaches for, not only the ones the prompt gave", () => {
    assert.equal(readVisualSpec({ ...three, kind: "table" })?.kind, "comparison");
    assert.equal(readVisualSpec({ kind: "timeline", items: three.items })?.kind, "sequence");
    assert.equal(readVisualSpec({ kind: "pillars", items: three.items })?.kind, "set");
    // A sequence written with `columns` and a single `line` per step is the other common shape.
    const steps = readVisualSpec({ kind: "steps", columns: [{ label: "Draft", line: "A member writes it" }, { label: "Committee", line: "It is marked up" }] });
    assert.equal(steps?.items[1]?.lines[0], "It is marked up");
  });

  it("refuses what cannot be drawn honestly, instead of drawing a frame", () => {
    assert.equal(readVisualSpec({ kind: "comparison", items: [{ label: "Only one", lines: ["x"] }] }), null, "one column is a list, not a comparison");
    assert.equal(readVisualSpec({ kind: "sketch", items: three.items }), null, "an unknown kind is refused");
    assert.equal(readVisualSpec({ kind: "comparison", items: [{ lines: ["x"] }, { lines: ["y"] }] }), null, "a chip with no label is a frame");
    assert.equal(readVisualSpec("not an object"), null);
  });

  it("caps a runaway figure rather than letting it run off the card", () => {
    const many = { kind: "set", items: Array.from({ length: 12 }, (_, at) => ({ label: `Part ${at}`, line: "x" })) };
    assert.equal(readVisualSpec(many)?.items.length, MAX_VISUAL_ITEMS);
  });

  it("survives the fence the model actually writes, prose and all", () => {
    const written = `Here is how they compare.\n\n\`\`\`visual\n${JSON.stringify(three)}\n\`\`\`\n\nThe difference is the peak.`;
    const inner = written.slice(written.indexOf("```visual") + 9, written.lastIndexOf("```"));
    assert.equal(readVisualSpec(readModelJson(inner))?.items.length, 3);
  });
});

describe("the instruction and the renderer agree", () => {
  it("names the three kinds the reader accepts and no others", () => {
    for (const kind of ["comparison", "sequence", "set"]) {
      assert.ok(VISUAL_INSTRUCTION.includes(`"${kind}"`), `the prompt never mentions ${kind}`);
    }
    assert.ok(!/—/.test(VISUAL_INSTRUCTION), "the prompt bans em dashes and must not carry one");
  });

  it("is drawn by the app, never by markup the model wrote", () => {
    const figure = readFileSync(new URL("../../components/workspace/visual-figure.tsx", import.meta.url), "utf8");
    assert.ok(!figure.includes("dangerouslySetInnerHTML"), "a figure must never render model markup");
    assert.match(figure, /--ui-kind-/, "the figure imports somebody else's palette instead of ours");
  });

  it("is the fence the markdown renderer draws", () => {
    const markdown = readFileSync(new URL("./chat-markdown.tsx", import.meta.url), "utf8");
    assert.match(markdown, /language-visual/, "a ```visual fence is still just a code block");
    assert.match(markdown, /<VisualFigure spec=\{spec\} \/>/, "the figure is never mounted");
  });
});
