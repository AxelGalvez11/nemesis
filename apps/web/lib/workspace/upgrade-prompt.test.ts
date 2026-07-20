// pnpm --filter @nemesis/web exec tsx lib/workspace/upgrade-prompt.test.ts
import assert from "node:assert/strict";
import {
  dismissUpgradePrompt,
  showUpgradePrompt,
  subscribeUpgradePrompt,
  upgradePromptServerSnapshot,
  upgradePromptSnapshot,
} from "./upgrade-prompt";

// Starts closed, and the server snapshot is a stable closed reference.
assert.deepEqual(upgradePromptSnapshot(), { open: false, message: null });
assert.equal(upgradePromptServerSnapshot(), upgradePromptServerSnapshot());

// Subscribers fire on every transition; snapshots are new objects (immutable updates).
let fired = 0;
const unsubscribe = subscribeUpgradePrompt(() => { fired += 1; });
const before = upgradePromptSnapshot();

showUpgradePrompt("Daily limit reached.");
assert.equal(fired, 1);
assert.notEqual(upgradePromptSnapshot(), before, "emit must replace the state object");
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: "Daily limit reached." });

// Blank/whitespace server messages fall back to null so the dialog uses its default copy.
showUpgradePrompt("   ");
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: null });
showUpgradePrompt(undefined);
assert.deepEqual(upgradePromptSnapshot(), { open: true, message: null });

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
