// Event kind → colour map. Used everywhere: month lines and bars, week and day
// blocks, agenda dots, the kind select in the event form.
//
// 🔴 `exam` NO LONGER FOLLOWS THE ACCENT, AND THAT IS A BUG FIX, NOT A TASTE
// CHANGE. It used to be `--theme-primary`, "so it re-tints with the app's
// accent". Two things went wrong with that, both visible on a real calendar:
//
//   1. The default accent is a neutral graphite. So out of the box the most
//      important thing a student owns — the exam — came out the same colour as
//      an ordinary lecture, which is `--ui-text-tertiary`. The month view could
//      not tell you where your exams were.
//   2. `assignment` is a fixed blue. A student who sets their accent to blue —
//      one of the offered swatches — made exams and coursework the same colour
//      as each other, and nothing warned them.
//
// An exam is not a matter of taste. It gets its own warm tone, fixed, and it is
// the one kind that reads as urgent at a glance. The accent still tints the
// chrome around the calendar; it no longer decides what an exam looks like.

import type { CalendarEventKind } from "@/lib/workspace/calendar-model";

export interface KindMeta {
  /** Filled pill: the kind select, and anywhere a solid swatch reads better. */
  chip: string;
  /** A solid bar — an all-day deadline in the month grid, and every exam. */
  bar: string;
  /** The small round mark that leads a timed event in the month grid. */
  dot: string;
  /** Tinted block with a solid leading edge: week and day grid. */
  block: string;
  label: string;
}

/**
 * How an event is drawn when nobody has given it a colour.
 *
 * 🔴 THE CALENDAR NO LONGER PAINTS BY KIND. Owner 2026-09-01: "I don't want
 * anything like type, you know, like assignment exam rotation. That's too
 * specific to school ... the only differentiating thing should be like filtering
 * by color, that's pretty much it."
 *
 * An event painted by a field nothing on screen shows is a colour nobody can
 * change and nobody can filter on — it would look red and filter under "no
 * colour". So every event without a colour of its own is drawn the same, and the
 * palette in the editor is the only thing that makes one stand out.
 *
 * `KIND_META` survives for the syllabus import preview, which reviews what an
 * import decided and is the one place the kind is still a thing a person reads.
 */
export const DEFAULT_PAINT: KindMeta = {
  bar: "bg-(--ui-text-tertiary) text-background",
  block: "bg-(--ui-bg-quaternary) text-foreground border-l-(--ui-text-tertiary)",
  chip: "bg-(--ui-bg-quaternary) text-foreground",
  dot: "bg-(--ui-text-tertiary)",
  label: "Event",
};

export const KIND_META: Record<CalendarEventKind, KindMeta> = {
  assignment: {
    bar: "bg-(--ui-blue) text-white",
    block: "bg-(--ui-blue)/12 text-(--ui-blue) border-l-(--ui-blue)",
    chip: "bg-(--ui-blue)/15 text-(--ui-blue)",
    dot: "bg-(--ui-blue)",
    label: "Assignment",
  },
  class: {
    bar: "bg-(--ui-text-tertiary) text-background",
    block: "bg-(--ui-bg-quaternary) text-muted-foreground border-l-(--ui-text-tertiary)",
    chip: "bg-(--ui-bg-quaternary) text-muted-foreground",
    dot: "bg-(--ui-text-tertiary)",
    label: "Class",
  },
  exam: {
    bar: "bg-(--ui-exam) text-white",
    block: "bg-(--ui-exam)/13 text-(--ui-exam) border-l-(--ui-exam)",
    chip: "bg-(--ui-exam)/15 text-(--ui-exam)",
    dot: "bg-(--ui-exam)",
    label: "Exam",
  },
  other: {
    bar: "bg-(--ui-cyan) text-white",
    block: "bg-(--ui-cyan)/12 text-(--ui-cyan) border-l-(--ui-cyan)",
    chip: "bg-(--ui-cyan)/15 text-(--ui-cyan)",
    dot: "bg-(--ui-cyan)",
    label: "Other",
  },
  rotation: {
    bar: "bg-(--ui-purple) text-white",
    block: "bg-(--ui-purple)/12 text-(--ui-purple) border-l-(--ui-purple)",
    chip: "bg-(--ui-purple)/15 text-(--ui-purple)",
    dot: "bg-(--ui-purple)",
    label: "Rotation",
  },
};

export const KIND_ORDER: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];

/**
 * Which kinds are drawn as a solid bar in the month grid rather than a dot and
 * a line of text.
 *
 * Google's rule is "all-day items get a bar, timed ones get a dot", and an
 * untimed deadline is exactly an all-day item. `exam` is the one deliberate
 * addition: drawn as a dot it came out quieter than a reading deadline sitting
 * on the same day, which is the wrong way round on a student's calendar.
 */
export function drawsAsBar(kind: CalendarEventKind, time: string | undefined): boolean {
  return !time || kind === "exam";
}
