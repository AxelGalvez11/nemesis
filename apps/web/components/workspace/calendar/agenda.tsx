// Agenda rail — verbatim from desktop calendar/index.tsx §A.11. Always visible
// alongside every view mode. Exact empty-state copy per §A.12 — do not paraphrase.

import { EmptyState } from "@/components/desktop-ui/empty-state";
import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";
import { DEFAULT_PAINT } from "./kind-meta";

interface AgendaProps {
  events: CalendarEvent[];
  hasAnyEvents: boolean;
  loaded: boolean;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function Agenda({ events, hasAnyEvents, loaded, onOpenEvent }: AgendaProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Agenda</p>
        <h2 className="mt-0.5 text-sm font-semibold tracking-tight">Next 30 days</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!loaded ? (
          <div className="grid min-h-32 place-items-center text-xs text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <EmptyState
            className="min-h-40"
            description={
              hasAnyEvents
                ? "Nothing due in the next 30 days."
                : "Ask Nemesis to pull your due dates from Blackboard and Outlook, or add one."
            }
            title={hasAnyEvents ? "All clear" : "No deadlines yet"}
          />
        ) : (
          <div className="flex flex-col gap-1">
            {events.map((event) => (
              <button
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-(--ui-control-hover-background)"
                key={event.id}
                onClick={() => onOpenEvent(event)}
                type="button"
              >
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", DEFAULT_PAINT.dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{event.title}</span>
                  <span className="block text-[0.6875rem] text-muted-foreground">
                    {formatEventDate(event.date)}
                    {event.time ? ` · ${formatEventTime(event.time)}` : ""}
                    {event.course ? ` · ${event.course}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
