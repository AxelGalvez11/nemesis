import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasBrief, canvasHasMaterial, readCardsJson, readDeliverableAsk, cardsAskNote } from "./canvas-deliverables";
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
  // Named for the invariant, not the helper: retrieval renamed the grounded arm to `canvasBriefFor`
  // and this guard tripped on the rename rather than on a behaviour change.
  assert.match(source, /grounded\s*\?\s*await canvasBriefFor/, "a grounded canvas no longer feeds the deck its material");
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

test("🔴🔴 the card writer follows the owner's rule sheet: one recall target, vertical lists, both forms", () => {
  // Owner, 2026-08-30: *"does it try to make flashcards as atomic as possible?"* The first answer
  // to that was "ONE FACT PER CARD, split every list", and it produced four cards with the same
  // answer for the four names one thing goes by. Owner, 2026-09-03, with a full rule sheet: *"one
  // distinct knowledge unit per card... compress redundancy, not concepts... lists must be
  // vertical, not inline... show the number of expected items... use bolding for key anchors...
  // keep answers short."* Every assertion here is one of those rules, stated by shape.
  assert.match(CARDS_PROMPT, /ONE RECALL TARGET PER CARD/, "the card writer is not asked for one target per card");
  assert.match(CARDS_PROMPT, /Never combine unrelated things on a card/, "unrelated terms may share a card again");
  assert.match(CARDS_PROMPT, /is a different card from explaining it/, "recognition and explanation may be one card again");
  assert.match(CARDS_PROMPT, /Compress redundancy, not concepts/, "the redundancy rule is gone");
  assert.match(CARDS_PROMPT, /write ONE card whose back lists them, never one card per item and never several cards that share one answer/, "a set may be split into one card per item again");
  assert.match(CARDS_PROMPT, /Use a list only when the items naturally belong together/, "lists are unconditional again");
  assert.match(CARDS_PROMPT, /A list on the back is VERTICAL, one item per line as a numbered list/, "inline lists are allowed again");
  assert.match(CARDS_PROMPT, /never an inline comma list/, "the inline ban is gone");
  assert.match(CARDS_PROMPT, /say how many to expect/, "the expected count is not asked for");
  assert.match(CARDS_PROMPT, /Use Front\/Back when the prompt itself makes the retrieval target clear/, "the Front/Back rule is gone");
  assert.match(CARDS_PROMPT, /Use cloze when the card is better as sentence completion/, "the cloze rule is gone");
  assert.match(CARDS_PROMPT, /definitions, terminology, abbreviations and short associations/, "what cloze is for is unstated");
  assert.match(CARDS_PROMPT, /Use exactly ONE \{\{c1::\.\.\.\}\} per card and never c2 or c3/, "several blanks on one card are allowed again");
  assert.match(CARDS_PROMPT, /Each unit of knowledge appears ONCE, in one form/, "a fact may be written twice again");
  assert.match(CARDS_PROMPT, /Keep answers short: the bare fact first/, "the short-answer rule is gone");
  assert.match(CARDS_PROMPT, /Never put a paragraph on the back/, "the back may be a paragraph again");
  assert.match(CARDS_PROMPT, /Bold the key anchors with markdown/, "bold anchors are not asked for");

  // 🔴🔴 THE DECK IS BUILT FROM WHAT IS IN FRONT OF IT (owner 2026-09-03: cards must be "generated
  // from the actual source material rather than generic background knowledge").
  assert.match(CARDS_PROMPT, /Every card comes from THIS material/, "the card writer may draw on background knowledge again");
  assert.match(CARDS_PROMPT, /cannot point to in the text does not belong/, "an unsourced fact may land on a card again");
  assert.match(CARDS_PROMPT, /If the material only supports six good cards, write six/, "the count outranks the material again");

  // 🔴🔴 A CARD THAT LOSES THE SPECIFIC TESTS A VAGUE MEMORY OF A FACT INSTEAD OF THE FACT.
  assert.match(CARDS_PROMPT, /carry it across exactly as the material wrote it/, "an exact specific may be paraphrased away again");
  assert.match(CARDS_PROMPT, /Never round it, never generalise it into a vague word/, "a value may be rounded or softened again");

  // 🔴 THE LABELLED-PARTS EXCEPTION survives the list rule: the parts of a diagram are the
  // picture's to ask, in any form.
  assert.match(CARDS_PROMPT, /write NO cards about those parts at all, in any form/, "a diagram's parts can be written as text cards again");

  // 🔴 STATED BY SHAPE. A list naming any field would tell the model to write that field's cards
  // for everybody, which is the same mistake the item-writing rules were neutralised for. The
  // owner's rule sheet used his own subject's words; none of them may reach the prompt.
  assert.doesNotMatch(CARDS_PROMPT, /\b(dose|drug|patient|clinical|contraindicat|statute|plaintiff|brand)/i, "a subject crept into the card writer's prompt");
  assert.doesNotMatch(CARDS_PROMPT, /\u2014/, "an em dash reached the card writer");

  // 🔴 THE PARSER'S CAP IS A SAFETY LIMIT, NOT THE RULE. Lowering it to enforce brevity would cut
  // a list off mid-item, which is worse than a long one. The instruction does this job.
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /back\.slice\(0, 1000\)/, "the safety cap moved, check it is not doing the prompt's job");
});

