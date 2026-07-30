import assert from "node:assert/strict";

import { summarizeUsage, type UsageBar } from "./usage-summary";

const meters = (over: Partial<Parameters<typeof summarizeUsage>[0]> = {}) =>
  summarizeUsage({
    aiToday: { used: 0, limit: 75_000 },
    aiMonth: { used: 0, limit: 2_000_000 },
    searchToday: { used: 0, limit: 10 },
    recordingMonth: { used: 0, limit: 7_200 },
    ...over,
  });

// The four meters the edge functions actually enforce, in order. The retired
// ask_daily "questions today / this week" bars are gone: nothing has written that
// counter since 2026-07-19, so those bars could only ever read zero.
{
  const bars = meters();
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map((bar) => bar.key), ["ai-today", "ai-month", "search-today", "recording-month"]);
}

// Percentages, rounded.
{
  const bars = meters({
    aiToday: { used: 33_942, limit: 75_000 }, // a real reading from the owner's account
    aiMonth: { used: 500_000, limit: 2_000_000 },
    searchToday: { used: 1, limit: 10 },
    recordingMonth: { used: 3_600, limit: 7_200 },
  });
  assert.equal(bars[0]?.percent, 45);
  assert.equal(bars[1]?.percent, 25);
  assert.equal(bars[2]?.percent, 10);
  assert.equal(bars[3]?.percent, 50);
  assert.ok(bars.every((bar) => !bar.unlimited));
}

// Over-spend clamps to 100 rather than reporting 120%. The gate lets an in-flight
// call finish past the line, so used > limit is a normal state, not a bug.
{
  const bars = meters({ aiToday: { used: 90_000, limit: 75_000 } });
  assert.equal(bars[0]?.percent, 100);
}

// Sentinel limits read as unlimited and never render a bar width from a real ratio.
{
  const bars = meters({ aiToday: { used: 4, limit: 1_000_000_000 } });
  assert.equal(bars[0]?.unlimited, true);
  assert.equal(bars[0]?.percent, 0);
}

// A missing entitlement AND a missing snapshot must not produce NaN or Infinity.
{
  const bars = meters({
    aiToday: { used: 10, limit: null },
    aiMonth: { used: 10, limit: 0 },
  });
  assert.equal(bars[0]?.unlimited, true);
  assert.equal(bars[0]?.percent, 0);
  assert.equal(bars[1]?.percent, 0);
  assert.ok(bars.every((bar) => Number.isFinite(bar.percent)));
}

// No counter row for this period yet means nothing spent, which is 0%, not an error.
{
  const bars = meters();
  assert.ok(bars.every((bar) => bar.percent === 0));
}

// Owner 2026-07-30: percentages only. Guard the SHAPE so a later edit cannot put
// "12 of 25 questions today" back on the page without deliberately changing the type.
{
  const bars = meters();
  const allowed = new Set(["key", "label", "percent", "unlimited"]);
  for (const bar of bars) {
    for (const field of Object.keys(bar)) {
      assert.ok(allowed.has(field), `UsageBar must not expose raw counts, found: ${field}`);
    }
    assert.ok(
      !/question|token|minute|\bmin\b|unit|second/i.test(bar.label),
      `label names a countable unit: ${bar.label}`,
    );
  }
  const shape: UsageBar = bars[0]!;
  void shape;
}

console.log("usage-summary.test.ts OK");
