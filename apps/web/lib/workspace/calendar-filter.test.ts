import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent } from "./calendar-model";
import {
  colorKeyOf,
  coloursInUse,
  describeFilter,
  NO_COLOR,
  parseHiddenColors,
  serializeHiddenColors,
  toggleColor,
  visibleEvents,
} from "./calendar-filter";

// The calendar filtered by KIND until 2026-09-01 — assignment, exam, rotation,
// class. Owner: "that's too specific to school ... the only differentiating
// thing should be like filtering by color". Colour is the axis a person can
// actually set, so it is the axis the calendar filters on.

function event(id: string, colorId?: string): CalendarEvent {
  return { date: "2026-08-11", id, kind: "other", source: "manual", title: id, ...(colorId ? { colorId } : {}) };
}

// "11" is Tomato, "7" Peacock, "2" Sage — see EVENT_COLORS.
const EVENTS = [event("midterm", "11"), event("essay", "7"), event("lecture", "11"), event("dentist")];

const label = (colorId: string) => ({ "11": "Tomato", "7": "Peacock", [NO_COLOR]: "No colour" })[colorId] ?? colorId;

test("nothing hidden shows everything", () => {
  assert.equal(visibleEvents(EVENTS, new Set()).length, 4);
});

test("hiding a colour removes only that colour", () => {
  const shown = visibleEvents(EVENTS, new Set(["11"]));
  assert.deepEqual(shown.map((e) => e.id), ["essay", "dentist"]);
});

test("an event with no colour of its own filters under the no-colour bucket", () => {
  assert.equal(colorKeyOf(event("x")), NO_COLOR);
  assert.equal(colorKeyOf(event("x", "7")), "7");
  // A colour id that is not in the palette is not a colour: it must fall into
  // the same bucket the UI can actually show, or its events become unreachable.
  assert.equal(colorKeyOf(event("x", "999")), NO_COLOR);
  assert.deepEqual(visibleEvents(EVENTS, new Set([NO_COLOR])).map((e) => e.id), ["midterm", "essay", "lecture"]);
});

test("hiding every colour shows nothing, and is recoverable", () => {
  const all = new Set(["11", "7", NO_COLOR]);
  assert.equal(visibleEvents(EVENTS, all).length, 0);
  // Switching one back on brings its events straight back — nothing was deleted.
  assert.deepEqual(visibleEvents(EVENTS, toggleColor(all, "7")).map((e) => e.id), ["essay"]);
});

test("toggling does not mutate the set it was given", () => {
  const before = new Set(["11"]);
  const after = toggleColor(before, "7");
  assert.deepEqual([...before], ["11"]);
  assert.equal(after.has("7"), true);
  assert.equal(toggleColor(after, "11").has("11"), false);
});

test("the control lists only the colours actually in use", () => {
  // 🔴 NOT THE WHOLE PALETTE. Twelve swatches that mostly hide nothing is a wall,
  // and the filter is read to answer "what is on this calendar".
  assert.deepEqual(coloursInUse(EVENTS), [NO_COLOR, "7", "11"]);
  assert.deepEqual(coloursInUse([event("a", "7")]), ["7"]);
  assert.deepEqual(coloursInUse([]), []);
});

test("a stored preference round-trips", () => {
  const hidden = new Set(["11", "7"]);
  assert.deepEqual([...parseHiddenColors(serializeHiddenColors(hidden))].sort(), ["11", "7"]);
  // The no-colour bucket is an empty string, which must survive the round trip
  // rather than being read back as "nothing was stored".
  assert.deepEqual([...parseHiddenColors(serializeHiddenColors(new Set([NO_COLOR])))], [NO_COLOR]);
});

test("the same selection always serialises identically", () => {
  // Two tabs with the same filter must not keep overwriting each other with
  // differently-ordered JSON.
  assert.equal(serializeHiddenColors(new Set(["11", "7"])), serializeHiddenColors(new Set(["7", "11"])));
});

test("junk in storage hides nothing rather than hiding everything", () => {
  // This value is reachable by another tab, an older build, or the person.
  // Trusting it would hide events with no way back, because the control only
  // lists colours that exist.
  for (const raw of [null, "", "not json", "{}", '"11"', "[1,2,3]", '["nonsense"]']) {
    assert.equal(parseHiddenColors(raw).size, 0, `raw: ${raw}`);
  }
  assert.deepEqual([...parseHiddenColors('["11","nonsense"]')], ["11"]);
});

test("the control says when a filter is on", () => {
  assert.equal(describeFilter(new Set(), label), "All events");
  assert.equal(describeFilter(new Set(["11"]), label), "Tomato hidden");
  assert.equal(describeFilter(new Set(["11", "7"]), label), "2 colours hidden");
});
