import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasBrief, canvasHasMaterial, readCardsJson, readDeliverableAsk } from "./canvas-deliverables";
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

test("an unmistakable ask is read; anything ambiguous falls through to the ordinary turn", () => {
  // Owner 2026-08-25: "if you ask them to make a PowerPoint, then it'll do it for you." The
  // cost of a false match is a stolen turn, so ambiguity always loses.
  assert.equal(readDeliverableAsk("Make me a PowerPoint about the French Revolution"), "slides");
  assert.equal(readDeliverableAsk("can you create a slide deck on mitosis?"), "slides");
  assert.equal(readDeliverableAsk("please generate a presentation for my seminar"), "slides");
  assert.equal(readDeliverableAsk("make flashcards from this chapter"), "flashcards");
  assert.equal(readDeliverableAsk("create a summary note of what we covered"), "note");

  assert.equal(readDeliverableAsk("How do I make a good presentation?"), null, "advice, not an order");
  assert.equal(readDeliverableAsk("What makes a strong slide deck?"), null);
  assert.equal(readDeliverableAsk("Why do presentations use so many bullet points?"), null);
  assert.equal(readDeliverableAsk("Tell me about the French Revolution"), null);
  assert.equal(readDeliverableAsk("The presentation of symptoms varies"), null, "noun without a make-verb");
});

test("slides are the generalist deliverable: grounded when material exists, model knowledge when not", () => {
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.ok(source.includes("makeSlidesDeliverable"), "the slides maker is gone");
  assert.match(source, /grounded\s*\?\s*canvasBrief/, "a grounded canvas no longer feeds the deck its material");
  assert.ok(source.includes("no attached material"), "the ungrounded path lost its honest framing");
  assert.match(source, /plan\.references = grounded/, "references no longer come from the canvas's own sources");
  assert.match(source, /kind: "generated_slides"/, "slides left the assets ledger");
  assert.ok(source.includes("deck: plan"), "the plan no longer rides the canvas output — downloads would have nothing to rebuild from");
});

/** The card writer's system prompt, with its own comments stripped so the guards read the
 *  INSTRUCTION and never the reasoning written beside it. */
const CARDS_PROMPT = (() => {
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("const CARDS_SYSTEM"), source.indexOf('labelled diagram.";') + 20);
  const code = block.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  // 🔴 WHITESPACE NORMALISED, because the prompt is concatenated string fragments: a sentence that
  //    spans two source lines arrives with a double space, and a guard written against the sentence
  //    as a human reads it would fail for a reason that has nothing to do with the prompt.
  return [...code.matchAll(/"([^"]*)"|'([^']*)'/g)].map((hit) => hit[1] ?? hit[2] ?? "").join(" ").replace(/\s+/g, " ");
})();

test("🔴🔴 the card writer is told ONE FACT PER CARD, and to split a list", () => {
  // Owner, 2026-08-30: *"does it try to make flashcards as atomic as possible?"* It did not. The
  // prompt asked for "10 to 16 cards that cover the material's core ideas" and said nothing about
  // shape, so the model wrote "name the three types of X" with a three-item answer. That is the
  // card spaced repetition handles worst: recall two of three and NO grade is honest, so the
  // schedule learns nothing from the press. Splitting is free at write time and impossible later.
  assert.match(CARDS_PROMPT, /ONE FACT PER CARD/, "the card writer is not asked for atomic cards");
  assert.match(CARDS_PROMPT, /write one card for each item instead/, "a list answer is still allowed to stay one card");
  assert.match(CARDS_PROMPT, /never put a paragraph on the back/, "the back may be a paragraph again");

  // 🔴🔴 THE SPLIT RULE HAS A FLOOR, AND ONLY A LIVE RUN FOUND IT. Asked for atomic cards on a
  // four-stroke engine, the model split the parts list into seven of these: "The {{c1::piston}} is
  // a labelled part of the cylinder assembly." Atomic, well-formed, and worth nothing — and they
  // duplicated the very parts the occlusion figure was about to cover properly.
  assert.match(CARDS_PROMPT, /Split a list only when each item carries its OWN fact/, "a bare enumeration can become cards again");
  assert.match(CARDS_PROMPT, /NO cards about those parts at all, in any form/, "a diagram's parts can be written as text cards again");

  // 🔴 ONE FORM PER FACT, also from a live run: given both forms the model used BOTH, and half the
  // engine deck was cloze restatements of its own questions. Two schedules for one memory.
  assert.match(CARDS_PROMPT, /Each fact appears ONCE, in one form/, "a fact may be written twice again");

  // 🔴 THE PARSER'S CAP IS A SAFETY LIMIT, NOT THE RULE. Lowering it to enforce atomicity would
  // cut answers off mid-sentence, which is worse than a long one. The instruction does this job.
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /back\.slice\(0, 1000\)/, "the safety cap moved — check it is not doing the prompt's job");
});

