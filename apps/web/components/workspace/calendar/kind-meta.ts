// Event kind → color map — verbatim from desktop calendar/index.tsx §A.6. Used
// everywhere: month/week chips, day/agenda dots, the kind select in the event
// form. `exam` is the only kind tied to the brand accent (--theme-primary)
// rather than a fixed hue, so it re-tints automatically with the app's accent.

import type { CalendarEventKind } from "@/lib/workspace/calendar-model";

export interface KindMeta {
  chip: string;
  dot: string;
  label: string;
}

export const KIND_META: Record<CalendarEventKind, KindMeta> = {
  assignment: { chip: "bg-(--ui-blue)/15 text-(--ui-blue)", dot: "bg-(--ui-blue)", label: "Assignment" },
  class: { chip: "bg-(--ui-bg-quaternary) text-muted-foreground", dot: "bg-(--ui-text-tertiary)", label: "Class" },
  exam: { chip: "bg-(--theme-primary)/15 text-(--theme-primary)", dot: "bg-(--theme-primary)", label: "Exam" },
  other: { chip: "bg-(--ui-cyan)/15 text-(--ui-cyan)", dot: "bg-(--ui-cyan)", label: "Other" },
  rotation: { chip: "bg-(--ui-purple)/15 text-(--ui-purple)", dot: "bg-(--ui-purple)", label: "Rotation" },
};

export const KIND_ORDER: readonly CalendarEventKind[] = ["assignment", "exam", "rotation", "class", "other"];
