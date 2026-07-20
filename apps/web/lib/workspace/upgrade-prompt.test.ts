// pnpm --filter @nemesis/web exec tsx lib/workspace/upgrade-prompt.test.ts
import assert from "node:assert/strict";
import {
  dismissUpgradePrompt,
  nextDailyReset,
  showUpgradePrompt,
  subscribeUpgradePrompt,
  upgradePromptServerSnapshot,
  upgradePromptSnapshot,
} from "./upgrade-prompt";

// Starts closed, and the server snapshot is a stable closed reference.
assert.deepEqual(upgradePromptSnapshot(), { open: false, message: null, reset: null });
assert.equal(upgradePromptServerSnapshot(), upgradePromptServerSnapshot());

// Subscribers fire on every transition; snapshots are new objects (immutable updates).
let fired = 0;
const unsubscribe = subscribeUpgradePrompt(() => { fired += 1; });
const before = upgradePromptSnapshot();

showUpgradePrompt("Daily limit reached.", "daily");
assert.equal(fired, 1);
assert.notEqual(upgradePromptSnapshot(), before, "emit must replace the state object");
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: "Daily limit reached.", reset: "daily" });

// Blank/whitespace server messages fall back to null so the dialog uses its default copy;
// an omitted reset kind stays null (dialog then shows the daily line by default).
showUpgradePrompt("   ", "monthly");
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: null, reset: "monthly" });
showUpgradePrompt(undefined);
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: null, reset: null });

// The daily ledger rolls at the next UTC midnight, never in the past.
assert.equal(nextDailyReset(new Date("2026-07-20T03:15:00Z")).toISOString(), "2026-07-21T00:00:00.000Z");
assert.equal(nextDailyReset(new Date("2026-07-20T23:59:59Z")).toISOString(), "2026-07-21T00:00:00.000Z");
assert.equal(nextDailyReset(new Date("2026-07-31T12:00:00Z")).toISOString(), "2026-08-01T00:00:00.000Z");

dismissUpgradePrompt();
assert.equal(upgradePromptSnapshot().open, false);

// Dismissing an already-closed prompt is a no-op (no extra notifications).
const firedBeforeNoop = fired;
dismissUpgradePrompt();
assert.equal(fired, firedBeforeNoop);

// Unsubscribed listeners stop firing.
unsubscribe();
showUpgradePrompt("again");
assert.equal(fired, firedBeforeNoop);
dismissUpgradePrompt();

console.log("upgrade-prompt.test.ts OK");
