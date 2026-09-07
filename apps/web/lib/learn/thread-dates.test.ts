import assert from "node:assert/strict";
import { test } from "node:test";

import { dateSeparator } from "./thread-dates";

const now = new Date("2026-09-06T16:10:00");

test("the first turn gets a line, a quick follow-up does not, a long pause does", () => {
  assert.equal(dateSeparator(null, "2026-09-06T16:03:00", now), `Today ${new Date("2026-09-06T16:03:00").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
  assert.equal(dateSeparator("2026-09-06T16:03:00", "2026-09-06T16:08:00", now), null);
  assert.match(dateSeparator("2026-09-05T23:42:00", "2026-09-06T16:03:00", now) ?? "", /^Today /);
});

test("yesterday and older days are named", () => {
  assert.match(dateSeparator(null, "2026-09-05T23:42:00", now) ?? "", /^Yesterday /);
  assert.match(dateSeparator(null, "2026-09-01T09:00:00", now) ?? "", /^Sep 1, /);
});

test("a turn with no readable time gets no line", () => {
  assert.equal(dateSeparator(null, "not a date", now), null);
});
