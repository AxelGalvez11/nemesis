import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// UI-001 (docs/canvas-agent-board.md): source_state=degraded, learner_state=unknown,
// not_demonstrated and incorrect must never look the same, because they call for opposite
// responses from a learner. This reads the component's source rather than rendering it — this
// app has no DOM test harness (see canvas-runtime-branch.test.ts) — so the property checked here
// is textual/structural, matching that file's convention.

const SOURCE = readFile(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");

test("🔴 a degraded source is never told it means the learner is done", async () => {
  const source = await SOURCE;

  // The three canvas-level outcomes reaching the empty state must produce three different
  // headlines. Collapsing any two together is exactly the defect this test exists to catch: a
  // `degraded` canvas — one the parser could only partly read — used to fall through to the same
  // branch as "you've demonstrated everything", fabricating a claim about the learner from a gap
  // in Nemesis's own reading.
  assert.match(source, /outcome === "failed"/, "the failed-outcome branch is gone");
  assert.match(source, /outcome === "degraded"/, "degraded is no longer distinguished from other outcomes");

  const degradedHeadline = "Nemesis could only partly read this material";
  const failedHeadline = "Nemesis couldn't read this material";
  const masteryHeadline = "Nothing to practise here right now";

  for (const headline of [degradedHeadline, failedHeadline, masteryHeadline]) {
    assert.match(source, new RegExp(escapeRegExp(headline)), `missing expected headline: ${headline}`);
  }

  // The degraded branch's own body copy must exist as its own literal — not merely "some string
  // near the word degraded". If a future edit collapsed `partlyReadable` back into the mastery
  // branch, this exact sentence would disappear from the file and this assertion would fail; it
  // does not appear anywhere else, so its presence is specific to the degraded path.
  const degradedBody =
    "What came through is covered here. The rest wasn't read clearly enough to ask about";
  assert.match(source, new RegExp(escapeRegExp(degradedBody)), "the degraded body copy changed shape");

  // And it must not be the mastery sentence in disguise — the fabrication this test exists to
  // catch could equally take the form of degraded's OWN body quietly picking up mastery language
  // rather than losing its branch outright.
  assert.doesNotMatch(
    source,
    /partlyReadable\s*\n?\s*\?\s*"[^"]*shown everything[^"]*"/i,
    "the degraded body must not claim the learner has finished the material",
  );
});

test("🔴 not_demonstrated, partial and incorrect stay distinguishable in their own captions", async () => {
  const source = await SOURCE;

  // show_correction intentionally shares one renderer across three learner_state values (see the
  // block comment above it) — but each must still say something different, because
  // not_demonstrated must never read as "you got this wrong" (UI-001).
  assert.match(source, /"You had part of this\."/);
  assert.match(source, /"No attempt came back on this one — here it is\."/);
  assert.match(source, /"Here's the one to fix\."/);
});

// Compact-UI pass (owner rule, 2026-08-12): "there should only be buttons for passages to be
// read, not for recall — that makes retrieval not feel quick." A passed retrieval has nothing
// left to acknowledge — the learner already produced it — so it moves on by itself; a correction
// is still a passage the learner needs time with, so its button stays.
test("🔴 a passed retrieval gets no button and advances itself", async () => {
  const source = await SOURCE;
  assert.match(source, /const passed = verdictIsPass\(feedback\.evaluation\.verdict\)/);
  assert.match(source, /\{!passed && \(/, "the Continue button must be conditional on NOT having passed");
});

// The original 2000ms-timer design raced record()'s in-flight evidence write: a fast answer could
// re-appear, with its own answer still on screen, before the write that proved it correct had
// landed -- and answering again in that window would record the echo as a fabricated
// demonstration. Runtime's `recording` flag closes this; these tests pin the closed version, not
// the timer-only one that shipped it.
test("🔴 advancing waits for BOTH the readability floor and the real write to land", async () => {
  const source = await SOURCE;
  assert.match(source, /if \(!passed \|\| !minReadDone \|\| recording\) return;/);
  assert.match(source, /latestAcknowledge\.current\(\);/);
  // The floor is real (guards against a flash-and-vanish verdict on a fast write) but must not be
  // the thing deciding correctness by itself -- `recording` has to appear in the gate too.
  assert.match(source, /setTimeout\(\(\) => setMinReadDone\(true\), MIN_VERDICT_READ_MS\)/);
});

test("🔴 the recording prop actually flows from the runtime, not a local guess", async () => {
  const source = await SOURCE;
  assert.match(source, /recording: boolean/, "FeedbackScreen must accept the real flag as a prop");
  assert.match(source, /recording=\{runtime\.recording\}/, "and the call site must pass the runtime's own value");
});

test("🔴 the advance effect calls the CURRENT acknowledge, not a stale one", async () => {
  const source = await SOURCE;
  // `runtime.acknowledge` is keyed on `decision`, which can change while this screen is up (the
  // answer's evidence re-read moves `decidedAt` once the write lands). A bare callback dependency
  // would risk a stale `decision` closure at the exact moment it fires; the ref does not.
  assert.match(source, /const latestAcknowledge = useRef\(onAcknowledge\)/);
  assert.match(source, /latestAcknowledge\.current = onAcknowledge/);
});

test("🔴 a correction still waits for a click -- both other acknowledge sites keep their button", async () => {
  const source = await SOURCE;
  // show_correction and contrast: no evidence was written, so actedOn is the only thing stopping
  // the identical card from being served again -- unlike a pass, skipping the button here would
  // silently drop something real. Both keep an unconditional "Got it" wired to runtime.acknowledge.
  const gotItButtons = [...source.matchAll(/onClick=\{runtime\.acknowledge\}[\s\S]{0,40}?>\s*Got it/g)];
  assert.equal(gotItButtons.length, 2, "show_correction and contrast must each still have their own Got it button");
});

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
