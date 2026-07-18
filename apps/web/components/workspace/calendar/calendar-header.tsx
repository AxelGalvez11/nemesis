// Calendar header — verbatim from desktop calendar/index.tsx §A.4. Title →
// SegmentedControl(Day/Week/Month/Year) → bordered prev/label/next cluster →
// primary "Add event" button. There is no "Today" button.

import { Button } from "@/components/desktop-ui/button";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { ChevronLeft, ChevronRight, Plus } from "@/lib/workspace/icons";
import { dateKey } from "@/lib/workspace/calendar-model";

import { VIEW_OPTIONS, VIEW_UNIT_LABEL, viewLabel, type CalendarViewMode } from "./format";

interface CalendarHeaderProps {
  view: CalendarViewMode;
  cursor: Date;
  today: Date;
  onChangeView: (view: CalendarViewMode) => void;
  onStep: (delta: 1 | -1) => void;
  onAddEvent: (dateKeyStr: string) => void;
}

export function CalendarHeader({ view, cursor, today, onChangeView, onStep, onAddEvent }: CalendarHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Calendar</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl onChange={onChangeView} options={VIEW_OPTIONS} value={view} />
        <div className="flex items-center gap-1 rounded-md border border-border">
          <Button
            aria-label={`Previous ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(-1)}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="min-w-32 px-1 text-center text-xs font-medium tabular-nums">{viewLabel(view, cursor)}</span>
          <Button
            aria-label={`Next ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(1)}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronRight size={14} />
          </Button>
        </div>
        <Button onClick={() => onAddEvent(dateKey(today))} size="sm">
          <Plus size={14} /> Add event
        </Button>
      </div>
    </header>
  );
}
