"use client";

// DEV-ONLY PREVIEW — the real week time grid, ungated, against a seeded week.
//
// 🔴 WHY THIS EXISTS. `docs/google-calendar-reference.md` is only worth having if our side can be
// checked against it, and `measure-calendar.mjs` cannot check `/calendar`: that route is inside
// the `(workspace)` group, so a local dev server with no Supabase credentials renders it signed
// out and empty. An empty grid still has hour rows and rules, but it has no event block, so the
// half of the reference that describes a block would go unchecked forever.
//
// Same trick as `/dev-preview/calendar-cards`: the component is the product's `TimeGridView`, the
// data is the harness's, and no model or network is involved. Nothing here is a redrawn calendar.

import { useMemo } from "react";

import { TimeGridView } from "@/components/workspace/calendar/time-grid-view";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { eventsByDate, weekGrid, type CalendarEvent } from "@/lib/workspace/calendar-model";

/**
 * 🔴 THE WEEK IS PINNED, NOT `new Date()`. A harness that follows the wall clock measures a
 * different grid every day and loses the now-line the moment the seeded week rolls past. This is
 * the same week the Google reference was measured on: Sun 30 Aug — Sat 5 Sep 2026, today Tue 1st.
 */
const TODAY = new Date(2026, 8, 1, 11, 40);

const EVENTS: CalendarEvent[] = [
  { id: "e1", course: "PHYS 214", date: "2026-09-01", endTime: "10:30", kind: "class", time: "09:00", title: "Cardiovascular physiology" },
  { id: "e2", course: "CHEM 231", date: "2026-09-02", endTime: "17:00", kind: "class", time: "14:00", title: "Organic chemistry lab" },
  { id: "e3", course: "PHYS 214", date: "2026-09-03", endTime: "12:00", kind: "other", time: "11:00", title: "Review: pressure gradients" },
  // Untimed, so the all-day strip renders and can be measured too.
  { id: "e4", allDay: true, course: "PHYS 214", date: "2026-09-04", kind: "assignment", title: "Problem set 3 due" },
];

export default function CalendarWeekPreview() {
  const days = useMemo(() => weekGrid(TODAY, TODAY, 0), []);
  const byDate = useMemo(() => eventsByDate(EVENTS), []);
  const noop = () => {};

  return (
    // 🔴 WRAPPED IN THE SHELL, AND THAT IS NOT DECORATION — the same reason
    // `/dev-preview/calendar-cards` gives. `styles/legacy.css` carries an
    // UNLAYERED `button:where(:not([data-workspace] *))` that sets
    // `font: inherit` and `border-radius: 999px`; unlayered CSS beats
    // everything in `@layer utilities`, and the shell is what puts that stamp
    // on the subtree. Mounted bare, every event chip renders at the page's body
    // size with a pill corner, and `measure-calendar.mjs` pointed at it reports
    // that the PRODUCT is wrong when only the harness is. That happened once.
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <div className="flex h-full min-h-0 flex-col p-6" data-calendar-week-preview="">
          <TimeGridView
            calendarHex={() => null}
            days={days}
            eventsByDay={byDate}
            onAddOnDate={noop}
            onMoveEvent={noop}
            onOpenEvent={noop}
            onPickSlot={noop}
          />
        </div>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
