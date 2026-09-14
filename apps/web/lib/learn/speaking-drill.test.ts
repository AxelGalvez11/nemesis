/**
 * The drill is bounded, and no sequence of events can unbound it.
 *
 * 🔴🔴 THE TERMINATION TEST BELOW IS THE WHOLE POINT OF THIS FILE. Everything else here checks that
 * a malformed script is refused, which matters; that one checks that a WELL-FORMED script cannot be
 * driven into an open microphone by any sequence of events, which is what the owner asked for on
 * 2026-09-01. It is exhaustive rather than illustrative because "I could not think of a sequence
 * that loops" is not the same claim as "no sequence loops", and the state space is small enough to
 * settle the stronger one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TURN_SECONDS,
  MAX_ASK,
  MAX_TURNS,
  MAX_TURN_SECONDS,
  MIN_TURNS,
  MIN_TURN_SECONDS,
  type DrillEvent,
  type SpeakingDrill,
  drillAdvance,
  drillAnswered,
  drillProgress,
  drillSeconds,
  drillSpokenCharacters,
  drillStart,
  drillTurn,
  readSpeakingDrill,
} from "./speaking-drill";

function turns(count: number, seconds = 20): unknown[] {
  return Array.from({ length: count }, (_unused, index) => ({ ask: `Say something about step ${index + 1}.`, seconds }));
}

test("a script with too few turns is refused, not shortened", () => {
  assert.equal(readSpeakingDrill({ turns: turns(MIN_TURNS - 1) }), null);
  assert.equal(readSpeakingDrill({ turns: [] }), null);
  assert.equal(readSpeakingDrill({ turns: turns(MIN_TURNS) })?.turns.length, MIN_TURNS);
});

test("a script with too many turns is truncated, and the drill survives", () => {
  const drill = readSpeakingDrill({ turns: turns(MAX_TURNS + 7) });
  assert.equal(drill?.turns.length, MAX_TURNS);
});

test("🔴 no script can exceed the ceiling, however it was written", () => {
  // The two numbers a cost model would want, at their worst. Both must hold for ANY input.
  const greedy = readSpeakingDrill({
    title: "x".repeat(500),
    turns: Array.from({ length: 40 }, () => ({ ask: "y".repeat(4000), seconds: 100_000 })),
  });
  assert.ok(greedy);
  assert.equal(drillSeconds(greedy), MAX_TURNS * MAX_TURN_SECONDS);
  assert.ok(drillSpokenCharacters(greedy) <= MAX_TURNS * (MAX_ASK + 120));
  assert.ok(greedy.title.length <= 80);
});

test("listening windows are clamped, never refused", () => {
  const drill = readSpeakingDrill({
    turns: [
      { ask: "One.", seconds: 1 },
      { ask: "Two.", seconds: 9_000 },
      { ask: "Three.", seconds: "twenty" },
      { ask: "Four." },
    ],
  });
  assert.deepEqual(drill?.turns.map((turn) => turn.seconds), [
    MIN_TURN_SECONDS,
    MAX_TURN_SECONDS,
    DEFAULT_TURN_SECONDS,
    DEFAULT_TURN_SECONDS,
  ]);
});

test("a turn with no ask is dropped; the rest of the script survives", () => {
  const drill = readSpeakingDrill({ turns: [{ ask: "One." }, { ask: "   " }, { ask: "Two." }, { ask: "Three." }, null] });
  assert.deepEqual(drill?.turns.map((turn) => turn.ask), ["One.", "Two.", "Three."]);
});

test("🔴 a target-language line needs both halves, and losing it does not lose the turn", () => {
  // §43's rule: an utterance without a named variety is the failure a learner cannot hear.
  const drill = readSpeakingDrill({
    turns: [
      { ask: "Repeat this.", say: { locale: "de-DE", text: "Guten Morgen." } },
      { ask: "And this.", say: { text: "no locale" } },
      { ask: "And this.", say: { locale: "fr-FR" } },
    ],
  });
  assert.equal(drill?.turns.length, 3);
  assert.deepEqual(drill?.turns[0]?.say, { locale: "de-DE", text: "Guten Morgen." });
  assert.equal(drill?.turns[1]?.say, null);
  assert.equal(drill?.turns[2]?.say, null);
});

test("rubbish in is null out", () => {
  for (const bad of [null, undefined, 7, "turns", [], { turns: "three" }, { turns: {} }]) {
    assert.equal(readSpeakingDrill(bad), null, `${JSON.stringify(bad)} produced a drill`);
  }
});

/* ------------------------------------------------------------------ the bound ---- */

const DRILL: SpeakingDrill = readSpeakingDrill({ title: "Recite it back", turns: turns(4) })!;

test("a run walks its script once and stops", () => {
  let state = drillStart();
  const seen: number[] = [];
  for (let step = 0; step < 50 && state.stage !== "done"; step += 1) {
    seen.push(state.index);
    state = drillAdvance(DRILL, state, { type: "spoke" });
    state = drillAdvance(DRILL, state, { said: `answer ${state.index}`, type: "heard" });
  }
  assert.equal(state.stage, "done");
  assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.equal(state.heard.length, DRILL.turns.length);
});

