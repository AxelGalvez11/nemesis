import assert from "node:assert/strict";
import { test } from "node:test";

import { colourOfDay, EVENT_COLORS, eventColorOf, paintFor, paintForEvent } from "./event-colors";

// How an event gets the colour it is drawn in — Google's own precedence, and the two places it
// used to fall through to grey.

test("🔴 the palette is Google's own ids and hexes, unrenamed", () => {
  // The ids travel: an event that comes back from Google carries `colorId: "5"`, and one Nemesis
  // sends must carry the same thing to look the same in both places. Inventing a Nemesis palette
  // would mean a lookup table in both directions and a colour that drifts the first time either
  // side adds one.
  assert.equal(EVENT_COLORS.length, 11, "Google has eleven event colours");
  assert.equal(eventColorOf("11")?.name, "Tomato");
  assert.equal(eventColorOf("11")?.hex, "#d50000");
  assert.equal(eventColorOf("7")?.name, "Peacock");
  assert.equal(eventColorOf("99"), null, "an unknown id resolves to a colour");
  assert.equal(eventColorOf(undefined), null);
});

test("🔴🔴 event colour, then the CALENDAR's — and the second step is what was missing", () => {
  // Google's order exactly. Until 2026-09-03 no calendar had ever been given a colour, so step two
  // never fired and every event fell through to grey — see `PRIMARY_CALENDAR`.
  const blue = () => "#4986e7";
  assert.equal(paintForEvent({ colorId: "11" }, blue)?.dot.backgroundColor, "#d50000", "the event's own colour stopped winning");
  assert.equal(paintForEvent({ calendarId: "" }, blue)?.dot.backgroundColor, "#4986e7", "an uncoloured event no longer takes its calendar's");
  assert.equal(paintForEvent({ calendarId: "x" }, () => null), null, "no colour anywhere must stay null, so the fallback can paint");
  // A block is the same hue at 13%, with a solid leading edge — never a second colour.
  assert.equal(paintFor("7")?.block.borderLeftColor, "#039be5");
  assert.match(paintFor("7")?.block.backgroundColor ?? "", /^#039be5..$/);
});

test("🔴🔴 a day is one colour only when its events agree", () => {
  // The year view draws a day as a 16px disc. It cannot show three colours, and picking the first
  // event's would make the year disagree with the month about what a Tuesday looks like — the same
  // day, two answers, nothing on screen saying which won.
  const hex = () => "#4986e7";
  assert.equal(colourOfDay([{ calendarId: "" }, { calendarId: "" }], hex), "#4986e7", "two uncoloured events do not agree");
  assert.equal(colourOfDay([{ calendarId: "", colorId: "11" }, { calendarId: "", colorId: "11" }], hex), "#d50000");
  assert.equal(colourOfDay([{ calendarId: "", colorId: "11" }, { calendarId: "" }], hex), null, "a mixed day claimed one colour");
  // 🔴 AN EMPTY DAY IS NULL, NOT THE CALENDAR'S COLOUR — otherwise an empty year is solid blue.
  assert.equal(colourOfDay([], hex), null);
  // 🔴 AND A CALENDAR WITH NO COLOUR STILL MEANS NO COLOUR, so the busy shading keeps its job.
  assert.equal(colourOfDay([{ calendarId: "x" }], () => null), null);
});
