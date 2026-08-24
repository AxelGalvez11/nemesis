import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasBrief, canvasHasMaterial, readCardsJson } from "./canvas-deliverables";
import { newCanvas } from "./canvas-store";

// The deliverables seam: a chatty model on one side, three real stores on the other. The
// parser is where bad rows would come from, so it gets the adversarial cases; the wiring
// guards pin the owner's explicit "both places" requirement.

test("readCardsJson reads fenced, prefixed and suffixed replies, and refuses junk", () => {
  const cards = [
    { back: "Powerhouse of the cell.", front: "What is the mitochondrion?" },
    { back: "ATP.", front: "Main energy currency?" },
    { back: "Krebs cycle.", front: "Cycle after glycolysis?" },
  ];
  const clean = JSON.stringify(cards);
  assert.equal(readCardsJson(clean)?.length, 3);
  assert.equal(readCardsJson("Here you go!\n```json\n" + clean + "\n```\nEnjoy.")?.length, 3, "fences and chatter");
  assert.equal(readCardsJson("not json at all"), null);
  assert.equal(readCardsJson("[1, 2, 3]"), null, "an array of the wrong thing is refused");
  assert.equal(readCardsJson('{"front":"a","back":"b"}'), null, "a bare object is not a deck");
  assert.equal(readCardsJson(JSON.stringify(cards.slice(0, 2))), null, "two cards is a failed generation, not a deck");
});

test("readCardsJson clamps runaway cards instead of writing them", () => {
  const long = readCardsJson(
    JSON.stringify([
      { back: "b".repeat(5000), front: "f".repeat(5000) },
      { back: "b", front: "f" },
      { back: "b2", front: "f2" },
    ]),
  );
  assert.ok(long);
  const first = long[0];
  assert.ok(first && first.front.length <= 300 && first.back.length <= 1000);
  const many = readCardsJson(JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ back: `b${i}`, front: `f${i}` }))));
  assert.equal(many?.length, 40, "a model that never stops is cut off, not obeyed");
});

test("an empty canvas makes nothing — no call, no confident filler", () => {
  const canvas = newCanvas();
  assert.equal(canvasHasMaterial(canvas), false);
  canvas.blocks.push({ content: "Cells respire.", id: "b1", type: "explanation" } as unknown as (typeof canvas.blocks)[number]);
  assert.equal(canvasHasMaterial(canvas), true);
  assert.ok(canvasBrief(canvas).includes("Cells respire."));
  assert.ok(canvasBrief(canvas).length <= 7000);
});

test("a deck lands in BOTH places the owner named: the library's tables and the canvas's outputs", () => {
  // Owner 2026-08-25: "the study deck should land in the library, but it should also land in
  // the output section of the Canvas as well."
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /from\("study_decks"\)\s*\n?\s*\.insert/, "the deck no longer lands in the real study tables");
  assert.match(source, /from\("study_cards"\)\.insert/, "the cards no longer land in the real study tables");
  assert.ok(source.includes("deckId,"), "the canvas output entry lost its deck reference");
  assert.ok(source.includes("writeLibraryNote"), "notes no longer land in the library's documents");
  assert.match(source, /from\("assets"\)/, "the §12 ledger is no longer written");
  assert.match(source, /from\("canvas_outputs"\)\.insert/, "the canvas↔asset join is no longer written");

  const controls = readFileSync(new URL("../../components/workspace/learn/canvas-controls.tsx", import.meta.url), "utf8");
  assert.ok(controls.includes("onMakeDeliverable"), "the Outputs tab lost its make actions");
  assert.match(controls, /library\/classic\?note=/, "a note output no longer opens the reader");
  assert.match(controls, /library\?deck=/, "a deck output no longer opens the Library");

  const page = readFileSync(new URL("../../app/(workspace)/library/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("LibraryOutputs"), "/library stopped being the outputs home");
  assert.ok(!page.includes("<CanvasManager"), "/library went back to managing canvases — the sidebar does that now");
});
