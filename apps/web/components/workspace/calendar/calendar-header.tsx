// Calendar header, laid out the way Google Calendar lays it out (owner
// 2026-07-31: "i need you to literally copy it entirely").
//
// One row, in Google's order: Today, the arrows, the date range, then the
// controls pushed to the right ending in a view dropdown. What this replaced
// led with a large bold title and put navigation on the far right, with a
// four-way segmented control taking the middle of the bar.
//
// The palette stays monochrome — the owner confirmed 2026-07-31 that "copy it
// entirely" is about layout, density and interaction, not Google's blue.
//
// 🔴🔴 2026-09-04: THE ROW WEARS THE SHARED FRAME (`shell/page-frame.tsx`). The owner asked for
// consistent spacing across the workspace pages and then "do the project page, calendar, and
// settings too". The ORDER is still Google's; the pieces are the frame's: the same 16px top and
// 40px row every page title sits on, the same 24px title, round 40px buttons for the arrows and
// the add, 40px pills for Today, Sync and the view menu. The grid under this row is untouched —
// it is drawn to Google's own pixels (see google-one-to-one.test.ts) and stays full width, which
// is why this file takes the frame's strings and buttons rather than its 760px column.

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import {
  FRAME_ROW_PX,
  FRAME_TITLE_TEXT,
  FRAME_TOP_PX,
  Pill,
  RoundButton,
} from "@/components/workspace/shell/page-frame";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";
import { dateKey } from "@/lib/workspace/calendar-model";


import { VIEW_OPTIONS, VIEW_UNIT_LABEL, viewLabel, type CalendarViewMode } from "./format";
import { ColorFilter } from "./color-filter";

interface CalendarHeaderProps {
  view: CalendarViewMode;
  cursor: Date;
  today: Date;
  /** Colours present on the calendar, in palette order. */
  colours: readonly string[];
  hiddenColors: ReadonlySet<string>;
  onChangeView: (view: CalendarViewMode) => void;
  onChangeHiddenColors: (next: Set<string>) => void;
  onStep: (delta: 1 | -1) => void;
  onToday: () => void;
  onAddEvent: (dateKeyStr: string) => void;
  /**
   * Absent when this learner has no calendar connected, and that is the gate.
   *
   * 🔴 THE CONTROL IS NOT SHOWN AT ALL RATHER THAN SHOWN AND DISABLED. A greyed-out Sync button on
   * a calendar with nothing to sync to is a dead control, and this codebase has a standing rule
   * against those (`capabilities-are-live.test.ts`). Somebody who has not connected Google has no
   * question this button could answer.
   */
  onSync?: () => void;
  syncing?: boolean;
}

export function CalendarHeader({
  view,
  cursor,
  today,
  colours,
  hiddenColors,
  onChangeView,
  onChangeHiddenColors,
  onStep,
  onToday,
  onAddEvent,
  onSync,
  syncing,
}: CalendarHeaderProps) {
  return (
    <header
      className="flex shrink-0 flex-wrap items-center gap-[8px] px-[16px] pb-[12px] max-sm:px-[12px]"
      style={{ minHeight: FRAME_TOP_PX + FRAME_ROW_PX + 12, paddingTop: FRAME_TOP_PX }}
    >
      {/* GOOGLE'S TOOLBAR ORDER, one row (owner 2026-07-31: "literally copy it"): Today and the
          arrows FIRST, then the date range, then the controls pushed right. */}
      <Pill active onClick={onToday}>
        Today
      </Pill>
      <div className="flex items-center gap-[2px]">
        <RoundButton label={`Previous ${VIEW_UNIT_LABEL[view]}`} onClick={() => onStep(-1)}>
          <ChevronLeft size={18} />
        </RoundButton>
        <RoundButton label={`Next ${VIEW_UNIT_LABEL[view]}`} onClick={() => onStep(1)}>
          <ChevronRight size={18} />
        </RoundButton>
      </div>
      {/* The date range, at the frame's title type: this is where every other page prints its
          name, and the month or week IS this page's name. */}
      <h1 className={cn("min-w-0 truncate", FRAME_TITLE_TEXT)}>{viewLabel(view, cursor)}</h1>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-[8px]">
        {/* Sync only when the door exists (`onSync` optional is the gate — see sync-door.test.ts). */}
        {onSync ? (
          <Pill active label="Sync with Google Calendar" onClick={syncing ? undefined : onSync}>
            {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            <span className="max-sm:sr-only">{syncing ? "Syncing" : "Sync"}</span>
          </Pill>
        ) : null}
        <ColorFilter colours={colours} hidden={hiddenColors} onChange={onChangeHiddenColors} />
        <ViewMenu onChange={onChangeView} value={view} />
        {/* Add event. The syllabus importer is NOT here (owner 2026-07-31: everything runs
            through the chat instead); it opens from the composer's Add menu. */}
        <RoundButton label="Add event" onClick={() => onAddEvent(dateKey(today))}>
          <Plus size={18} />
        </RoundButton>
      </div>
    </header>
  );
}

function ViewMenu({ onChange, value }: { onChange: (view: CalendarViewMode) => void; value: CalendarViewMode }) {
  const current = VIEW_OPTIONS.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pill active label="Change view">
          {current?.label ?? "Week"}
          <ChevronDown size={14} />
        </Pill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {VIEW_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onChange(option.id)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
