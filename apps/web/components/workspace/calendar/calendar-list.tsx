"use client";

// The calendar list — Google's left rail, as a popover off the header.
//
// 🔴 A TICK BOX PER CALENDAR IS THE POINT OF HAVING CALENDARS AT ALL. A student
// with a personal calendar, a timetable and a shared study-group calendar wants
// to see two of them some days and all three on others, and that is a thing no
// amount of colouring achieves. Nemesis had one flat list, so this control had
// nothing to list.
//
// It is a popover rather than a permanent rail because the month grid is already
// sized to fit the window without scrolling (owner 2026-08-03) and 200px of
// permanent furniture down the left is 200px the grid no longer has.

import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import { CALENDAR_COLORS, calendarColorOf } from "@/lib/workspace/calendar-colors";
import { type Calendar, PRIMARY_CALENDAR } from "@/lib/workspace/calendars";
import { cn } from "@/lib/utils";

interface CalendarListProps {
  calendars: Calendar[];
  onToggleHidden: (calendar: Calendar) => void;
  onSave: (calendar: Calendar) => void;
  onDelete: (id: string) => void;
  onCreate: (name: string) => void;
}

export function CalendarList({ calendars, onCreate, onDelete, onSave, onToggleHidden }: CalendarListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const shown = calendars.filter((calendar) => !calendar.hidden).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-(--ui-stroke-secondary) px-2.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
          type="button"
        >
          Calendars
          <span className="tabular-nums text-(--ui-text-quaternary)">
            {shown}/{calendars.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex flex-col gap-0.5">
          {calendars.map((calendar) => {
            const color = calendarColorOf(calendar.colorId);
            const isPrimary = calendar.id === PRIMARY_CALENDAR.id;
            return (
              <div className="flex flex-col" key={calendar.id || "primary"}>
                <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-(--ui-control-hover-background)">
                  <input
                    aria-label={`Show ${calendar.name}`}
                    checked={!calendar.hidden}
                    className="shrink-0"
                    onChange={() => onToggleHidden(calendar)}
                    type="checkbox"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "size-3 shrink-0 rounded-[4px]",
                      // No colour of its own: a hollow square rather than a
                      // filled one, so "takes its colour from the event type"
                      // reads as a state instead of an arbitrary grey choice.
                      !color && "border border-dashed border-(--ui-stroke-primary)",
                    )}
                    style={color ? { backgroundColor: color.hex } : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">{calendar.name}</span>
                  <button
                    aria-label={`Edit ${calendar.name}`}
                    className="shrink-0 rounded px-1 text-[0.625rem] text-(--ui-text-tertiary) hover:text-foreground"
                    onClick={() => setEditing(editing === calendar.id ? null : calendar.id)}
                    type="button"
                  >
                    {editing === calendar.id ? "Done" : "Edit"}
                  </button>
                </div>

                {editing === calendar.id && (
                  <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) p-2">
                    {/* The primary calendar cannot be renamed or deleted: it is
                        not a row, it is where everything with no calendar lives.
                        Its colour is not offered either — that would recolour
                        every event the student never filed anywhere. */}
                    {!isPrimary && (
                      <input
                        aria-label="Calendar name"
                        className="h-7 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-xs"
                        onChange={(e) => onSave({ ...calendar, name: e.target.value })}
                        value={calendar.name}
                      />
                    )}
                    <div aria-label="Calendar colour" className="flex flex-wrap gap-1" role="group">
                      <button
                        aria-label="No colour"
                        aria-pressed={!calendar.colorId}
                        className={cn(
                          "size-4 rounded-[4px] border border-dashed border-(--ui-stroke-primary)",
                          !calendar.colorId && "ring-2 ring-(--ui-text-secondary)",
                        )}
                        onClick={() => onSave({ ...calendar, colorId: undefined })}
                        title="Use the event type's colour"
                        type="button"
                      />
                      {CALENDAR_COLORS.map((swatch) => (
                        <button
                          aria-label={swatch.name}
                          aria-pressed={calendar.colorId === swatch.id}
                          className={cn(
                            "size-4 rounded-[4px]",
                            calendar.colorId === swatch.id && "ring-2 ring-(--ui-text-secondary)",
                          )}
                          key={swatch.id}
                          onClick={() => onSave({ ...calendar, colorId: swatch.id })}
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.name}
                          type="button"
                        />
                      ))}
                    </div>
                    {!isPrimary && (
                      <button
                        className="self-start rounded px-1 text-[0.625rem] font-medium text-(--ui-exam) hover:underline"
                        onClick={() => {
                          setEditing(null);
                          onDelete(calendar.id);
                        }}
                        type="button"
                      >
                        Delete calendar
                      </button>
                    )}
                    {!isPrimary && (
                      <p className="text-[0.625rem] text-(--ui-text-quaternary)">
                        Deleting a calendar keeps its events. They move to {PRIMARY_CALENDAR.name}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form
          className="mt-2 flex gap-1 border-t border-(--ui-stroke-tertiary) pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            onCreate(newName.trim());
            setNewName("");
          }}
        >
          <input
            aria-label="New calendar name"
            className="h-7 min-w-0 flex-1 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-xs"
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New calendar"
            value={newName}
          />
          <button
            className="shrink-0 rounded-lg border border-(--ui-stroke-secondary) px-2 text-xs font-medium hover:bg-(--ui-control-hover-background)"
            type="submit"
          >
            Add
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
