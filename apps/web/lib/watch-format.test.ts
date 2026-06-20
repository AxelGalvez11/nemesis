// npx tsx lib/watch-format.test.ts
import assert from "node:assert/strict";
import { relativeTime, askHrefForWatch } from "./watch-format.ts";

const NOW = Date.parse("2026-06-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

// relativeTime — null / invalid inputs render nothing
assert.equal(relativeTime(null, NOW), null);
assert.equal(relativeTime(undefined, NOW), null);
assert.equal(relativeTime("not-a-date", NOW), null);

// relativeTime — buckets
assert.equal(relativeTime(ago(0), NOW), "just now");
assert.equal(relativeTime(ago(30 * 1000), NOW), "just now"); // < 1 min
assert.equal(relativeTime(ago(5 * MIN), NOW), "5m ago");
assert.equal(relativeTime(ago(59 * MIN), NOW), "59m ago");
assert.equal(relativeTime(ago(3 * HR), NOW), "3h ago");
assert.equal(relativeTime(ago(23 * HR), NOW), "23h ago");
assert.equal(relativeTime(ago(2 * DAY), NOW), "2d ago");
assert.equal(relativeTime(ago(29 * DAY), NOW), "29d ago");
assert.equal(relativeTime(ago(45 * DAY), NOW), "1mo ago");
assert.equal(relativeTime(ago(400 * DAY), NOW), "1y ago");

// relativeTime — a future timestamp (clock skew) never shows a negative interval
assert.equal(relativeTime(new Date(NOW + 3 * HR).toISOString(), NOW), "just now");

// askHrefForWatch — empty / whitespace → null (no link)
assert.equal(askHrefForWatch(null), null);
assert.equal(askHrefForWatch(undefined), null);
assert.equal(askHrefForWatch("   "), null);

// askHrefForWatch — trims + URL-encodes (spaces, &, ?, accented)
assert.equal(askHrefForWatch("Semaglutide"), "/app/ask?q=Semaglutide");
assert.equal(askHrefForWatch("  semaglutide  "), "/app/ask?q=semaglutide");
assert.equal(
  askHrefForWatch("apixaban & warfarin?"),
  "/app/ask?q=apixaban%20%26%20warfarin%3F",
);

console.log("watch-format.test.ts OK");
