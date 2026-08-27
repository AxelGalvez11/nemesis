import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { joinSpoken, readHeard, type HeardResult } from "./dictation-transcript";

// ── every dictated sentence was being sent twice ────────────────────────────────────────────────
//
// 🔴🔴🔴 THE DEFECT, IN THE OWNER'S OWN DATA. Read off the history rail of their canvas on
// production, 2026-08-26. Four separate recorded moments, every one the whole utterance repeated:
//
//     "did you get my attachment did you get my attachment"
//     "I just attached the community IP charts I just attached the community IP charts…"
//     "can you teach me this can you teach me this…"
//     "what is this and why did you randomly jump to something weird… what is this and why did…"
//
// It was in the stored message rather than the rendering — the rail's label reads `moment.userText`
// and the rewound bubble reads it again — so the duplicated string reached the model as well.
//
// 🔴 THERE WERE TWO CAUSES, NOT ONE, AND EITHER ALONE PRODUCES EXACTLY THIS. Both are exercised
// below. Fixing one and shipping would have looked like a fix and left the other doubling every
// sentence that happened to take the other path.

/** A recogniser result, written the way the browser hands one over. */
const heard = (transcript: string, isFinal = false): HeardResult => ({ isFinal, transcript });

/** Feed a run of events through the reader the way the hook does, carrying the count. */
function replay(events: readonly (readonly HeardResult[])[]): { settled: string; pending: string } {
  let settledCount = 0;
  let settled = "";
  let pending = "";
  for (const results of events) {
    const step = readHeard({ results, settledCount });
    settledCount = step.settledCount;
    if (step.settled) settled = joinSpoken(settled, step.settled);
    pending = step.pending;
  }
  return { pending, settled };
}

test("a phrase drafted word by word and then finalised is written down once", () => {
  const { settled, pending } = replay([
    [heard("did")],
    [heard("did you")],
    [heard("did you get my attachment")],
    [heard("did you get my attachment", true)],
  ]);
  assert.equal(settled, "did you get my attachment");
  assert.equal(pending, "", "the phrase stayed in flight after it was settled");
});

test("🔴🔴🔴 CAUSE ONE: an event that points back at a final already consumed does NOT repeat it", () => {
  // This is the shape the old handler could not survive. It looped `for (i = event.resultIndex; …)`
  // and appended every final it found, which is what every Web Speech example does — and it is only
  // correct while `resultIndex` runs strictly ahead of what has been consumed. Chrome does not
  // promise that: with `continuous` and `interimResults` both on, an event carrying interim words
  // for the NEXT phrase can arrive with `resultIndex` pointing back AT the final before it.
  //
  // Reproduced here by re-delivering the whole list, which is what the browser actually does — the
  // result list is cumulative, and only the index moves.
  const settledPhrase = heard("did you get my attachment", true);
  const { settled } = replay([
    [settledPhrase],
    // the same final, handed over again, now with the next phrase forming behind it
    [settledPhrase, heard("and")],
    [settledPhrase, heard("and did you")],
  ]);
  assert.equal(settled, "did you get my attachment", "the settled phrase was written down twice");
});

test("🔴 …and the phrase forming behind it is still reported, whole, every time", () => {
  const settledPhrase = heard("can you teach me this", true);
  const step = readHeard({ results: [settledPhrase, heard("or is it")], settledCount: 1 });
  assert.equal(step.settled, "", "an already-consumed final leaked back into the settled text");
  assert.equal(step.pending, "or is it");
  assert.equal(step.settledCount, 1, "the count moved for a result nobody consumed");
});

test("🔴 pending REPLACES rather than accumulates, so no draft of a phrase survives into the text", () => {
  const { pending, settled } = replay([
    [heard("what is")],
    [heard("what is this")],
    [heard("what is this and why")],
  ]);
  assert.equal(settled, "", "an interim phrase was settled before the recogniser committed to it");
  assert.equal(pending, "what is this and why", "the drafts piled up instead of replacing each other");
});

test("🔴 an interim that goes EMPTY withdraws the draft rather than leaving it on screen", () => {
  // The recogniser abandoning a phrase it was drafting is a real event, and skipping empty results
  // (which the old loop did, with `if (!said) continue`) leaves the previous draft up for ever.
  const step = readHeard({ results: [heard("")], settledCount: 0 });
  assert.equal(step.pending, "");
});

