// Google Calendar's eleven event colours, by the ids Google uses for them.
//
// 🔴 THE IDS ARE GOOGLE'S, NOT OURS, AND THAT IS THE WHOLE POINT. An event that
// comes back from Google carries `colorId: "5"`, and an event Nemesis sends must
// carry the same thing for it to look the same in both places. Inventing a
// Nemesis palette would mean a lookup table in both directions and a colour that
// drifts the first time either side adds one.
//
// The hexes are Google's own, read off the API's `colors.get` response. The
// NAMES are Google's too, and they matter more than they look: "Tomato" and
// "Flamingo" are what a student sees in Google's own picker, so a Nemesis picker
// that called them "Red" and "Pink" would be describing the same colour by a
// different name in two apps the same person uses.
//
// 🔴 A COLOUR HERE IS AN OVERRIDE, NOT THE DEFAULT. Left unset, an event is
// painted by its KIND — exam, assignment, class — which is the thing Nemesis
// knows and Google does not. Setting one is a student saying "this particular
// event, this particular colour", exactly as it works in Google, where an event
// colour overrides its calendar's.

import { inkOn } from "./calendar-colors";

export interface EventColor {
  /** Google's own id. A string, because that is what the API sends. */
  id: string;
  name: string;
  /** Background for a solid bar, and the dot's fill. */
  hex: string;
  /** Text on top of `hex` at full strength. */
  on: string;
}

/**
 * 🔴 `on` IS MEASURED, NOT GUESSED. Banana (#f6bf26) and Sage (#33b679) are light
 * enough that white text on them fails contrast; Grape and Tomato are dark enough
 * that black text does. Picking per colour rather than using white everywhere is
 * the difference between a legible bar and a bar you have to select to read.
 */
export const EVENT_COLORS: readonly EventColor[] = [
  { hex: "#7986cb", id: "1", name: "Lavender", on: "#ffffff" },
  { hex: "#33b679", id: "2", name: "Sage", on: "#0b2e1e" },
  { hex: "#8e24aa", id: "3", name: "Grape", on: "#ffffff" },
  { hex: "#e67c73", id: "4", name: "Flamingo", on: "#2b0f0c" },
  { hex: "#f6bf26", id: "5", name: "Banana", on: "#2b2205" },
  { hex: "#f4511e", id: "6", name: "Tangerine", on: "#ffffff" },
  { hex: "#039be5", id: "7", name: "Peacock", on: "#ffffff" },
  { hex: "#616161", id: "8", name: "Graphite", on: "#ffffff" },
  { hex: "#3f51b5", id: "9", name: "Blueberry", on: "#ffffff" },
  { hex: "#0b8043", id: "10", name: "Basil", on: "#ffffff" },
  { hex: "#d50000", id: "11", name: "Tomato", on: "#ffffff" },
];

const BY_ID = new Map(EVENT_COLORS.map((color) => [color.id, color]));

/** The colour for an id, or null for "no override — use the kind colour". */
export function eventColorOf(colorId: string | undefined): EventColor | null {
  if (!colorId) return null;
  return BY_ID.get(colorId) ?? null;
}

/**
 * Inline styles for the three ways an event is drawn, or null to leave the
 * kind's own classes alone.
 *
 * 🔴 INLINE, BECAUSE THE VALUE IS DATA. Tailwind generates the classes it can
 * see in the source; eleven arbitrary hexes chosen at runtime are not in the
 * source, and a class built by concatenation is a class that does not exist.
 * These are the only inline colours in the calendar and they are inline for that
 * reason rather than convenience.
 */
export interface ColorPaint {
  /** A solid bar: an untimed deadline, an exam, a block in the week grid. */
  bar: { backgroundColor: string; color: string };
  /** The small round mark leading a timed event in the month grid. */
  dot: { backgroundColor: string };
  /** A tinted block with a solid leading edge: the week grid and the day rail. */
  block: { backgroundColor: string; borderLeftColor: string; color: string };
}

export function paintFor(colorId: string | undefined): ColorPaint | null {
  const color = eventColorOf(colorId);
  if (!color) return null;
  return {
    bar: { backgroundColor: color.hex, color: color.on },
    // 22 in hex is 13% — the same weight as the kind tints in kind-meta.ts, so a
    // recoloured event sits at the same visual level as the ones around it
    // rather than shouting over them.
    block: { backgroundColor: `${color.hex}22`, borderLeftColor: color.hex, color: color.hex },
    dot: { backgroundColor: color.hex },
  };
}

/**
 * The colour an event is actually drawn in, following Google's own order of
 * precedence and then falling through to something Google does not have.
 *
 * 🔴 EVENT COLOUR, THEN CALENDAR COLOUR, THEN KIND — and the last step is the
 * one worth explaining. Google stops at the calendar's colour because a Google
 * event has no idea what KIND of thing it is; a Nemesis event does, and an exam
 * being visibly an exam is the whole reason `--ui-exam` was untied from the
 * accent. So a student who has coloured nothing still gets exams in orange and
 * classes in grey, exactly as before this stage — and a student who colours a
 * calendar has asked for Google's behaviour and gets it.
 *
 * Returns null for "no override — let the kind's own classes paint it".
 */
export function paintForEvent(
  event: { colorId?: string; calendarId?: string },
  calendarColorHex: (calendarId: string | undefined) => string | null,
): ColorPaint | null {
  const own = paintFor(event.colorId);
  if (own) return own;
  const hex = calendarColorHex(event.calendarId);
  if (!hex) return null;
  return {
    bar: { backgroundColor: hex, color: inkOn(hex) },
    block: { backgroundColor: `${hex}22`, borderLeftColor: hex, color: hex },
    dot: { backgroundColor: hex },
  };
}