test("🔴🔴 a labelled diagram TRIGGERS image occlusion rather than merely permitting it", () => {
  // Owner, same message: *"does DeepSeek know to use image occlusion when it would be helpful for
  // visual labeling?"* It was told, but as permission ("you may instead reply"), which a model
  // reads as an option and usually declines. A labelled diagram is exactly the material a written
  // card serves badly, so the trigger is the material having one.
  assert.match(CARDS_PROMPT, /When the material has a LABELLED DIAGRAM/, "the occlusion path lost its trigger");
  assert.doesNotMatch(CARDS_PROMPT, /you may instead reply/, "the occlusion path is optional again");
  assert.match(CARDS_PROMPT, /one image card\s+per labelled part/, "the model is not told what the figure becomes");

  // 🔴 THE EXAMPLES SPAN FIELDS ON PURPOSE. This product is field-agnostic, and a diagram list that
  // read as anatomy-only would quietly scope occlusion to one subject — the exact shape of mistake
  // `keyword-scoping-hides-in-prompts` records. Structure (labelled parts) is the test, not topic.
  for (const kind of ["anatomy", "a circuit", "a map", "an engine"]) {
    assert.ok(CARDS_PROMPT.includes(kind), `the diagram examples narrowed and dropped ${kind}`);
  }
});

test("🔴 no em dashes reach the model, by owner rule", () => {
  assert.equal(CARDS_PROMPT.includes("—"), false, "an em dash is back in the card prompt");
});


test("🔴🔴 cloze is reachable: the writer knows the syntax and the row is typed by the marker", () => {
  // Owner, 2026-08-30: *"make sure it can do cloze deletion on its own."* Both halves were missing.
  // `study-cloze.ts` has parsed {{c1::...}} since the Study tab shipped and `review-session.tsx`
  // auto-detects it even on a card typed basic, but the writer was never told the syntax existed,
  // and `makeFlashcardsDeliverable` hard-coded card_type "basic" — so no generated deck had ever
  // contained one, and had one appeared the stored row would have lied about what it was.
  assert.match(CARDS_PROMPT, /\{\{c1::the phrase\}\}/, "the writer is not told the cloze syntax");
  assert.match(CARDS_PROMPT, /never c2 or c3/, "a card may hide several things again");

  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /card_type: hasCloze\(card\.front\) \? "cloze" : "basic"/, "the row no longer types itself from the marker");

  // 🔴 ONE c1 PER CARD IS THE ATOMICITY RULE AGAIN, NOT A SEPARATE ONE. `activeClozeNumber` rotates
  // which blank is hidden by the card's repetition count, so a card carrying c1/c2/c3 is three
  // facts sharing one schedule: its interval reflects whichever blank happened to come up.
  const cloze = readFileSync(new URL("../workspace/study-cloze.ts", import.meta.url), "utf8");
  assert.match(cloze, /export function activeClozeNumber/, "the rotation this rule exists for is gone");
});

test("🔴🔴🔴 \"make a document\" makes a document, and a document parser is still a question", () => {
  // Owner, 2026-09-02: *"I asked it to make a document and it literally did not, it just gave me
  // reasoning out loud and no action, like what the heck."* This list matched slides, flashcards and
  // study notes and NOT the most obvious word of the lot, so the ask fell through to an ordinary
  // turn. Three prompt fixes chased the model's words before anyone read this function; each
  // improved what it said and none could make a file, because the door was here.
  assert.equal(readDeliverableAsk("make a document on it"), "document");
  assert.equal(readDeliverableAsk("create a document about the lecture"), "document");
  assert.equal(readDeliverableAsk("write a document on ohms law"), "document");
  assert.equal(readDeliverableAsk("make a document"), "document");

  // 🔴 AND THE LOOKAHEAD EARNS ITS KEEP, BECAUSE "DOCUMENT" IS ALSO AN ADJECTIVE. Nemesis is
  // field-agnostic (CLAUDE.md), so a computer-science student asking about parsing must not have
  // their turn stolen by a file. The noun counts only when the phrase ends on it or turns to what
  // the document is ABOUT.
  assert.equal(readDeliverableAsk("build a document parser"), null);
  assert.equal(readDeliverableAsk("give me an example of a document store"), null);
  assert.equal(readDeliverableAsk("how do I make a document?"), null);

  // Unchanged, and pinned here so widening the verbs cannot quietly widen these too.
  assert.equal(readDeliverableAsk("make me a powerpoint on this"), "slides");
  assert.equal(readDeliverableAsk("create flashcards for this"), "flashcards");
  assert.equal(readDeliverableAsk("make a note of that"), null);
  // 🔴 A REPORT IS STILL THE MODEL'S CALL, NOT A REGEX'S. `readResearchAsk` was deleted for good
  // reasons this file records at length; "turn that into a report" belongs to `wantsReport`.
  assert.equal(readDeliverableAsk("turn that into a report"), null);
});

