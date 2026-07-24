import assert from "node:assert/strict";

import { formatDuration, phaseLabel, settledLabel, shortQuery } from "./thinking-phase";

// Parity with the phone (apps/mobile/src/lib/thinking-phase.test.ts): the two
// surfaces must say the same kinds of things, so the phrase assertions match.

assert.equal(phaseLabel({ kind: "routing" }), "Working out how to answer");
assert.equal(phaseLabel({ kind: "thinking", deep: true }), "Thinking it through");
assert.equal(phaseLabel({ kind: "thinking", deep: false }), "Putting this together");

// The search line echoes the real question back.
assert.equal(
  phaseLabel({ kind: "searching", query: "metformin dosing in renal impairment" }),
  "Searching the web for “metformin dosing in renal impairment”",
);
// A blank query still produces a sensible search line.
assert.equal(phaseLabel({ kind: "searching", query: "   " }), "Searching the web");

// Source counts are singular/plural correct.
assert.equal(phaseLabel({ kind: "reading", sources: 1 }), "Reading 1 source");
assert.equal(phaseLabel({ kind: "reading", sources: 6 }), "Reading 6 sources");
// Finding nothing says so instead of claiming to read sources that don't exist.
assert.equal(phaseLabel({ kind: "reading", sources: 0 }), "No sources came back — answering from what I know");

// The writing phase shows nothing — this is the gate the live strip keys off to
// disappear the instant the first answer word lands.
assert.equal(phaseLabel({ kind: "writing" }), "");

// shortQuery collapses whitespace and leaves short questions alone.
assert.equal(shortQuery("  what   is\n a beta blocker "), "what is a beta blocker");

// shortQuery trims long questions at a word boundary.
{
  const long = "compare the cardiovascular outcomes of ACE inhibitors versus angiotensin receptor blockers";
  const out = shortQuery(long);
  assert.equal(out.endsWith("…"), true);
  assert.equal(out.length <= 43, true, `too long: ${out.length}`);
  assert.equal(long.startsWith(out.slice(0, -1)), true);
}

// A single very long word still fits.
{
  const out = shortQuery("a".repeat(80));
  assert.equal(out.length <= 43, true);
  assert.equal(out.endsWith("…"), true);
}

// formatDuration keeps the minute form for long turns.
assert.equal(formatDuration(21), "21s");
assert.equal(formatDuration(62), "1m 2s");
assert.equal(formatDuration(-3), "0s");

// settledLabel stays quiet under 2s (and on unknown timing), else "Thought for X".
assert.equal(settledLabel(null), "");
assert.equal(settledLabel(0), "");
assert.equal(settledLabel(1), "");
assert.equal(settledLabel(6), "Thought for 6s");
assert.equal(settledLabel(90), "Thought for 1m 30s");

console.log("thinking-phase.test.ts OK");
