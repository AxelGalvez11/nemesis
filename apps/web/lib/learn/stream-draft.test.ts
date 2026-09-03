// The draft watcher: milestones as soon as they close, prose only for a plain reply, nothing on a clock.
import assert from "node:assert/strict";
import { test } from "node:test";

import { draftWatch } from "./stream-draft";

const BLOCK = '```json\n{"then": "reply", "milestones": ["Reading the two lectures on torque", "Laying out the worked example"], "needsWeb": false}\n```\n';

test("🔴🔴 the milestones are reported the moment their array closes, and only once", () => {
  const watch = draftWatch();
  assert.deepEqual(watch.feed('```json\n{"then": "reply", "milestones": ["Reading the two lec'), { milestones: null, prose: "" });
  const closed = watch.feed('```json\n{"then": "reply", "milestones": ["Reading the two lectures on torque", "Laying out the worked example"]');
  assert.deepEqual(closed.milestones, ["Reading the two lectures on torque", "Laying out the worked example"]);
  assert.equal(closed.prose, "");
  assert.equal(watch.feed(BLOCK).milestones, null, "reported twice");
});

test("🔴🔴 prose is drafted only once the block has closed as a plain reply, and grows with the stream", () => {
  const watch = draftWatch();
  watch.feed(BLOCK);
  assert.equal(watch.feed(`${BLOCK}Torque is a turning`).prose, "Torque is a turning");
  assert.equal(watch.feed(`${BLOCK}Torque is a turning force about an axis.`).prose, "Torque is a turning force about an axis.");
});

test("🔴 a round that searches or parks a question drafts no prose, because its prose is not the answer", () => {
  const searching = draftWatch();
  const web = '```json\n{"then": "reply", "milestones": ["Checking the latest figures online"], "needsWeb": true}\n```\nLet me look that up.';
  const out = searching.feed(web);
  assert.deepEqual(out.milestones, ["Checking the latest figures online"], "a search line is kept when the turn searches");
  assert.equal(out.prose, "");
  const parked = draftWatch();
  assert.equal(parked.feed('```json\n{"then": "study", "question": {"id": "q"}}\n```\nWhich first?').prose, "");
});

test("🔴 a line that claims a search on a turn that bought none is dropped, and so is a percentage", () => {
  const watch = draftWatch();
  const out = watch.feed('```json\n{"then": "reply", "milestones": ["Searching the web for it", "Halfway, 50% done", "Writing the answer"], "needsWeb": false}');
  assert.deepEqual(out.milestones, ["Writing the answer"]);
});

test("🔴 with no block at all, nothing is drafted until the reply is clearly all prose", () => {
  const watch = draftWatch();
  assert.equal(watch.feed("Torque is a turning force.").prose, "");
  const long = "Torque is a turning force. ".repeat(100);
  assert.equal(watch.feed(long).prose, long.trim());
});

test("prose written before the block is kept beside prose written after it", () => {
  const watch = draftWatch();
  assert.equal(watch.feed(`Short version first.\n${BLOCK}Then the rest.`).prose, "Short version first.\n\nThen the rest.");
});
