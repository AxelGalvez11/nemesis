import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { REVIEW_DEFAULTS } from "./deck-review";

// ── a deck is something you STUDY, and nobody edits a card (owner rulings, 2026-08-24) ──────
//
// 🔴🔴 THE ARTIFACT HAS TO BE REVIEWABLE WHERE IT LIVES. *"I kinda just want … the cards as an
// artifact that the user can study. And, of course, it will appear in the library too, not just
// in the chat's output section."* Before this, both of those places showed a deck as a list of
// front/back TEXT — reading the answers, which is the one thing a flashcard exists to prevent.
//
// 🔴🔴 AND THE REVIEW SCREEN IS NOT REDESIGNED. *"it was supposed to be, like, Anki where it had,
// like, the minimalist design, no flip animation. I would like to keep that."* So this feature is
// a DOOR onto the existing `ReviewSession`, and these tests exist mostly to keep it a door: the
// moment someone draws a second review screen, the two drift and only one gets the next fix.
//
// 🔴 NO EDITOR ANYWHERE. *"I don't really want the user to be able to edit them"*, extended on the
// build plan to the old Study tab as well. Replaced, not merely deleted — see the rewrite tests.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A window of source starting at `marker`, so a claim about one function cannot be satisfied by
 *  a coincidence elsewhere in a 900-line file. Throws rather than returning "" — an empty slice
 *  is how a source-shape assertion silently stops guarding anything. */
function after(text: string, marker: string, length: number): string {
  const at = text.indexOf(marker);
  assert.notEqual(at, -1, `the anchor "${marker}" is gone — this guard is no longer pointed at anything`);
  return text.slice(at, at + length);
}
const REVIEW = strip(readFileSync(new URL("./review-session.tsx", import.meta.url), "utf8"));
const DECK_REVIEW = strip(readFileSync(new URL("./deck-review.tsx", import.meta.url), "utf8"));
const OUTPUTS = strip(readFileSync(new URL("../library/library-outputs.tsx", import.meta.url), "utf8"));
const CANVAS_CONTROLS = strip(readFileSync(new URL("../learn/canvas-controls.tsx", import.meta.url), "utf8"));

test("🔴🔴 the card editor is gone from the review screen", () => {
  // Calibration: restore the inline form and every line below reddens.
  assert.ok(!/function saveEdit/.test(REVIEW), "the edit form's submit handler is back");
  assert.ok(!/function openEdit/.test(REVIEW), "the edit form's opener is back");
  assert.ok(!REVIEW.includes("Edit card"), "the ⋯ menu offers Edit card again");
  assert.ok(!/setEditFront|setEditBack|setEditTags/.test(REVIEW), "the edit form's state is back");
  // The form was the only reason this screen imported a text input of any kind.
  assert.ok(!/from "@\/components\/desktop-ui\/textarea"/.test(REVIEW), "the review screen imports a Textarea again");
  assert.ok(!/from "@\/components\/desktop-ui\/input"/.test(REVIEW), "the review screen imports an Input again");
});

