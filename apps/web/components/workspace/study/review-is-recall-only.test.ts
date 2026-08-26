import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── what a learner may do while reviewing a card, and what they may not ────────────────────────
//
// 🔴🔴 THIS GUARD IS WRITTEN REVERSED: it reddens when a removed control COMES BACK. Three of them
// left the review screen on 2026-08-26 on the owner's instruction, and every one had a defensible
// reason to exist, which is exactly why a plain "don't re-add these" comment would not survive the
// next person who reads the file and thinks of the reason.
//
// Owner, 2026-08-26: *"remove the [have] nemesis explain this card… and remove the flag function
// for cards. Pretty much just hide it. And also the suspend card, which is… the three dots icon
// inside the flash cards."*
//
//   ✨  "Have Nemesis explain this card" — a side chat that explained the card and could rewrite it
//   🚩  a five-colour flag menu, plus an `F` hotkey that wrote to the card with nothing on screen
//   ⋯   a kebab menu holding one item, "Suspend card"
//
// 🔴 WHAT THEY HAVE IN COMMON IS THE ARGUMENT. Each is a decision ABOUT the card, offered in the
// one moment the learner is supposed to be trying to remember what is on it. The Study browser is
// where a learner manages a collection; this screen is where they work through one.
//
// 🔴 THE THUMBS ARE THE EXCEPTION AND STAY. They are the same gesture as the recall itself ("this
// card is bad"), and a complaint with nowhere to go is a complaint nobody files. Owner 2026-08-25:
// *"Mainly just a thumbs up or a thumbs down if a card was badly generated."*
//
// 🔴 AND THE MACHINERY IS PARKED, NOT DELETED. `explain-chat.tsx` still exists and
// `study-artifact-dialogs.tsx` still mounts it; `setCardFlag` and `setCardSuspended` are still in
// the store and still reachable from the Study browser. Only the doors from THIS screen are gone.
// Do not tidy up parked machinery.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const url = (name: string) => new URL(name, import.meta.url);
const REVIEW = strip(readFileSync(url("./review-session.tsx"), "utf8"));

test("🔴🔴 the Explain door is gone from the review screen", () => {
  assert.ok(!/ExplainChat/.test(REVIEW), "the Explain panel is mounted in the review screen again");
  assert.ok(!/IconSparkles|explainOpen|explainCache/.test(REVIEW), "the Explain button or its state is back");
  assert.ok(!/explainCardContext|explainTranscript/.test(REVIEW), "the review screen is building an Explain context again");
});

test("🔴🔴 flagging is gone, and so is the hotkey that did it invisibly", () => {
  assert.ok(!/IconFlag|studyFlagColor|STUDY_FLAG_COLORS/.test(REVIEW), "the flag menu is back on the review screen");
  assert.ok(!/setCardFlag/.test(REVIEW), "the review screen writes a flag again");
  // `F` was the worse half: a key that wrote to the card with no control on screen to explain it.
  assert.ok(!/"f" \|\| event\.key === "F"|KeyF/.test(REVIEW), "the F hotkey is back, writing to a card with nothing on screen");
});

test("🔴🔴 there is no kebab menu, and nothing suspends a card mid-review", () => {
  assert.ok(!/IconDots/.test(REVIEW), "the ⋯ menu is back");
  assert.ok(!/setCardSuspended|suspendCurrent/.test(REVIEW), "a card can be suspended from the review screen again");
  assert.ok(!/DropdownMenu/.test(REVIEW), "a dropdown returned to the review toolbar; every control here should be one press");
});

test("🔴 the two thumbs stay, because they are the only thing a learner may say about a card", () => {
  // Calibration: this is what stops the test above from being satisfied by deleting the toolbar.
  assert.match(REVIEW, /data-testid="rate-card-up"/, "the good-card vote is gone");
  assert.match(REVIEW, /data-testid="rate-card-down"/, "the bad-card vote is gone");
  // And thumbs-down still triggers the rewrite, which is where the deleted card editor went.
  assert.match(REVIEW, /rewriteCurrent\(\)/, "a badly-made card no longer gets rewritten");
  assert.match(REVIEW, /reviseCardMessages/, "the rewrite lost the prompt it shares with the parked Explain panel");
});

test("🔴 the parked machinery is still on disk — removing a door is not deleting the room", () => {
  for (const file of ["./explain-chat.tsx", "./study-artifact-dialogs.tsx"]) {
    assert.ok(readFileSync(url(file), "utf8").length > 0, `${file} was deleted; the Study tab's Explain panel went with it`);
  }
  assert.match(
    readFileSync(url("./study-artifact-dialogs.tsx"), "utf8"),
    /ExplainChat/,
    "the other door onto the Explain panel closed too, which makes it dead code rather than parked",
  );
});

test("🔴 the card column is one column again, now that nothing sits beside it", () => {
  // The grid narrowed to make room for the Explain panel on the right. With that door gone the card
  // gets the width back on every screen; a conditional class pointing at deleted state is how a
  // layout ends up permanently in its narrow variant.
  assert.match(REVIEW, /grid min-h-0 grid-cols-1 gap-4/, "the card grid changed shape");
  assert.ok(!/lg:grid-cols-\[minmax/.test(REVIEW), "the review screen still reserves a column for a panel that cannot open");
});