test("🔴🔴 THE MICROPHONE CANNOT OPEN MORE TIMES THAN THE SCRIPT HAS TURNS — proved by exhaustion", () => {
  // 🔴 THE FIRST VERSION OF THIS TEST ASSERTED THE WRONG THING, and the failure was instructive
  // enough to keep the reason written down. It claimed every path terminates within 2N events,
  // which is false and SHOULD be false: a path made only of events that arrive in the wrong stage
  // is a run of stale timers, and doing nothing is the correct response to each of them. Such a
  // path never ends, and never opens a microphone either.
  //
  // What actually needs proving is the resource bound. Entering `listening` is the only thing in
  // this state machine that opens a microphone and spends money, so the claim is that no sequence
  // of events, of any length, can enter it more times than the script has turns. Explored as a
  // reachability search over every state the machine can be in, which settles it for all lengths at
  // once rather than up to some depth.
  const EVENTS: DrillEvent[] = [{ type: "spoke" }, { said: "words", type: "heard" }, { said: "", type: "heard" }, { type: "stopped" }];
  const key = (state: { index: number; stage: string; heard: readonly string[] }, mics: number) =>
    `${state.index}/${state.stage}/${state.heard.length}/${mics}`;

  const start = drillStart();
  const seen = new Set([key(start, 0)]);
  let frontier: { state: ReturnType<typeof drillStart>; mics: number }[] = [{ mics: 0, state: start }];
  let worstMics = 0;
  let visited = 0;

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { mics, state } of frontier) {
      for (const event of EVENTS) {
        const after = drillAdvance(DRILL, state, event);
        visited += 1;
        // The two structural invariants, on every edge in the whole graph.
        assert.ok(after.index >= state.index, "a drill went back to an earlier turn");
        assert.ok(after.index < DRILL.turns.length, "a drill pointed past the end of its own script");
        assert.ok(after.heard.length <= DRILL.turns.length, "a drill recorded more answers than it has turns");

        const opened = after.stage === "listening" && state.stage !== "listening" ? mics + 1 : mics;
        worstMics = Math.max(worstMics, opened);
        assert.ok(opened <= DRILL.turns.length, `the microphone opened ${opened} times on a ${DRILL.turns.length} turn script`);
        if (after.stage === "done") continue;
        const id = key(after, opened);
        if (seen.has(id)) continue;
        seen.add(id);
        next.push({ mics: opened, state: after });
      }
    }
    frontier = next;
  }

  // The search is only worth trusting if it went everywhere, and if the ceiling is reachable
  // rather than merely un-exceeded. A live run is exactly one of `asking` or `listening` on one of
  // the script's turns, so a complete search sees two states per turn and no more: that equality
  // is both the coverage check and a statement that the machine has no states nobody designed.
  assert.equal(seen.size, DRILL.turns.length * 2, `the search reached ${seen.size} states, not ${DRILL.turns.length * 2}`);
  assert.equal(visited, seen.size * EVENTS.length, "some state was not offered every event");
  assert.equal(worstMics, DRILL.turns.length, "the script's own turns were never all reached");
});

test("🔴 done is final: every event bounces off it", () => {
  const done = drillAdvance(DRILL, { heard: ["a"], index: 3, stage: "listening" }, { said: "b", type: "heard" });
  assert.equal(done.stage, "done");
  for (const event of [{ type: "spoke" }, { said: "more", type: "heard" }, { type: "stopped" }] as DrillEvent[]) {
    const after = drillAdvance(DRILL, done, event);
    assert.equal(after.stage, "done");
    assert.deepEqual(after.heard, done.heard, "a finished drill recorded another answer");
  }
});

test("stopping keeps what was said and opens nothing", () => {
  let state = drillAdvance(DRILL, drillStart(), { type: "spoke" });
  state = drillAdvance(DRILL, state, { said: "first", type: "heard" });
  const stopped = drillAdvance(DRILL, state, { type: "stopped" });
  assert.equal(stopped.stage, "done");
  assert.deepEqual(stopped.heard, ["first"]);
  assert.equal(drillTurn(DRILL, stopped), null);
});

test("an event in the wrong stage is ignored rather than thrown", () => {
  const asking = drillStart();
  assert.deepEqual(drillAdvance(DRILL, asking, { said: "late timer", type: "heard" }), asking);
  const listening = drillAdvance(DRILL, asking, { type: "spoke" });
  assert.deepEqual(drillAdvance(DRILL, listening, { type: "spoke" }), listening);
});

test("silence is an answer and still moves the drill on", () => {
  let state = drillAdvance(DRILL, drillStart(), { type: "spoke" });
  state = drillAdvance(DRILL, state, { said: "   ", type: "heard" });
  assert.equal(state.index, 1);
  assert.deepEqual(state.heard, [""]);
  assert.equal(drillAnswered(state), false);
});

test("progress reads as a place in the script while running", () => {
  assert.deepEqual(drillProgress(DRILL, drillStart()), { at: 1, of: 4 });
  assert.deepEqual(drillProgress(DRILL, { heard: ["a", "b"], index: 2, stage: "listening" }), { at: 3, of: 4 });
});

test("🔴 a drill walked out of does not report itself as finished", () => {
  // The defect the exhaustion test found: `stopped` used to reset the index, so a run abandoned at
  // turn two read as "4 of 4" and the card congratulated the learner for it.
  let state = drillAdvance(DRILL, drillStart(), { type: "spoke" });
  state = drillAdvance(DRILL, state, { said: "first", type: "heard" });
  const quit = drillAdvance(DRILL, drillAdvance(DRILL, state, { type: "spoke" }), { type: "stopped" });
  assert.equal(quit.stage, "done");
  assert.deepEqual(drillProgress(DRILL, quit), { at: 1, of: 4 });

  let finished = drillStart();
  for (let turn = 0; turn < DRILL.turns.length; turn += 1) {
    finished = drillAdvance(DRILL, finished, { type: "spoke" });
    finished = drillAdvance(DRILL, finished, { said: `answer ${turn}`, type: "heard" });
  }
  assert.deepEqual(drillProgress(DRILL, finished), { at: 4, of: 4 });
});

console.log("speaking-drill.test.ts OK");
