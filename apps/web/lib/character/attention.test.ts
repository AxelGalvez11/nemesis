// One clock, and the one thing it has to guarantee.
//
// 🔴 THE FIRST TEST IS THE OWNER'S SENTENCE AND EVERYTHING ELSE IS SUPPORTING. *"During expressions
// the mouse still moves the mascot eyes"* is a claim about a coincidence — two things that were
// never meant to be on screen together. A coincidence cannot be tested by sampling one moment, so
// this walks a full pass of the clock and asserts the two states never share an instant.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { attentionAt, FOLLOW_MS } from "./attention";
import { holdFor, isMontageLoop, MONTAGE, resolveMontage } from "./montage";

const DOCK = readFileSync("components/character/character-dock.tsx", "utf8");
const HOOK = readFileSync("components/character/use-montage.ts", "utf8");
const HOME = readFileSync("components/workspace/learn/canvas-home.tsx", "utf8");

/** One full pass of the default list, in ms. */
const PASS = MONTAGE.length * FOLLOW_MS + MONTAGE.reduce((a, id) => a + holdFor(id), 0);

/** Every 250ms of a pass, as `{ ms, at }`. */
function walk(step = 250) {
  const out: { ms: number; at: ReturnType<typeof attentionAt> }[] = [];
  for (let ms = 0; ms < PASS; ms += step) out.push({ ms, at: attentionAt({ ms }) });
  return out;
}

test("🔴🔴🔴 watching you and wearing a face never share an instant", () => {
  // The whole change, in one assertion. Two clocks could only make this PROBABLE; one makes it
  // structural — there is a single answer per instant and it is either a face or the pointer.
  for (const { ms, at } of walk()) {
    if (at.kind === "absorbed") assert.ok(at.entry, `${ms}ms is absorbed in nothing`);
    else assert.equal(at.kind, "follow");
  }
  const kinds = new Set(walk().map((w) => w.at.kind));
  assert.deepEqual([...kinds].sort(), ["absorbed", "follow"], "the clock only ever does one of the two");
});

test("🔴 a character that has just come to rest WATCHES YOU", () => {
  // The single most repeated report about this character is that it does not follow the mouse —
  // three times. Whatever a learner sees in the first seconds after anything happens is it
  // watching them, and the rest clock restarting is what makes that true after every answer too.
  assert.equal(attentionAt({ ms: 0 }).kind, "follow");
  assert.equal(attentionAt({ ms: FOLLOW_MS - 1 }).kind, "follow");
  assert.equal(attentionAt({ ms: FOLLOW_MS }).kind, "absorbed", "the first face does not arrive when it says it does");
  // A clock that has not started, and `performance.now()` read before the first frame, are real.
  assert.equal(attentionAt({ ms: -1 }).kind, "follow");
  assert.equal(attentionAt({ ms: Number.POSITIVE_INFINITY }).kind, "follow");
  assert.equal(attentionAt({ ms: Number.NaN }).kind, "follow");
});

test("🔴 following keeps the majority, and faces get close to half", () => {
  // Two reports pull opposite ways and both are the owner's. "Not following the mouse at all",
  // three times, is why following wins; the expressions not landing, four times, is why it only
  // just wins. The old split gave faces a third of the time and drowned all of it.
  const rows = walk(50);
  const away = rows.filter((r) => r.at.kind === "absorbed").length / rows.length;
  assert.ok(away > 0.4, `faces get ${(away * 100).toFixed(0)}% — that is the 2026-08-30 report again`);
  assert.ok(away < 0.5, `faces get ${(away * 100).toFixed(0)}% — following has to stay the majority`);
});

test("🔴 every entry the owner ticked is actually reached, in his order", () => {
  // 🔴 THE HALF THAT WAS SILENTLY BROKEN BEFORE. A face was chosen off the rest clock while the
  // cursor was let go of on a separate one, so which entries a learner ever SAW with the pointer
  // out of the way was a coincidence of two periods. Now a pass is a pass.
  const seen: string[] = [];
  for (const { at } of walk(100)) {
    if (at.kind === "absorbed" && seen[seen.length - 1] !== at.entry) seen.push(at.entry);
  }
  assert.deepEqual(seen, [...MONTAGE], "a pass no longer plays every entry once, in order");
});

