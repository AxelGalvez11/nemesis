import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextTypewriterState, TYPEWRITER_START, type TypewriterState } from "./typewriter.ts";

const LINES = [3, 2]; // two short lines, so a full cycle is cheap to write out

/** Run n ticks and hand back the end state. */
function run(from: TypewriterState, n: number, lengths = LINES, hold = 2): TypewriterState {
  let state = from;
  for (let i = 0; i < n; i++) state = nextTypewriterState(state, lengths, hold);
  return state;
}

Deno.test("typing reveals one character per tick", () => {
  assertEquals(run(TYPEWRITER_START, 1).chars, 1);
  assertEquals(run(TYPEWRITER_START, 2).chars, 2);
  assertEquals(run(TYPEWRITER_START, 3).chars, 3);
});

Deno.test("a finished line holds instead of typing past its end", () => {
  const done = run(TYPEWRITER_START, 3);
  assertEquals(done.phase, "typing"); // arrived, not yet noticed
  const held = run(done, 1);
  assertEquals([held.chars, held.phase, held.ticks], [3, "holding", 0]);
});

Deno.test("holding lasts holdTicks, then starts erasing", () => {
  const held = run(TYPEWRITER_START, 4); // 3 to type + 1 to notice
  assertEquals(held.phase, "holding");
  assertEquals(run(held, 1).phase, "holding"); // ticks 0 -> 1 of 2
  assertEquals(run(held, 2).phase, "erasing");
});

Deno.test("erasing removes one character per tick", () => {
  const erasing = run(TYPEWRITER_START, 6);
  assertEquals(erasing.phase, "erasing");
  assertEquals(run(erasing, 1).chars, 2);
  assertEquals(run(erasing, 2).chars, 1);
  assertEquals(run(erasing, 3).chars, 0);
});

Deno.test("an empty line moves on to the next one", () => {
  const emptied = run(TYPEWRITER_START, 9); // typed, held, erased to 0
  assertEquals(emptied.chars, 0);
  const moved = run(emptied, 1);
  assertEquals([moved.line, moved.chars, moved.phase], [1, 0, "typing"]);
});

Deno.test("the last line wraps back to the first", () => {
  // Drive far enough to finish both lines and come round again.
  let state = TYPEWRITER_START;
  const seen: number[] = [];
  for (let i = 0; i < 40; i++) {
    state = nextTypewriterState(state, LINES, 2);
    if (state.chars === 0 && state.phase === "typing") seen.push(state.line);
  }
  // Line indices only ever advance 0 -> 1 -> 0 -> 1; never a 2 that isn't there.
  assertEquals(seen.includes(0), true);
  assertEquals(seen.includes(1), true);
  assertEquals(seen.every((line) => line < LINES.length), true);
});

Deno.test("chars never exceeds its line's length or drops below zero", () => {
  let state = TYPEWRITER_START;
  for (let i = 0; i < 200; i++) {
    state = nextTypewriterState(state, LINES, 2);
    const max = LINES[state.line] ?? 0;
    assertEquals(state.chars >= 0 && state.chars <= max, true, `tick ${i}: chars ${state.chars} of ${max}`);
  }
});

Deno.test("no lines at all: stands still rather than dividing by zero", () => {
  assertEquals(nextTypewriterState(TYPEWRITER_START, [], 2), TYPEWRITER_START);
});

Deno.test("a zero-length line still advances instead of stalling", () => {
  // Guards against a blank entry freezing the headline forever.
  const held = nextTypewriterState(TYPEWRITER_START, [0, 2], 1);
  assertEquals([held.chars, held.phase], [0, "holding"]);
  const erasing = nextTypewriterState(held, [0, 2], 1);
  assertEquals(erasing.phase, "erasing");
  assertEquals(nextTypewriterState(erasing, [0, 2], 1).line, 1);
});

Deno.test("a line index left over from a longer list restarts cleanly", () => {
  // The headline list is a constant today, but a state carried across a shrink
  // must not read past the end.
  const stale: TypewriterState = { line: 5, chars: 2, phase: "typing", ticks: 0 };
  assertEquals(nextTypewriterState(stale, LINES, 2), TYPEWRITER_START);
});

Deno.test("chars past the end of a shrunken line snaps back instead of typing forever", () => {
  const overshot: TypewriterState = { line: 0, chars: 9, phase: "typing", ticks: 0 };
  const next = nextTypewriterState(overshot, LINES, 2);
  assertEquals([next.chars, next.phase], [3, "holding"]);
});
