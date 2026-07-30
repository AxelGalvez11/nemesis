// Calendar header — verbatim from desktop calendar/index.tsx §A.4. Title →
// SegmentedControl(Day/Week/Month/Year) → bordered prev/label/next cluster →
// primary "Add event" button. There is no "Today" button.

import { Button } from "@/components/desktop-ui/button";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { ChevronLeft, ChevronRight, FileText, Plus } from "@/lib/workspace/icons";
import { dateKey } from "@/lib/workspace/calendar-model";

import { VIEW_OPTIONS, VIEW_UNIT_LABEL, viewLabel, type CalendarViewMode } from "./format";

interface CalendarHeaderProps {
  view: CalendarViewMode;
  cursor: Date;
  today: Date;
  onChangeView: (view: CalendarViewMode) => void;
  onStep: (delta: 1 | -1) => void;
  onToday: () => void;
  onAddEvent: (dateKeyStr: string) => void;
  onImportSyllabus: () => void;
}

export function CalendarHeader({
  view,
  cursor,
  today,
  onChangeView,
  onStep,
  onToday,
  onAddEvent,
  onImportSyllabus,
}: CalendarHeaderProps) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 pb-4 pt-5 max-lg:grid-cols-1 max-lg:gap-3 max-sm:px-3">
      <h1 className="truncate text-[2rem] font-semibold tracking-[-0.04em] text-foreground">
        {viewLabel(view, cursor)}
      </h1>
      <div className="justify-self-center max-lg:order-3">
        <SegmentedControl onChange={onChangeView} options={VIEW_OPTIONS} value={view} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <Button
            aria-label={`Previous ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(-1)}
            size="icon-sm"
            variant="secondary"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button onClick={onToday} size="sm" variant="secondary">Today</Button>
          <Button
            aria-label={`Next ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(1)}
            size="icon-sm"
            variant="secondary"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button aria-label="Import syllabus" onClick={onImportSyllabus} size="icon-sm" variant="ghost">
          <FileText size={16} />
        </Button>
        <Button aria-label="Add event" onClick={() => onAddEvent(dateKey(today))} size="icon-sm">
          <Plus size={16} />
        </Button>
      </div>
    </header>
  );
}
