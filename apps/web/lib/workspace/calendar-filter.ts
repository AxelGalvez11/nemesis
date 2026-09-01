// Which colours the calendar is currently showing.
//
// 🔴 THIS FILTERED BY KIND UNTIL 2026-09-01. Owner: "I don't want anything like
// type, you know, like assignment exam rotation. That's too specific to school.
// This should be generalist as possible, like Google Calendar ... the only
// differentiating thing should be like filtering by color, that's pretty much
// it." So the one axis the calendar filters on is the one a person can set.
//
// Google puts a checkbox beside every calendar in its left rail and unticking
// one hides it without deleting anything. Same idea, over colour.
//
// Stored as the set of HIDDEN colours rather than the visible ones, on purpose.
// The default has to be "show everything", and a stored list of visible colours
// silently hides any colour added later — someone who saved a preference in July
// would never see a colour introduced in August, and nothing on screen would
// explain why. An empty hidden-set means everything shows, for good.
//
// PURE: no storage, no React. The component owns persistence.

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { EVENT_COLORS } from "@/lib/workspace/event-colors";

export const CALENDAR_FILTER_STORAGE_KEY = "nemesis.calendar.hiddenColors.v1";

/**
 * The key the previous filter wrote, kept only so it can be deleted.
 *
 * A stored preference that no longer matches the product's shape is how
 * `nemesis.canvas.view` hid conversation history through three separate reports.
 * This one hid whole categories of event; leaving it for a future reader to find
 * is how that happens again.
 */
export const LEGACY_KIND_FILTER_STORAGE_KEY = "nemesis.calendar.hiddenKinds.v1";

/** Events with no colour of their own. Not a real colour id, so it cannot
 *  collide with one — Google's palette is numbered "1" upward. */
export const NO_COLOR = "";

const VALID = new Set<string>([NO_COLOR, ...EVENT_COLORS.map((color) => color.id)]);

/** The colour an event filters under: its own, or the no-colour bucket. */
export function colorKeyOf(event: CalendarEvent): string {
  return event.colorId && VALID.has(event.colorId) ? event.colorId : NO_COLOR;
}

/** Only events whose colour is still switched on. */
export function visibleEvents(events: readonly CalendarEvent[], hidden: ReadonlySet<string>): CalendarEvent[] {
  if (hidden.size === 0) return [...events];
  return events.filter((event) => !hidden.has(colorKeyOf(event)));
}

/** Flip one colour on or off, returning a new set. */
export function toggleColor(hidden: ReadonlySet<string>, colorId: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(colorId)) next.delete(colorId);
  else next.add(colorId);
  return next;
}

/**
 * Every colour actually in use, in palette order, with the no-colour bucket
 * first when anything is in it.
 *
 * 🔴 IN USE, NOT THE WHOLE PALETTE. Listing all twelve would make the control a
 * wall of swatches that mostly hide nothing — and a filter is read to answer
 * "what is on this calendar", which an unused colour cannot help with.
 */
export function coloursInUse(events: readonly CalendarEvent[]): string[] {
  const seen = new Set(events.map(colorKeyOf));
  const order = EVENT_COLORS.filter((color) => seen.has(color.id)).map((color) => color.id);
  return seen.has(NO_COLOR) ? [NO_COLOR, ...order] : order;
}

/**
 * Read a stored preference back.
 *
 * Anything unrecognised is dropped rather than trusted: this comes from
 * localStorage, which another tab, an older build, or the person themselves can
 * have written. A junk entry would hide events with no way to get them back,
 * because the control only lists colours that exist.
 */
export function parseHiddenColors(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && VALID.has(value)));
  } catch {
    return new Set();
  }
}

export function serializeHiddenColors(hidden: ReadonlySet<string>): string {
  // Sorted so the same selection always writes the same string — otherwise two
  // tabs with identical filters keep overwriting each other with reordered JSON.
  return JSON.stringify([...hidden].sort());
}

/** "All events", "Tomato hidden", "3 colours hidden" — the label on the control,
 *  so a filter can be seen to be on without opening it. A filter you cannot tell
 *  is active is how events go missing. */
export function describeFilter(hidden: ReadonlySet<string>, labelOf: (colorId: string) => string): string {
  if (hidden.size === 0) return "All events";
  if (hidden.size === 1) return `${labelOf([...hidden][0]!)} hidden`;
  return `${hidden.size} colours hidden`;
}