test("🔴🔴 a thumbs-down replaces it, and rewrites with no typing", () => {
  // 🔴 THE CONTROL MOVED ON 2026-08-25, THE MECHANISM DID NOT. This used to require a ⋯ menu item
  // reading "This card is wrong". The owner asked for the plainer thing: *"Mainly just a thumbs up
  // or a thumbs down if a card was badly generated."* Same call, same empty brief, one fewer
  // decision — so the assertion below moved from the menu item's text to the button that replaced
  // it, and everything about the rewrite itself is unchanged.
  assert.match(REVIEW, /data-testid="rate-card-down"/, "the replacement for the editor is missing");
  assert.ok(!/This card is wrong/.test(REVIEW), "the old menu item is back alongside the thumbs");
  // 🔴 THE POINT IS THE EMPTY TRANSCRIPT. `reviseCardMessages` reads an empty one as
  // "(none — improve accuracy and clarity)", which is exactly the one-press behaviour. If someone
  // later threads a text box into this call, that is the editor coming back through the side door.
  const body = after(REVIEW, "async function rewriteCurrent", 1400);
  assert.match(body, /reviseCardMessages\(\{[^}]*transcript: ""/, "the rewrite stopped asking with an empty brief");
  assert.match(body, /parseRevisedCard\(/, "the rewrite stopped parsing the model's card");
  assert.match(body, /updateCard\(\{/, "the rewrite never saves");
  assert.match(body, /setRevealed\(false\)/, "a rewritten card shows its new answer without being asked for");
});

test("🔴 an occlusion card is rated but never rewritten", () => {
  // parseRevisedCard returns front/back TEXT; applying it to an image-with-masks card would
  // destroy the payload.
  //
  // 🔴 THE REFUSAL MOVED FROM HIDING A CONTROL TO SKIPPING A STEP, and that is a real improvement
  // rather than bookkeeping. Hiding the old menu item meant an image card could not be reported
  // bad AT ALL. Now the vote is always recorded and only the text rewrite is skipped — which
  // matters more than it used to, because the model now MAKES image cards, so image cards can be
  // badly generated in exactly the way this vote exists to catch.
  const rate = after(REVIEW, "async function rate(", 700);
  assert.match(rate, /await rateCard\(/, "an image card's vote is no longer recorded");
  assert.match(
    rate,
    /card\.cardType !== "image_occlusion"\)\s*await rewriteCurrent\(\)/,
    "an image card is sent through the text rewrite, which would blank its labels",
  );
});

test("🔴🔴 DeckReview is a door onto the existing screen, not a second one", () => {
  assert.match(DECK_REVIEW, /<ReviewSession/, "DeckReview stopped mounting the real review screen");
  // A second grading path, a second queue, or a second card renderer would all show up as this
  // file growing its own review logic.
  assert.ok(!/buildReviewQueue|gradeCard\(/.test(DECK_REVIEW), "DeckReview started reviewing cards itself");
});

test("🔴 no flip animation, because the owner said so", () => {
  assert.equal(REVIEW_DEFAULTS.flipAnimation, false, "the review away from the Study tab animates the card again");
  assert.match(DECK_REVIEW, /settings=\{REVIEW_DEFAULTS\}/, "DeckReview stopped passing the owner's defaults");
});

test("🔴 the whole-account study load waits for a real intent to review", () => {
  // useCloudStudy() pulls every deck, card and review the account owns. Mounting DeckReview is
  // what starts that, so both callers must keep it behind a truthy deck id rather than rendering
  // it always with an `open` flag — the pattern that would put the load on page arrival.
  assert.match(OUTPUTS, /\{reviewing && <DeckReview /, "the Library mounts the review unconditionally");
  assert.match(CANVAS_CONTROLS, /\{reviewingDeck && <DeckReview /, "the canvas mounts the review unconditionally");
  assert.ok(!/<DeckReview[^>]*\sopen=/.test(OUTPUTS + CANVAS_CONTROLS), "DeckReview grew an `open` prop and is now always mounted");
  // And it must not hand ReviewSession an empty deck mid-fetch: that renders "You're caught up",
  // which reads as a finished deck.
  assert.match(DECK_REVIEW, /status !== "loaded"/, "DeckReview stopped waiting for the store to load");
});

test("🔴🔴 pressing a deck reviews it, and there is no second way to read the answers", () => {
  // Calibration: point the row back at toggleDeck and the first line reddens.
  assert.match(OUTPUTS, /onClick=\{\(\) => setReviewing\(deck\.id\)\}/, "a deck row no longer starts a review");
  assert.match(OUTPUTS, /aria-label=\{`Review \$\{deck\.name\}`\}/, "the review row lost its accessible name");
  // The peek survives — it is useful for checking what Nemesis made — but only behind its own control.
  // 🔴🔴 AND LATER THE SAME DAY THE PEEK WENT ENTIRELY. Owner, 2026-09-01: *"the option to show the
  // flashcard I don't think that's really necessary in the library."* It existed as the consolation
  // for making the row REVIEW the deck instead of listing it (2026-08-24); now that pressing a deck
  // opens it FULL SCREEN from the shelf, where the cards are the whole screen, a second way to read
  // them is a door onto the room you are already standing in.
  //
  // The first half of this test is untouched and is the part that mattered: pressing a deck starts
  // a review. What is gone is the alternative nobody needed.
  assert.ok(!/toggleDeck/.test(OUTPUTS), "the peek came back to the Library");
  assert.ok(!/"Hide the cards"|"Show the cards"/.test(OUTPUTS), "the peek came back to the Library's row menu");
});

test("🔴 a canvas linking to a deck means 'go study this'", () => {
  // Both doors: the ?deck= deep link the Library honours, and the canvas's own Outputs row, which
  // used to be an anchor to /library?deck= and now opens the review over the canvas.
  const arrival = after(OUTPUTS, 'get("deck")', 200);
  assert.match(arrival, /setReviewing\(id\)/, "arriving with ?deck= no longer starts the review");
  assert.ok(!/toggleDeck\(id\)/.test(arrival), "arriving with ?deck= only unrolls the text again");
  // The row moved into an `OutputRow` component when the panel became three stacked shelves, so
  // the press calls the prop and the panel supplies the setter. Both halves are asserted: a prop
  // that nothing passes is a row that opens nothing, and that is the failure this guards.
  assert.match(CANVAS_CONTROLS, /onClick=\{\(\) => onReviewDeck\(deckId\)\}/, "the canvas output row stopped opening the review");
  assert.match(CANVAS_CONTROLS, /onReviewDeck=\{setReviewingDeck\}/, "the output row is never given a way to open the review");
  assert.ok(!CANVAS_CONTROLS.includes("/library?deck="), "the canvas navigates away to review a deck it just made");
});
