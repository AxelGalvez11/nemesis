import assert from "node:assert/strict";
import { test } from "node:test";

import { DECK_LAYOUTS, deckSystemPrompt, readDeckJson } from "./deck-plan";

// The border control between a chatty model and the deck builder. Same posture as the
// flashcards parser: tolerate fences and preamble, refuse junk, clamp runaways — and
// normalise structure so the theme can rely on cover-first / closing-last.

const slide = (layout: string, title: string, extra: Record<string, unknown> = {}) => ({ layout, title, ...extra });

test("a chatty, fenced reply still yields a plan; junk does not", () => {
  const plan = {
    title: "Photosynthesis",
    subtitle: "Light into life",
    slides: [
      slide("cover", "Photosynthesis", { subtitle: "Light into life" }),
      slide("bullets", "Inputs", { points: ["Light", "Water", "CO2"] }),
      slide("closing", "Recap"),
    ],
  };
  const read = readDeckJson("Sure! Here is the deck:\n```json\n" + JSON.stringify(plan) + "\n```\nEnjoy!");
  assert.ok(read);
  assert.equal(read.title, "Photosynthesis");
  assert.equal(read.slides.length, 3);
  assert.equal(readDeckJson("no json here"), null);
  assert.equal(readDeckJson('{"title":"x","slides":[]}'), null, "an empty deck is a failed generation");
  assert.equal(
    readDeckJson(JSON.stringify({ slides: [slide("bullets", "one", { points: ["a"] }), slide("bullets", "two", { points: ["b"] })] })),
    null,
    "two slides is not a deck",
  );
});

test("the structure is normalised: one cover first, one closing last, always", () => {
  const read = readDeckJson(
    JSON.stringify({
      title: "Torts",
      slides: [
        slide("bullets", "Duty", { points: ["a", "b", "c"] }),
        slide("bullets", "Breach", { points: ["a"] }),
        slide("bullets", "Causation", { points: ["a"] }),
      ],
    }),
  );
  assert.ok(read);
  assert.equal(read.slides[0]?.layout, "cover", "a deck without a cover grows one");
  assert.equal(read.slides.at(-1)?.layout, "closing", "a deck without a closing grows one");
  assert.equal(read.slides[0]?.title, "Torts", "the grown cover carries the deck's title");
});

test("vocabulary outside the theme's is coerced or dropped, never crashes the deck", () => {
  const read = readDeckJson(
    JSON.stringify({
      title: "X",
      slides: [
        slide("hero", "Invented layout", { points: ["a"] }),
        slide("bullets", "Known", { points: ["a"] }),
        slide("bullets", "Second", { points: ["a"] }),
      ],
    }),
  );
  assert.ok(read);
  assert.equal(read.slides[1]?.layout, "bullets", "an invented layout falls back to bullets");
  const known = read.slides.find((s) => s.title === "Iconed");
  const unknown = read.slides.find((s) => s.title === "Known");
});

test("runaway output is clamped, not obeyed", () => {
  const read = readDeckJson(
    JSON.stringify({
      title: "Big",
      slides: Array.from({ length: 60 }, (_, i) =>
        slide("bullets", `S${i}`, { points: Array.from({ length: 20 }, (_, j) => "p".repeat(500) + j) }),
      ),
    }),
  );
  assert.ok(read);
  assert.ok(read.slides.length <= 26, "slide count is capped");
  const body = read.slides.find((s) => s.layout === "bullets");
  assert.ok(body && body.points.length <= 6, "points per slide are capped");
  assert.ok(body && body.points.every((p) => p.length <= 220), "point length is capped");
});

test("the prompt and the reader can never drift: the prompt prints the constants", () => {
  const prompt = deckSystemPrompt();
  for (const layout of DECK_LAYOUTS) assert.ok(prompt.includes(layout), `prompt lost layout ${layout}`);
  assert.ok(prompt.includes("never invent"), "the no-invented-references rule left the prompt");
});

test("figures survive the trip, and junk figures do not", () => {
  // The exhibit layouts are only as good as the numbers reaching them, and models write
  // numbers as strings, with units glued on, and sometimes as prose.
  const read = readDeckJson(
    JSON.stringify({
      slides: [
        slide("cover", "Deck", {}),
        slide("chart", "Losses", {
          chart: "line",
          data: [
            { label: "Captured", value: 100 },
            { label: "Reflected", value: "47%" },
            { label: "Heat", value: "about a fifth" },
            { value: 12 },
            { label: "Stored", value: 4.5 },
          ],
          unit: "%",
        }),
        slide("table", "Pathways", {
          columns: ["Pathway", "Water", "Share", "Temp", "Notes", "Sixth column"],
          rows: [["C3", "High", "85%"], ["C4", "Low", "12%"], "not a row", []],
        }),
        slide("closing", "End", {}),
      ],
      title: "Deck",
    }),
  );
  const chart = read?.slides.find((s) => s.layout === "chart");
  assert.equal(chart?.chart, "line", "the chart kind was dropped");
  assert.deepEqual(
    chart?.data.map((d) => `${d.label}:${d.value}`),
    ["Captured:100", "Reflected:47", "Stored:4.5"],
    "a prose value, or an entry with no label, must not reach a chart",
  );
  const table = read?.slides.find((s) => s.layout === "table");
  assert.equal(table?.columns.length, 5, "columns are clamped to five");
  assert.equal(table?.rows.length, 2, "a row that is not an array of cells must be dropped");
});

test("the model is asked for findings and takeaways, and told where figures may come from", () => {
  const prompt = deckSystemPrompt();
  for (const layout of ["agenda", "kpi", "chart", "table"]) {
    assert.ok(prompt.includes(layout), `prompt lost the ${layout} layout`);
  }
  assert.match(prompt, /takeaway/, "the prompt no longer asks for a takeaway");
  assert.match(prompt, /FINDINGS, NOT HEADINGS/, "the prompt no longer asks for action titles");
  assert.match(prompt, /FIGURES MUST COME FROM THE PROVIDED MATERIAL/, "the prompt no longer fences invented data");
});
