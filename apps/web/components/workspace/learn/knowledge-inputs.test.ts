import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { emptyCanvas, type LearningCanvas } from "@/lib/learn/canvas-model";

import { knowledgeSignature } from "./use-policy-runtime";

// The front door, and why it was shut.
//
// 🔴 THE DEFECT. Knowledge is resolved in an effect keyed on a signature of the canvas, so that
// attaching material re-resolves and re-rendering does not. That key was the durable SOURCES alone —
// complete for exactly as long as sources were the only thing knowledge could come from. The
// topic-first constructor added a second input, `canvas.title`, and did not extend the key.
//
// For a canvas with no sources the old key is "" on mount and "" for ever after. So the effect ran
// ONCE, against a canvas whose title had not arrived yet, `topicTerritory` returned at `if (!topic)`
// with nothing, and the title landing a moment later could not make it run again. A learner who
// typed a topic got a blank canvas — no question, and no lesson either, because the lesson was
// deliberately removed from that path at the same time.
//
// 🔴 AND EVERY INSTRUMENT SAW A HEALTHY SYSTEM. The title check sits ABOVE the thinking caption, so
// no phase was emitted; it returns before the model call, so there was no request and no spend; and
// "no objectives" is a legitimate outcome, so there was no error. The measured tell — *no loading
// state ever appeared* — is the thing that distinguishes this from the constructor running and
// rejecting everything, which would have emitted a phase and taken seconds.

function canvas(over: Partial<LearningCanvas> = {}): LearningCanvas {
  return { ...emptyCanvas("c1", "2026-08-13T00:00:00Z"), ...over };
}
const withSource = (title: string) =>
  canvas({ sources: [{ excerpts: [], id: "s1", kind: "document", librarySourceId: "lib-1", title: "Lecture 4" }] as LearningCanvas["sources"], title });

// ── the defect, directly ────────────────────────────────────────────────────

test("🔴 a topic arriving on a sourceless canvas CHANGES the key, so knowledge resolves again", () => {
  // This is the whole bug in one assertion. Before the fix both sides were "".
  const beforeTheTitleLands = knowledgeSignature(canvas({ title: "" }));
  const afterTheTitleLands = knowledgeSignature(canvas({ title: "how a four-stroke diesel engine works" }));
  assert.notEqual(
    afterTheTitleLands,
    beforeTheTitleLands,
    "a topic-first canvas must re-resolve when its topic arrives, or it is blank for ever",
  );
});

test("two different topics are two different keys", () => {
  assert.notEqual(
    knowledgeSignature(canvas({ title: "how a four-stroke diesel engine works" })),
    knowledgeSignature(canvas({ title: "the doctrine of consideration" })),
  );
});

test("the same topic is the same key — re-rendering must not rebuild a territory", () => {
  // The property the original key existed to protect, and it still holds. Rebuilding on every
  // render would mean a model call per render.
  assert.equal(
    knowledgeSignature(canvas({ title: "  organic chemistry  " })),
    knowledgeSignature(canvas({ title: "organic chemistry" })),
    "whitespace is not a new topic",
  );
});

// ── 🔴 what must NOT have changed ───────────────────────────────────────────

test("🔴 renaming a canvas that HAS sources does not re-resolve it", () => {
  // There, knowledge is a reading of the learner's own material and the title is a label on it.
  // Re-extracting a document canvas because someone renamed it would repeat the whole parse for a
  // cosmetic edit — the exact cost the original key was written to avoid.
  assert.equal(
    knowledgeSignature(withSource("Lecture 4")),
    knowledgeSignature(withSource("Lecture 4 — exam material")),
  );
});

test("attaching material still re-resolves, and it stops depending on the topic once it exists", () => {
  const topicOnly = knowledgeSignature(canvas({ title: "pharmacology" }));
  const nowHasMaterial = knowledgeSignature(withSource("pharmacology"));
  assert.notEqual(nowHasMaterial, topicOnly, "material arriving must re-resolve");
});

test("a canvas with neither a topic nor sources is one stable key, and asks for nothing", () => {
  // The genuinely empty canvas. It must not thrash, and there is nothing to build from.
  assert.equal(knowledgeSignature(canvas({ title: "" })), knowledgeSignature(canvas({ title: "   " })));
});

// ── the wiring, which is the half a pure test cannot see ───────────────────

test("🔴 the effect is actually keyed on the knowledge inputs", async () => {
  // A correct signature consulted by nothing is the defect unchanged. The dependency array is the
  // thing that was wrong, so the dependency array is what this asserts.
  const source = await readFile(new URL("./use-policy-runtime.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /\}, \[enabled, forced, knowledgeInputs, uid\]\);/,
    "the knowledge-resolving effect must depend on every input that resolution reads",
  );
  assert.equal(
    source.includes("durableSignature"),
    false,
    "the sources-only key must be gone, not merely unused — leaving it invites the same mistake back",
  );
});
