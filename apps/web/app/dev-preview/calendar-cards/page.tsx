"use client";

// DEV-ONLY PREVIEW — the real month view, against a seeded week of study.
//
// 🔴 WHY THIS EXISTS. `/calendar` renders perfectly well signed out, and it renders EMPTY: the
// events come from the account. An empty month grid is a fine product surface and a terrible
// screenshot — a landing page section that claims "your plan becomes scheduled blocks" cannot be
// illustrated by a picture of no blocks. So this mounts `MonthGrid`, the same component the
// workspace mounts, with a fortnight of events written out below.
//
// It is the same trick as `/dev-preview/visual-cards`: the component is the product's, the data is
// the harness's, and no model or network is involved. Nothing here is a redrawn calendar.
//
// The events are deliberately ordinary and spread across the kinds the model defines — classes
// that repeat, a couple of assignments, one exam, and the review blocks Nemesis schedules itself
// (`source: "agent"`, which the UI renders read-only).

import { useMemo } from "react";

import { MonthGrid } from "@/components/workspace/calendar/month-grid";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { monthGrid, type CalendarEvent } from "@/lib/workspace/calendar-model";

/**
 * 🔴 THE MONTH IS PINNED, NOT `new Date()`. A screenshot harness that follows the wall clock
 * produces a different picture every month and an empty one whenever the seeded dates fall
 * outside the visible grid. August 2026 is the month the seeded events live in.
 */
const YEAR = 2026;
const MONTH = 7; // zero-based: August
const TODAY = new Date(YEAR, MONTH, 24);

const EVENTS: CalendarEvent[] = [
  // The course itself, twice a week.
  { id: "c1", title: "Cardiovascular physiology", date: "2026-08-03", time: "09:00", endTime: "10:30", kind: "class", course: "PHYS 214", recurrence: { days: [1, 3], until: "2026-08-28" } },
  { id: "c2", title: "Organic chemistry lab", date: "2026-08-04", time: "14:00", endTime: "17:00", kind: "class", course: "CHEM 231", recurrence: { days: [2], until: "2026-08-25" } },

  // Coursework with real deadlines.
  { id: "a1", title: "Problem set 3", date: "2026-08-07", time: "23:59", kind: "assignment", course: "PHYS 214" },
  { id: "a2", title: "Lab report: esterification", date: "2026-08-14", time: "23:59", kind: "assignment", course: "CHEM 231" },
  { id: "a3", title: "Case write-up", date: "2026-08-21", time: "23:59", kind: "assignment", course: "PHYS 214" },
  { id: "e1", title: "Midterm", date: "2026-08-27", time: "10:00", endTime: "12:00", kind: "exam", course: "PHYS 214" },

  // What Nemesis put there: spaced review, timed to when you are likely to forget.
  { id: "r1", title: "Review: action potentials", date: "2026-08-06", time: "18:00", endTime: "18:25", kind: "other", course: "PHYS 214", source: "agent" },
  { id: "r2", title: "Review: action potentials", date: "2026-08-11", time: "18:00", endTime: "18:25", kind: "other", course: "PHYS 214", source: "agent" },
  { id: "r3", title: "Review: nucleophilic substitution", date: "2026-08-12", time: "19:00", endTime: "19:30", kind: "other", course: "CHEM 231", source: "agent" },
  { id: "r4", title: "Review: action potentials", date: "2026-08-19", time: "18:00", endTime: "18:25", kind: "other", course: "PHYS 214", source: "agent" },
  { id: "r5", title: "Review: esterification", date: "2026-08-20", time: "19:00", endTime: "19:30", kind: "other", course: "CHEM 231", source: "agent" },
  { id: "r6", title: "Midterm revision block", date: "2026-08-25", time: "16:00", endTime: "17:30", kind: "other", course: "PHYS 214", source: "agent" },
  { id: "r7", title: "Midterm revision block", date: "2026-08-26", time: "16:00", endTime: "17:30", kind: "other", course: "PHYS 214", source: "agent" },
];

/** Expand the weekly recurrences by hand: the codec's expander wants a loaded account. */
function expand(events: CalendarEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ev of events) {
    if (!ev.recurrence) {
      out.push(ev);
      continue;
    }
    const until = new Date(`${ev.recurrence.until}T00:00:00`);
    const cursor = new Date(`${ev.date}T00:00:00`);
    let n = 0;
    while (cursor <= until && n < 40) {
      if (ev.recurrence.days.includes(cursor.getDay())) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        out.push({ ...ev, id: `${ev.id}-${key}`, date: key, recurrence: undefined });
      }
      cursor.setDate(cursor.getDate() + 1);
      n++;
    }
  }
  return out;
}

export default function CalendarCardsPreview() {
  const days = useMemo(() => monthGrid(YEAR, MONTH, TODAY), []);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of expand(EVENTS)) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, []);

  // 🔴 WRAPPED IN THE SHELL, AND THAT IS NOT DECORATION. Mounted bare, every day cell
  // rendered as a large dark ELLIPSE: the calendar's styles resolve against tokens and a
  // stamp the workspace shell puts on its subtree, and outside it the radius and surface
  // both fall back to something the component never intends. Every other dev-preview
  // surface wraps the same way for the same reason.
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <div className="flex h-full min-h-0 flex-col gap-4 p-6">
          {/* Month only. The explanatory subtitle that sat beside it was harness
              furniture and it went straight onto the landing page's screenshot, where
              it read as a caption the product had written about itself. */}
          <header className="flex items-baseline gap-3">
            <h1 className="text-xl font-medium text-(--ui-text-primary)">August 2026</h1>
          </header>
          <div className="min-h-0 flex-1">
            <MonthGrid days={days} eventsByDay={eventsByDay} onOpenEvent={() => {}} onPickDay={() => {}} />
          </div>
        </div>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