// ---------------------------------------------------------------- the attached files reach the file

/** The owner's canvas of 2026-09-02, in miniature: a lecture transcript dropped in as caption
 *  lines, no taught blocks, and one throwaway exchange. Real lines from the lecture, because the
 *  point of the test is that the DOCUMENT is about COPD and not about the canvas's title. */
function canvasWithLecture() {
  const canvas = newCanvas();
  canvas.title = "Still fired up to be here";
  canvas.sources.push({
    durability: "ephemeral",
    excerpts: [
      "Still fired up to be here.",
      "Thank you for coming out early.",
      "Remember, GOLD guidelines are for COPD.",
      "Protease activity also causes alveolar destruction.",
      "A diagnostic threshold of FEV to an FVC ratio",
      "of less than percent is diagnostic of obstructive lung disease.",
      "LABA-ICS combos are discouraged in COPD now.",
      "The hallmark of improving symptoms and outcomes in COPD is stopping smoking.",
    ].map((text, index) => ({ id: `s1:e${index + 1}`, label: null, text })),
    id: "s1",
    kind: "text",
    title: "Still fired up to be here",
  } as unknown as (typeof canvas.sources)[number]);
  canvas.moments.push({
    assistantText: "Thanks for sharing the transcript. What would you like to do with it?",
    id: "m1",
    kind: "assistant",
    userText: "this is transcript from lecture",
  } as unknown as (typeof canvas.moments)[number]);
  return canvas;
}

test("a dropped-in lecture reaches the writer, instead of only the canvas's title", () => {
  // Owner, 2026-09-02: "i dropped in my lecture transcript and i dont think it read it well.
  // because i asked for a document and it was not related at all." The transcript had parsed
  // perfectly — 2,530 excerpts — and none of it was in the prompt. The document that came back was
  // an essay about the phrase "still fired up to be here", which was the canvas's title and the
  // only subject the model was given.
  const brief = canvasBrief(canvasWithLecture());
  assert.ok(brief.includes("Protease activity also causes alveolar destruction."), "the material is not in the brief");
  assert.ok(brief.includes("LABA-ICS combos are discouraged in COPD now."), "later material is not in the brief");
  assert.ok(
    brief.includes("of less than percent is diagnostic of obstructive lung disease."),
    "the brief stops partway through the material",
  );
});

test("attached files are material on their own — no chatter required", () => {
  // This canvas passed the gate only by accident, on the throwaway reply Nemesis happened to have
  // made. Drop a file, say nothing, ask for a document: that must not refuse.
  const canvas = canvasWithLecture();
  canvas.moments.length = 0;
  assert.equal(canvas.blocks.length, 0);
  assert.equal(canvasHasMaterial(canvas), true, "a canvas holding only an attached file refuses to make anything");
});

test("material bound for a file carries no citation ids to copy", () => {
  // A Word file, a PDF and a flashcard have nothing that resolves [s1:e4] into a pill, and a model
  // writes back the markers it is shown. Owner, 2026-08-31: "it's also made up citations."
  const brief = canvasBrief(canvasWithLecture());
  assert.ok(!/\[s\d+:e\d+\]/.test(brief), "excerpt ids are being shown to a writer whose output cannot resolve them");
});

test("caption lines are joined into running text, not scattered by blank lines", () => {
  // A lecture transcript arrives one caption per excerpt — the owner's averaged 29 characters
  // across 2,530 of them. Blank lines between every fragment burn the budget and read as thousands
  // of disconnected statements rather than a lecture.
  const brief = canvasBrief(canvasWithLecture());
  assert.ok(
    brief.includes("Thank you for coming out early.\nRemember, GOLD guidelines are for COPD."),
    "consecutive caption lines are not being joined into running text",
  );
});