test("🔴 an entry gets its OWN length, not a fixed one", () => {
  // A loop cut off part way through is, on screen, the held face it exists to replace:
  // `gaze-searching` is six poses over 16.8s and five seconds of it is two poses and a cut.
  for (const id of ["gaze-searching", "neutral"]) {
    const rows = walk(100).filter((r) => r.at.kind === "absorbed" && r.at.entry === id);
    const span = rows[rows.length - 1]!.ms - rows[0]!.ms;
    assert.ok(Math.abs(span - holdFor(id)) < 300, `${id} runs ${span}ms against its own ${holdFor(id)}ms`);
  }
});

test("🔴 a round always contains real movement — the old gate's reasoning, kept as a check", () => {
  // The dock used to REFUSE to let go of the pointer unless the montage happened to be playing
  // something that moves, which measured as 55 seconds of every 193 where it could never let go.
  // The reasoning was sound: a character that stops following and then does nothing is worse than
  // one that does not stop. It is satisfied by construction now — never more than one held face
  // before another loop — so this asserts the property rather than enforcing it.
  const entries = [...resolveMontage(null)];
  let heldRun = 0;
  let worst = 0;
  for (const id of [...entries, ...entries]) {
    heldRun = isMontageLoop(id) ? 0 : heldRun + 1;
    worst = Math.max(worst, heldRun);
  }
  const stillMs = worst * (holdFor("neutral") + FOLLOW_MS);
  assert.ok(worst > 0, "the default list has no held feelings left in it");
  assert.ok(stillMs < 200_000, `${Math.round(stillMs / 1000)}s can pass with no movement loop`);
});

test("🔴 two characters on one page are not in step", () => {
  // The front door hands over to the canvas, so two of these can be mounted a second apart.
  const a = attentionAt({ ms: FOLLOW_MS + 100, seed: 0 });
  const b = attentionAt({ ms: FOLLOW_MS + 100, seed: 5 });
  assert.equal(a.kind, "absorbed");
  assert.equal(b.kind, "absorbed");
  assert.notEqual(a.kind === "absorbed" && a.entry, b.kind === "absorbed" && b.entry);
  // 🔴 THE SEED ROTATES THE LIST, IT DOES NOT OFFSET THE CLOCK. A seeded character still watches
  // first; offsetting time would drop it mid-loop on its very first frame.
  assert.equal(attentionAt({ ms: 0, seed: 7 }).kind, "follow");
});

test("🔴 a learner's own list drives it, however broken", () => {
  const mine = attentionAt({ ms: FOLLOW_MS + 100, chosen: ["happy", "gaze-curious"] });
  assert.equal(mine.kind, "absorbed");
  assert.equal(mine.kind === "absorbed" && mine.entry, "happy");
  // Unticking everything means the DEFAULT, not a character with no face: `resolveMontage` owns
  // that and this is the path that would otherwise divide by zero.
  assert.equal(attentionAt({ ms: FOLLOW_MS + 100, chosen: [] }).kind, "absorbed");
  assert.equal(attentionAt({ ms: FOLLOW_MS + 100, chosen: ["not-a-face"] }).kind, "absorbed");
});

test("🔴🔴 both surfaces take the cursor away for exactly as long as a face is on", () => {
  // 🔴 THE HOOK CANNOT ENFORCE THIS AND THAT IS WHY IT IS PINNED HERE. `useMontage` hands back a
  // face and a flag; the surfaces own tracking. A surface that draws the face and keeps `track`
  // is the bug exactly as it was, and it would read as the expressions having stopped working
  // rather than as a gaze bug — which is how it survived four reports.
  assert.match(HOOK, /readonly absorbed: boolean;/, "the hook stopped saying whether it is wearing a face");
  assert.match(DOCK, /absorbed: stretch,/, "the dock decides the gaze from something other than the face");
  assert.match(DOCK, /const stretch = absorbedRef\.current;/, "the dock runs an attention clock of its own again");
  assert.ok(
    !/absorbedCycleAt|attentionAt/.test(DOCK),
    "the dock computes attention itself again — that is the two-clock bug",
  );
  assert.match(HOME, /track=\{!greeterFace\.absorbed\}/, "the front door follows the mouse through its own expressions");
});

test("🔴 the superseded clocks are gone, not merely unused", () => {
  // Both were correct on their own; leaving either in reach is leaving the overlap one import away.
  const gaze = readFileSync("lib/character/gaze.ts", "utf8");
  const montage = readFileSync("lib/character/montage.ts", "utf8");
  for (const dead of ["export function absorbedAt", "export function absorbedCycleAt", "export const ATTENTION_CYCLE_MS"]) {
    assert.ok(!gaze.includes(dead), `${dead} is still callable`);
  }
  for (const dead of ["export function montageFace", "export function montageLoop"]) {
    assert.ok(!montage.includes(dead), `${dead} is still callable`);
  }
});