test("several phrases finalising in order are joined once each, in order", () => {
  const one = heard("first phrase", true);
  const two = heard("second phrase", true);
  const { settled } = replay([[one], [one, heard("second")], [one, two], [one, two, heard("third")]]);
  assert.equal(settled, "first phrase second phrase");
});

test("🔴 two finals arriving in ONE event are both taken, and taken once", () => {
  // A fast speaker, or a browser batching. Both are new, so both are written down; a second
  // delivery of the same event must add nothing.
  const results = [heard("one", true), heard("two", true)];
  const first = readHeard({ results, settledCount: 0 });
  assert.equal(first.settled, "onetwo");
  assert.equal(first.settledCount, 2);
  assert.equal(readHeard({ results, settledCount: first.settledCount }).settled, "");
});

test("🔴 a count from a previous RUN cannot swallow the new run's first phrase", () => {
  // `continuous` recognition ends itself on a pause and the hook restarts it; each run begins a
  // fresh list at index zero. The hook resets the count at exactly that moment, and this is what
  // that reset is protecting: with a stale count of 3, the first three phrases of the new run are
  // silently dropped.
  const results = [heard("brand new phrase", true)];
  assert.equal(readHeard({ results, settledCount: 3 }).settled, "", "a stale count is being tolerated rather than reset");
  assert.equal(readHeard({ results, settledCount: 0 }).settled, "brand new phrase");
});

test("a negative or absurd count is read as zero rather than throwing", () => {
  assert.equal(readHeard({ results: [heard("x", true)], settledCount: -4 }).settled, "x");
});

// ── joinSpoken: the one place the single space lives ────────────────────────────────────────────

test("joinSpoken puts exactly one space between two pieces, and none around an empty one", () => {
  assert.equal(joinSpoken("first", "second"), "first second");
  assert.equal(joinSpoken("", "second"), "second");
  assert.equal(joinSpoken("first", ""), "first");
  assert.equal(joinSpoken("", ""), "");
  assert.equal(joinSpoken("first ", "  second"), "first second", "the join is doubling or keeping whitespace");
});

// ── CAUSE TWO: the write that lived inside a state updater ──────────────────────────────────────

test("🔴🔴🔴 CAUSE TWO: `stop` never writes state from inside a state updater", () => {
  // The other half, and the one that is invisible in a diff because it reads like an assignment:
  //
  //     setInterim((current) => {
  //       if (current.trim()) setSettled((done) => …);   // ← a WRITE, inside an updater
  //       return "";
  //     });
  //
  // A state updater must be a pure function of its argument. React is free to run one more than
  // once for a single update: it evaluates eagerly to see whether the render can be skipped, then
  // again while rendering, and re-runs updaters whenever a render is thrown away and restarted.
  // Every one of those runs appended the in-flight phrase again.
  //
  // 🔴 THE GUARD READS THE SOURCE BECAUSE THE HOOK OPENS A MICROPHONE and nothing in this repository
  // can mount it. What it pins is the property, not the spelling: no `setX` call may appear inside
  // another `setX` call's updater anywhere in the file.
  const source = readFileSync(new URL("../../components/workspace/learn/use-canvas-dictation.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const nested = /set[A-Z]\w*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,400}?\bset[A-Z]\w*\(/.exec(code);
  assert.equal(nested, null, `a state write is nested inside a state updater again:\n${nested?.[0] ?? ""}`);

  // And `stop` reads the in-flight phrase from the ref that exists for it, which is also what makes
  // a second `stop` a no-op rather than a second append.
  const stop = code.slice(code.indexOf("const stop = useCallback"), code.indexOf("const start = useCallback"));
  assert.ok(stop.length > 0, "the stop handler is gone — this guard is pointed at nothing");
  assert.match(stop, /pendingPhrase\.current = "";/, "`stop` no longer clears the in-flight phrase, so a second stop appends it again");
  assert.match(stop, /joinSpoken\(done, trailing\)/, "`stop` stopped using the one join rule");
});

test("🔴 the hook consumes the results through `readHeard`, not through its own loop", () => {
  const source = readFileSync(new URL("../../components/workspace/learn/use-canvas-dictation.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /readHeard\(\{/, "the hook went back to reading the result list itself");
  assert.ok(!/resultIndex/.test(code), "`resultIndex` is being read again; that is what doubled the sentence");
  // The count is reset where a new result list begins, and only there.
  assert.equal((code.match(/written\.current = 0;/g) ?? []).length, 4, "the run counter is reset in a different number of places than the four that begin or end a run");
});
