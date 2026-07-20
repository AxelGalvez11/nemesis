import assert from "node:assert/strict";

import { summarizeUsage } from "./usage-summary";

// Plan-limited account: three bars with plain-English details.
{
  const bars = summarizeUsage({ dailyUsed: 12, dailyLimit: 25, weekUsed: 60, voiceUsedSeconds: 90, voiceLimitSeconds: 1800 });
  assert.equal(bars.length, 3);
  assert.deepEqual(bars.map((bar) => bar.key), ["daily", "weekly", "voice"]);
  assert.equal(bars[0]?.detail, "12 of 25 questions today");
  assert.equal(bars[1]?.limit, 175);
  assert.equal(bars[1]?.detail, "60 of 175 questions in the last 7 days");
  // 90 seconds rounds UP to 2 minutes used; 1800s limit = 30 min.
  assert.equal(bars[2]?.used, 2);
  assert.equal(bars[2]?.limit, 30);
  assert.equal(bars[2]?.detail, "2 of 30 min this month");
  assert.ok(bars.every((bar) => !bar.unlimited));
}

// Enterprise sentinel limits (1e9 asks / 1e7 seconds) read as unlimited.
{
  const bars = summarizeUsage({ dailyUsed: 4, dailyLimit: 1_000_000_000, weekUsed: 11, voiceUsedSeconds: 0, voiceLimitSeconds: 10_000_000 });
  assert.ok(bars.every((bar) => bar.unlimited));
  assert.equal(bars[0]?.detail, "4 questions today");
  assert.equal(bars[1]?.detail, "11 questions in the last 7 days");
  assert.equal(bars[2]?.detail, "0 min this month");
}

// Missing limits (no entitlement resolved) degrade to unlimited display, not NaN.
{
  const bars = summarizeUsage({ dailyUsed: 0, dailyLimit: null, weekUsed: 0, voiceUsedSeconds: 0, voiceLimitSeconds: null });
  assert.ok(bars.every((bar) => bar.unlimited && Number.isFinite(bar.used) && Number.isFinite(bar.limit)));
}

console.log("usage-summary.test.ts OK");