test("🔴🔴 the card writer is told what the learner asked for, and only that", () => {
  // Owner, 2026-09-03: *"throughout the chat, I may ask for like flashcards on certain topics."*
  // `makeDeliverable(kind, said)` carried the sentence to slides, documents and sheets and never
  // to cards, so "flashcards on X" over seven lectures made a deck about lecture one.
  assert.equal(cardsAskNote(undefined), "");
  assert.equal(cardsAskNote("   "), "");
  const note = cardsAskNote("make me flashcards on the second chapter's definitions");
  assert.match(note, /The learner asked: "make me flashcards on the second chapter's definitions"/);
  assert.match(note, /only that/);
  assert.match(note, /rather than filling in from memory/);
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  assert.match(source, /makeFlashcardsDeliverable\([\s\S]*?topic\?: string/, "the maker no longer takes the ask");
  assert.match(source, /canvasBriefFor\(canvas, topic\), cardsAskNote\(topic\)/, "the ask is not handed to the writer");
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

// ---------------------------------------------------------------- the door, and the claim

test("🔴 \"make me a document: <what it is about>\" makes a document", () => {
  // Measured on production 2026-09-03 with thirty lectures attached. The lookahead admitted
  // `.,;!?` and not a COLON, so this exact sentence fell through to an ordinary turn: no document
  // was made, and the reply signed off "I've written this into your study document."
  assert.equal(readDeliverableAsk("Make me a document: a study guide on insulin therapy"), "document");
  assert.equal(readDeliverableAsk("make a document - everything I need for exam 1"), "document");
  assert.equal(readDeliverableAsk("write me a document, covering the whole lecture"), "document");
});

test("the phrasings #1061 already fixed still work, and its refusals still refuse", () => {
  // 🔴 THE REFUSALS ARE THE HALF THAT MATTERS. Nemesis is field-agnostic: "build a document parser"
  // is an ordinary computer-science question and must never silently produce a file.
  assert.equal(readDeliverableAsk("make a document on it"), "document");
  assert.equal(readDeliverableAsk("create a document about the lecture"), "document");
  assert.equal(readDeliverableAsk("build a document parser"), null);
  assert.equal(readDeliverableAsk("give me an example of a document store"), null);
  assert.equal(readDeliverableAsk("how do I make a document?"), null);
});

test("🔴 the reply may never claim a file it cannot create", () => {
  // The existing ban was scoped to `wantsReport`, the research lane — the one thing the model can
  // actually switch on. Study documents, decks and cards come from a phrase match the model neither
  // sees nor controls, so the ban had a hole exactly the shape of the failure it was written to
  // stop. Production, 2026-09-03: "I've written this into your study document", with zero canvas
  // outputs, zero library documents and zero assets created.
  const router = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(router, /You cannot create a file yourself/, "the model is no longer told it cannot make a file");
  assert.match(router, /never write a sentence claiming/, "nothing stops the reply announcing a file that does not exist");
  for (const kind of ["study document", "slide deck", "spreadsheet", "flashcards"]) {
    assert.ok(router.includes(kind), `the ban does not name ${kind}, so it reads as being about reports only`);
  }
});

// ---------------------------------------------------------------- the note: a recall list, reachable

// Owner, 2026-09-03: *"for me personally, when I study, I like to make a markdown file of all the
// points that I should be able to recall from memory myself."* Three things stood between him and
// that file: the door only opened for "summary note" and "study note", the writer only knew how to
// write a summary, and the ask never reached the writer at all.

/** The note writer's system prompt, comments stripped, read the same way `CARDS_PROMPT` is. */
const NOTE_PROMPT = (() => {
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  const block = source
    .slice(source.indexOf("const NOTE_SYSTEM"), source.indexOf("export const CANVAS_NOTE_FOLDER"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const code = block.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  return [...code.matchAll(/"([^"]*)"|'([^']*)'/g)].map((hit) => hit[1] ?? hit[2] ?? "").join(" ").replace(/\s+/g, " ");
})();

/** The note maker, comments stripped, so the guards read the code and never the reasoning beside it. */
const NOTE_MAKER = (() => {
  const source = readFileSync(new URL("./canvas-deliverables.ts", import.meta.url), "utf8");
  return source
    .slice(source.indexOf("export async function makeNoteDeliverable"), source.indexOf("async function webContextForTopic"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
})();

test("🔴🔴 the owner's own sentence opens the note door, and so do the ways other learners say it", () => {
  // The arm read `(summary note|study note)` and nothing else, so this exact sentence fell through
  // to an ordinary turn and was talked about instead of made.
  assert.equal(readDeliverableAsk("make me a markdown file of the points I should recall from memory"), "note");
  assert.equal(readDeliverableAsk("write my revision notes on this"), "note");
  assert.equal(readDeliverableAsk("give me a cheat sheet"), "note");
  assert.equal(readDeliverableAsk("create a study guide from these"), "note");
  assert.equal(readDeliverableAsk("make notes on chapter four"), "note", "the plural is a door");
  assert.equal(readDeliverableAsk("give me the key points"), "note");
  assert.equal(readDeliverableAsk("write a recall list for the beam deflection exam"), "note");
  assert.equal(readDeliverableAsk("make an md file of the points to memorise"), "note");
  assert.equal(readDeliverableAsk("build a recall sheet of the points to remember"), "note");
  assert.equal(readDeliverableAsk("create a summary note of what we covered"), "note", "the old door still opens");

  // 🔴 THE REFUSALS ARE THE HALF THAT MATTERS, here as for documents: a stolen turn reads as the
  // system not listening, and a wider noun list is exactly how turns get stolen.
  assert.equal(readDeliverableAsk("how do I write good notes"), null, "advice about notes, not an order for some");
  assert.equal(readDeliverableAsk("make a note of that"), null, "the singular is a figure of speech, not a door");
  assert.equal(readDeliverableAsk("what are the key points of the ruling?"), null, "a question stays a question");
  assert.equal(readDeliverableAsk("Tell me the key points"), null, "no make-verb, no file");
  // 🔴 "MAKE SURE" IS NOT A MAKE. Found while widening: with `notes` in the arm, this sentence about
  // the learner's OWN notes became a file. The idiom is excluded at the verb, and only the idiom.
  assert.equal(readDeliverableAsk("make sure your notes cover the appeal"), null, "\"make sure\" stole the turn");
  assert.equal(readDeliverableAsk("make sure to create flashcards on this"), "flashcards", "excluding the idiom must not exclude the sentence");

  // The other arms, unchanged and pinned so widening this one cannot quietly widen them.
  assert.equal(readDeliverableAsk("make flashcards from this chapter"), "flashcards");
  assert.equal(readDeliverableAsk("create flashcards for this"), "flashcards");
  assert.equal(readDeliverableAsk("make me a powerpoint on this"), "slides");
  assert.equal(readDeliverableAsk("can you create a slide deck on mitosis?"), "slides");
  assert.equal(readDeliverableAsk("make a document on it"), "document");
  assert.equal(readDeliverableAsk("Make me a document: a study guide on insulin therapy"), "document", "the first noun wins, and it is the document");
  assert.equal(readDeliverableAsk("build a document parser"), null);
  assert.equal(readDeliverableAsk("turn that into a report"), null);
});

test("🔴🔴 the note writer knows a RECALL LIST from a summary, and the ask decides which", () => {
  // The prompt asked for a "summary note" whatever the learner said, so "the points I should recall"
  // came back as prose about the material rather than the list of things to close the file and say.
  assert.match(NOTE_PROMPT, /RECALL LIST/, "the recall shape is gone from the note writer");
  assert.match(NOTE_PROMPT, /one line per point/, "a recall list may be paragraphs again");
  assert.match(NOTE_PROMPT, /say from memory without looking/, "a line is no longer defined by what the learner can say unaided");
  assert.match(NOTE_PROMPT, /exactly as the material gave it/, "an exact specific may be softened again");
  assert.match(NOTE_PROMPT, /No paragraphs anywhere in a recall list/, "paragraphs are allowed back into a recall list");
  assert.match(NOTE_PROMPT, /Otherwise write a summary note/, "the summary shape is gone, so every note is a list now");
  // The triggers are the learner's words, all five, so the ask paragraph can be read against them.
  for (const trigger of ["points to recall", "things to memorise", "a checklist", "a cheat sheet", "revision notes"]) {
    assert.ok(NOTE_PROMPT.includes(trigger), `the writer is no longer told that "${trigger}" means a recall list`);
  }
  // 🔴 THE SPECIFICS ARE NAMED BY SHAPE: a value, a name, a date, an order of steps, a formula, a
  // condition. A list naming any field would tell the writer what every learner studies.
  for (const shape of ["a value", "a name", "a date", "an order of steps", "a formula", "a condition"]) {
    assert.ok(NOTE_PROMPT.includes(shape), `the recall rule stopped naming ${shape}`);
  }
  assert.doesNotMatch(NOTE_PROMPT, /\b(dose|drug|patient|clinical|contraindicat|statute|plaintiff)/i, "a subject crept into the note writer's prompt");

  // The Markdown-note rules that were always there, kept.
  assert.match(NOTE_PROMPT, /single # title line/, "the note lost its title rule");
  assert.match(NOTE_PROMPT, /## headings/, "the note lost its section rule");
  assert.match(NOTE_PROMPT, /Bold the key terms/, "defined terms are no longer bold");
  assert.match(NOTE_PROMPT, /No preamble, no closing remarks/, "the note may chatter again");
  assert.match(NOTE_PROMPT, /nothing is invented/, "the note may draw on background knowledge again");
});

test("🔴 no em dash reaches the note writer either, by owner rule", () => {
  // Written as an escape so this file does not carry the character it bans.
  assert.equal(NOTE_PROMPT.includes("\u2014"), false, "an em dash is back in the note prompt");
  assert.equal(NOTE_MAKER.includes("\u2014"), false, "an em dash is in the note maker's own strings");
});

test("🔴🔴 the learner's ask reaches the writer, quoted and capped, and an empty ask sends nothing", async () => {
  // 🔴 A DYNAMIC IMPORT, so this block is self-contained at the foot of the file: the header import
  // is shared with the flashcard guards above, which are edited on their own.
  const { noteAskParagraph } = await import("./canvas-deliverables");
  // The writer had never seen the sentence that says which shape to write.
  assert.equal(noteAskParagraph(undefined), "");
  assert.equal(noteAskParagraph("   "), "");
  const shaped = noteAskParagraph("make me a markdown file of the points I should recall");
  assert.match(shaped, /^The learner asked: "make me a markdown file of the points I should recall"\. Shape the note the way they asked for it/);
  assert.match(shaped, /a recall list if they asked for the points to recall/, "the ask paragraph no longer says what a recall ask becomes");
  assert.match(shaped, /a summary note otherwise/, "the ask paragraph no longer says what any other ask becomes");
  assert.equal(shaped.includes("\u2014"), false, "the ask paragraph models the banned dash");
  // 🔴 CAPPED AT 300, so a pasted page cannot push the material out of the writer's attention.
  const long = noteAskParagraph("x".repeat(500));
  assert.match(long, /^The learner asked: "x{300}"\. /, "the ask is not capped at 300 characters");
  // Whitespace collapsed: a sentence typed across three lines is one sentence.
  assert.match(noteAskParagraph("write   my\n\nrevision notes"), /"write my revision notes"/);
});

test("🔴🔴 the topic reaches the note's retrieval and the session hands it over; an empty canvas with a subject writes anyway", () => {
  // `makeNoteDeliverable(uid, canvas)` took no topic, so the retrieval query was the canvas title
  // and the last thing said, and "the points to recall about chapter four" pulled passages for
  // whatever the canvas was about in general.
  assert.match(NOTE_MAKER, /canvasBriefFor\(canvas, topic\)/, "the note's retrieval no longer knows what the learner asked for");
  assert.match(NOTE_MAKER, /noteAskParagraph\(topic\)/, "the learner's ask no longer reaches the writer");
  assert.match(NOTE_MAKER, /\{ content: NOTE_SYSTEM, role: "system" \}/, "the note writer lost its instructions");
  // 🔴 GENERALIST, LIKE THE DOCUMENT. With a subject and no material it writes from knowledge plus
  // one search; with neither it asks. The refusal survives; only its scope changed.
  assert.match(
    NOTE_MAKER,
    /canvasHasMaterial\(canvas\)\s*\?\s*await canvasBriefFor\(canvas, topic\)\s*:\s*\[`Write this note about: \$\{subject\}`, await webContextForTopic\(uid, subject\)\]/,
    "an empty canvas with a topic no longer writes from knowledge and the web",
  );
  assert.match(NOTE_MAKER, /if \(!canvasHasMaterial\(canvas\) && !subject\)/, "the refusal for neither material nor subject is gone");
  assert.match(NOTE_MAKER, /Tell me what the note should be about/, "the refusal no longer asks for a subject");
  // The note is still filed where it always was, under the canvas's own name first.
  assert.match(NOTE_MAKER, /folder: CANVAS_NOTE_FOLDER/, "the note left its Library folder");
  assert.match(NOTE_MAKER, /canvas\.title\.trim\(\) \|\| heading \|\| subject \|\| "Note"/, "the note's name ladder changed");

  // And the session hands the topic over, which is the one change made to that file.
  const hook = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  assert.match(hook, /makeNoteDeliverable\(uid, latest\.current, topic\)/, "the session drops the topic on the floor before the note maker sees it");
});
