import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { knowledgeSignature } from "../../components/workspace/learn/use-policy-runtime";
import type { CanvasSource, LearningCanvas } from "./canvas-model";

// AFTER PRESSING SEND, DOES THE POLICY EVER LOOK AGAIN?
//
// 🔴🔴 IT COULD NOT. QA on production: upload a lecture, press send, blank screen for ever — 3 files
// out of 3 — and then leaving the canvas and reopening it from the Library works and asks a real
// question from the slides. Canvas UI fixed the surface half (#597) and named this half rather than
// letting their fix look complete, citing #595: one of two necessary breaks looks like a fix.
//
//     knowledge re-resolves ONLY when the canvas's SOURCES or TITLE change
//     begin() changes NEITHER
//     -> pressing send can never make the policy look again
//
// 🔴 AND THE FIRST LOOK CAN LEGITIMATELY COME BACK EMPTY, WHICH IS WHAT MAKES IT FATAL. Knowledge
// resolves the moment the durable source id arrives — not the moment the document is READABLE.
// `ensureKnowledgeForCanvas` returns `nothingToRead()` for a source whose canonical row has not
// landed, the hook sets `status: "unavailable"` for zero supported objectives, and an unchanged key
// makes that verdict permanent for the life of the mount. A remount resolves again, later, when the
// parse is readable — which is precisely why reopening worked and looked like a different bug.
//
// 🔴 THE PRE-REGISTERED TRAP FOR WHOEVER VERIFIES THIS, WRITTEN DOWN BEFORE THE FIX. Landing on
// "Nothing to practise here right now" still means the policy never looked again: #597 turns a blank
// page into an honest empty state, and a tester who sees the new copy can conclude it is fixed and
// be wrong. The property is that something is ASKED, without leaving the canvas and coming back.

const SOURCE_WITH_ID: CanvasSource = {
  id: "s1",
  librarySourceId: "lib-abc",
  title: "Lecture 3.pptx",
} as CanvasSource;
const SOURCE_PENDING: CanvasSource = { id: "s2", title: "Lecture 4.pdf" } as CanvasSource;

function canvas(over: Partial<LearningCanvas>): LearningCanvas {
  return {
    blocks: [],
    id: "c1",
    questions: [],
    recall: [],
    sources: [],
    state: "empty",
    title: "",
    ...over,
  } as unknown as LearningCanvas;
}

test("🔴🔴 pressing send makes the policy look again", () => {
  // The learner-visible property in the only form this layer can express it: the key that gates the
  // one effect which asks the policy anything must CHANGE across the commit. If it does not, no
  // amount of correct behaviour downstream can produce a question.
  const attached = canvas({ sources: [SOURCE_WITH_ID], state: "sources_attached" });
  const begun = canvas({ sources: [SOURCE_WITH_ID], state: "learn" });
  assert.notEqual(
    knowledgeSignature(begun),
    knowledgeSignature(attached),
    "pressing send left the key unchanged, so the policy can never look again in this session",
  );
});

test("🔴 and a topic-first canvas keeps working, which is what the key was widened for once already", () => {
  // The previous defect in this same function was the mirror image: the key could not see a TITLE,
  // so a canvas started from a typed topic resolved once against an empty title and never again.
  // Widening it must not narrow that.
  const untitled = canvas({ state: "empty", title: "" });
  const titled = canvas({ state: "empty", title: "pharmacokinetics" });
  assert.notEqual(knowledgeSignature(untitled), knowledgeSignature(titled));
  // …and committing a topic canvas is still a reason to look again.
  assert.notEqual(
    knowledgeSignature(canvas({ state: "learn", title: "pharmacokinetics" })),
    knowledgeSignature(titled),
  );
});

test("🔴 a source arriving still re-keys — the original reason this function exists", () => {
  const empty = canvas({ state: "sources_attached" });
  const withSource = canvas({ sources: [SOURCE_WITH_ID], state: "sources_attached" });
  assert.notEqual(knowledgeSignature(empty), knowledgeSignature(withSource));
  const two = canvas({ sources: [SOURCE_WITH_ID, { ...SOURCE_PENDING, librarySourceId: "lib-def" } as CanvasSource], state: "sources_attached" });
  assert.notEqual(knowledgeSignature(withSource), knowledgeSignature(two));
});

test("🔴 renaming a canvas that has sources still does NOT re-extract", () => {
  // The reason the title is deliberately absent from the key once sources exist: re-running the
  // whole extraction because someone edited a label is a round trip and a model call for a cosmetic
  // change. Widening the key must not have quietly bought that back.
  const before = canvas({ sources: [SOURCE_WITH_ID], state: "learn", title: "Lecture 3" });
  const renamed = canvas({ sources: [SOURCE_WITH_ID], state: "learn", title: "Pharmacology week 2" });
  assert.equal(knowledgeSignature(before), knowledgeSignature(renamed));
});

test("🔴 the committed states do not re-key against EACH OTHER", () => {
  // The bit is two-valued on purpose. Raw `canvas.state` would re-resolve on every transition —
  // including ones that say nothing about knowledge — and each is a fresh round trip on every stored
  // canvas. Only the crossing from pre-commit to committed may change the answer.
  const committed = ["learn", "orient", "targeted_relearn", "recall", "test", "complete"] as const;
  const keys = new Set(
    committed.map((state) => knowledgeSignature(canvas({ sources: [SOURCE_WITH_ID], state: state as never }))),
  );
  assert.equal(keys.size, 1, "a state transition that is not the commit must not re-extract");
});

test("🔴 the pre-commit states do not re-key against each other either", () => {
  const pre = ["empty", "sources_attached"] as const;
  const keys = new Set(
    pre.map((state) => knowledgeSignature(canvas({ sources: [SOURCE_WITH_ID], state: state as never }))),
  );
  assert.equal(keys.size, 1);
});

test("🔴 REPORTED, NOT FIXED — the race is still open, and the fix must not be read as closing it", async () => {
  // What this buys is ONE more attempt, at the moment the learner commits. If the parse is still
  // unreadable then, they are stranded exactly as before and the canvas is again unrecoverable
  // without leaving and coming back.
  //
  // Closing it properly means a resolution that produced NOTHING stops being final — a bounded
  // retry, which is a larger change than this and is not smuggled in here. Pinned so the limit is a
  // recorded choice rather than something a later reader assumes was handled.
  //
  // 🔴 ASSERTED ON THE SOURCE BECAUSE THE THING BEING PINNED IS AN ABSENCE. There is no retry, and a
  // behavioural test cannot demonstrate the absence of one; what it can do is fail the moment
  // somebody adds one, so the note above stops being true and gets read.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  for (const retry of ["setTimeout(() => setStatus", "retryResolve", "resolveAttempts", "setInterval"]) {
    assert.equal(
      code.includes(retry),
      false,
      `a retry appeared (${retry}) — update the note that says the race is still open, and bound it`,
    );
  }
  assert.match(code, /status === "ready"\s*$|setStatus\("unavailable"\)/m, "the empty verdict is still set once");
});
