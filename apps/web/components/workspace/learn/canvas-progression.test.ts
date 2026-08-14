import assert from "node:assert/strict";
import test from "node:test";

import { composerControl, offersAdvance, type ProgressionInput } from "./canvas-progression";

const state = (over: Partial<ProgressionInput> = {}): ProgressionInput => ({
  actionType: null,
  awaitingDemonstration: false,
  feedbackPassed: false,
  hasFeedback: false,
  ...over,
});

test("🔴 N3: a required demonstration offers NO way past it", () => {
  // The one that matters. If this ever returns true, retrieval can be bypassed by pressing a
  // control instead of producing an answer — and every screen still looks correct.
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", awaitingDemonstration: true })),
    false,
    "a learner must not be able to press past a question they have been asked",
  );
});

test("exposition states offer it — the learner is reading and pressing on is the next move", () => {
  assert.equal(offersAdvance(state({ actionType: "show_correction" })), true);
  assert.equal(offersAdvance(state({ actionType: "contrast" })), true);
  assert.equal(offersAdvance(state({ feedbackPassed: false, hasFeedback: true })), true);
});

test("a PASSED verdict offers nothing, because it advances by itself", () => {
  assert.equal(
    offersAdvance(state({ feedbackPassed: true, hasFeedback: true })),
    false,
    "a control beside something already moving on is a second way to do one thing",
  );
});

test("🔴 states with nothing to advance past do not offer a control wired to nothing", () => {
  assert.equal(offersAdvance(state()), false, "the empty state has nothing to acknowledge");
  assert.equal(offersAdvance(state({ actionType: "defer" })), false, "nothing is owed and nothing is being read");
});

test("feedback outranks the action underneath it, exactly as the renderer does", () => {
  // The policy has already decided the next question while the learner is still reading a verdict.
  // What is ON SCREEN is the verdict, so that is what decides.
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", awaitingDemonstration: true, hasFeedback: true })),
    true,
    "a verdict being read is an exposition state even when a retrieval is queued behind it",
  );
  assert.equal(
    offersAdvance(state({ actionType: "retrieve", feedbackPassed: true, hasFeedback: true })),
    false,
    "a passed verdict is still silent even with a retrieval queued behind it",
  );
});

// ── §I's whole rule, as a table ───────────────────────────────────────────────
//
//   exposition   empty composer  ->  ✓            response begins  ->  send
//   production   empty composer  ->  NO CONTROL   response exists   ->  send

test("🔴 §I NARROWED TO TWO STATES: the composer sends, or offers nothing", () => {
  // 🔴 THIS USED TO BE FOUR STATES, ACROSS AN `advanceAvailable` INPUT THAT NO LONGER EXISTS. Its
  // exposition rows asserted `"advance"` — the `✓` — which §38/§39 moved out of the composer and
  // below the material it acknowledges. The two rows that survive are the two that were never
  // about the tick, and one of them is N3.
  assert.equal(composerControl({ hasResponse: true }), "send");
  assert.equal(
    composerControl({ hasResponse: false }),
    "none",
    "a required demonstration must offer NO control — absent, not disabled",
  );
});

test("🔴 REVERSED: the composer no longer offers a ✓ at all — §38/§39", () => {
  // 🔴 THE OLD ASSERTION IS RECORDED RATHER THAN DELETED, because deleting it is the wrong fix and
  // the reasoning is what changed, not the property. It read:
  //
  //     "there is never both a ✓ and a send, and the TYPE is what guarantees it"
  //     "a response outranks ✓ in exposition — typing turns the same control into send"
  //
  // Both were true, and the guarantee held BECAUSE both controls lived in this one slot. §38 says
  // there is one button in Nemesis and it says Continue; §39 says it appears when the policy
  // declares a DELIBERATE cognitive mode. So the acknowledgment left the composer and now renders
  // below the material it acknowledges.
  //
  // 🔴 WHICH MEANS THIS UNION NO LONGER GUARANTEES "NEVER BOTH". A send button and a Continue can
  // now be on screen together with the type perfectly satisfied — they are different components.
  // The guarantee MOVED to `continueOwner`, which returns at most one region for the whole surface
  // and is suppressed outright while a demonstration is owed. Asserting the old promise here would
  // be asserting something this function has stopped controlling.
  for (const hasResponse of [true, false]) {
    for (const hasAttachment of [true, false]) {
      const control = composerControl({ hasAttachment, hasResponse });
      assert.ok(["send", "none"].includes(control), `the composer must only ever send or offer nothing: ${control}`);
    }
  }
});

// ── sending material with nothing typed (UX brief §3) ───────────────────────

test("🔴 attached material makes the empty composer sendable — §3", () => {
  // §3: "Attach + send with no text means 'learn this material with me.' Infer it." §26 lists it
  // as its own criterion: "a file may be sent with no accompanying text".
  assert.equal(composerControl({ hasAttachment: true, hasResponse: false }), "send");
  // And it is still absent with nothing at all — an empty canvas offers no control to press.
  assert.equal(composerControl({ hasAttachment: false, hasResponse: false }), "none");
});

test("🔴 N3 SURVIVES BOTH §3 AND THE ✓ REMOVAL: a production state with nothing typed offers NO control", () => {
  // The regression this exists to catch, and it is the dangerous direction: widening "what counts
  // as sendable" is exactly how a required demonstration silently becomes skippable, while every
  // screen still looks correct.
  //
  // 🔴 AND REMOVING THE `✓` DID NOT SOFTEN IT. Narrowing the union took away a control; it did not
  // touch the rule that an empty composer in a production state renders nothing at all — absent,
  // never present-and-disabled, because a greyed control still advertises that pressing on is an
  // option.
  assert.equal(
    composerControl({ hasResponse: false }),
    "none",
    "omitting hasAttachment must mean false — a defaulted-true flag would remove N3 everywhere at once",
  );
});

// ── a staged passage is something you can send ──────────────────────────────

test("🔴🔴 a staged selection offers SEND, because the composer already asked a question about it", () => {
  // 🔴 THE OWNER'S TWO REPORTS WERE ONE DEFECT. They saw "a bubble I don't understand the function
  // of" above a composer "missing the send button". Selecting text stages a chip AND changes the
  // placeholder to "What should Nemesis do with this?" — then offered no way to answer it, because
  // send appeared only once something had been typed. A question with no answerable control is what
  // made the chip unreadable: with nothing to press, it looks like debris rather than an object.
  assert.equal(composerControl({ hasResponse: false, hasSelection: true }), "send");
  // Typing alongside it changes nothing — one control, one meaning.
  assert.equal(composerControl({ hasResponse: true, hasSelection: true }), "send");
});

test("🔴 and N3 is untouched: no selection, nothing typed, no control", () => {
  // The dangerous direction is widening "sendable" until a required demonstration becomes
  // skippable. A retrieval prompt owns the screen and has no page to select from, so the two states
  // cannot both be live — but the default still has to be false, or one omitted flag removes N3
  // everywhere at once.
  assert.equal(composerControl({ hasResponse: false, hasSelection: false }), "none");
  assert.equal(composerControl({ hasResponse: false }), "none");
});
