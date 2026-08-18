import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

  // 🔴 EVERY REQUIRED INPUT IS PRESENT — asserted per name rather than as one exact string. The
  // defect this guards is a dependency that went MISSING, and pinning the literal array also failed
  // on a dependency being ADDED, which is the opposite thing. It rejected `resolveNonce`, the input
  // that lets a canvas look again while its parse is still landing — a fix, failing a guard for
  // succeeding. Named deps still catch a removal, and no longer punish a legitimate addition.
  // Located BY `knowledgeInputs`, because that names the one effect under test. Matching "the
  // first dependency array in the file" found an unrelated `[]` and reported a missing `enabled`
  // that was sitting correctly in the array three hundred lines further down.
  const deps = source.match(/\}, \[([^\]]*\bknowledgeInputs\b[^\]]*)\]\);/);
  assert.ok(deps, "the knowledge-resolving effect's dependency array was not found at all");
  const listed = (deps[1] ?? "").split(",").map((entry) => entry.trim());
  for (const required of ["enabled", "forced", "knowledgeInputs", "uid"]) {
    assert.ok(
      listed.includes(required),
      `the knowledge-resolving effect must depend on \`${required}\` — resolution reads it`,
    );
  }
  assert.equal(
    source.includes("durableSignature"),
    false,
    "the sources-only key must be gone, not merely unused — leaving it invites the same mistake back",
  );
});

// ── the retry, which is the half the dependency array cannot see ────────────

test("🔴 a canvas whose parse has not landed gets looked at again", () => {
  // 🔴 THIS GUARD EXISTS BECAUSE THE FIRST VERSION OF THE FIX HAD NONE. Replacing the retry's
  // condition with `false` — disabling the whole thing — left all 3,755 tests green. The dependency
  // guard above proves the effect CAN re-run; nothing proved anything ever asks it to.
  //
  // The defect: knowledge resolves the moment a durable id lands, which is not the moment the parse
  // is readable, so the first look legitimately returns nothing and that verdict was permanent for
  // the life of the mount. Measured in production — three pages attached, 35 knowledge objects and
  // 69 objectives written, and the learner still reading "hasn't found anything to ask you about
  // yet" until they pressed Try again, which is a page reload.
  const source = readFileSync(new URL("./use-policy-runtime.ts", import.meta.url), "utf8");

  // The retry is CONDITIONAL ON THE NAMED OUTCOME, never on emptiness alone. A canvas that genuinely
  // has nothing to teach must still settle, or it re-resolves for ever and bills for every look.
  assert.match(
    source,
    /resolved\.outcome === "no-durable-source"[\s\S]{0,120}?KNOWLEDGE_RETRY_LIMIT/,
    "the re-resolve must be gated on the parse not having landed, and bounded",
  );
  // And it must actually ask for another look.
  assert.match(source, /setResolveNonce\(\(current\) => current \+ 1\)/, "the retry must request a re-resolve");
  // Bounded, and small enough that an unwatched canvas cannot bill indefinitely.
  const limit = source.match(/const KNOWLEDGE_RETRY_LIMIT = (\d+)/);
  assert.ok(limit, "the retry limit must be a named constant");
  assert.ok(Number(limit[1]) > 0 && Number(limit[1]) <= 5, `retry limit ${limit?.[1]} is not small and finite`);
});
