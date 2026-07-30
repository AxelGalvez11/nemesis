"use client";

// Pointer gestures for the day/week time grid: drag out a new event, drag one
// to a different time or day, drag its bottom edge to change how long it runs.
//
// Owner 2026-07-30: the web calendar "doesn't match the apple style in
// functionality". This is most of that gap. Before this, a click anywhere in a
// day column produced an UNTIMED event on that date — the grid could show you
// where 9am was but could not be used to say "9am".
//
// The file holds only the bookkeeping: which gesture is running, where the
// pointer is, and whether it has moved far enough to count as a drag. Every
// pixel-to-time conversion is a call into time-grid.ts, which is pure and
// tested, because a drag cannot be driven by this project's browser tooling —
// so anything that lives here can be reasoned about but not exercised.

import { useCallback, useEffect, useRef, useState } from "react";

import type { CalendarEvent, MonthDay } from "@/lib/workspace/calendar-model";

import { type HourWindow, minuteAtOffset, movedRange, rangeFromDrag, resizedRange, type TimeRange } from "./time-grid";

/**
 * How far the pointer must travel before a press counts as a drag.
 *
 * Without a threshold there is no such thing as a click: a press on an event
 * would commit a zero-minute move instead of opening it, and every student
 * with an unsteady hand would silently reschedule their own lectures.
 */
const DRAG_THRESHOLD_PX = 4;

interface GestureBase {
  dayIndex: number;
  minute: number;
  moved: boolean;
  /** Touch is not treated as a drag — see `begin`. */
  touch: boolean;
}

export type Gesture =
  | (GestureBase & { kind: "create"; anchorMinute: number })
  | (GestureBase & { kind: "move"; event: CalendarEvent; originMinute: number })
  | (GestureBase & { kind: "resize"; event: CalendarEvent });

/** Where a gesture ended up, in the shape both callers need. */
export interface GestureResult {
  dateKey: string;
  range: TimeRange;
}

interface Options {
  days: readonly MonthDay[];
  hours: HourWindow;
  /** A slot was picked out — open the quick-create card over it. */
  onPickSlot: (result: GestureResult, anchor: DOMRect) => void;
  /** An existing event was dragged to a new time, day, or length. */
  onCommit: (event: CalendarEvent, result: GestureResult) => void;
  /** A press that never became a drag: an ordinary click on an event. */
  onOpenEvent: (event: CalendarEvent) => void;
}

export function useTimeGridGestures({ days, hours, onCommit, onOpenEvent, onPickSlot }: Options) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  // The press position, kept in a ref rather than state: it is read on every
  // pointermove to measure travel, and it must never trigger a render itself.
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  /** Which day column and which minute a screen position falls on. */
  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect || days.length === 0) return null;
      const columnWidth = rect.width / days.length;
      const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / columnWidth)));
      return { columnWidth, dayIndex, gridRect: rect, minute: minuteAtOffset(clientY - rect.top, hours) };
    },
    [days.length, hours],
  );

  const begin = useCallback(
    (nativeEvent: React.PointerEvent, next: (at: { dayIndex: number; minute: number }) => Gesture | null) => {
      // Secondary buttons belong to the context menu, and a second finger
      // mid-drag would otherwise restart the gesture from a new anchor.
      if (nativeEvent.button !== 0 || gesture) return;
      const at = locate(nativeEvent.clientX, nativeEvent.clientY);
      if (!at) return;
      const started = next(at);
      if (!started) return;
      // On a touch screen the same downward swipe means "scroll the calendar",
      // and there is no hover to tell the two apart. So touch gets the TAP half
      // only: no preventDefault, so the page still scrolls, and any real travel
      // abandons the gesture (see handlePointerMove) rather than dropping an
      // event wherever the finger stopped.
      if (!started.touch) {
        nativeEvent.preventDefault();
        // Capture on the GRID, not on the block: a fast drag leaves a 30px-tall
        // event within a frame or two, and an uncaptured pointer stops
        // reporting the moment it does.
        gridRef.current?.setPointerCapture(nativeEvent.pointerId);
      }
      pressRef.current = { x: nativeEvent.clientX, y: nativeEvent.clientY };
      setGesture(started);
    },
    [gesture, locate],
  );

  const beginCreate = useCallback(
    (nativeEvent: React.PointerEvent) =>
      begin(nativeEvent, (at) => ({
        anchorMinute: at.minute,
        dayIndex: at.dayIndex,
        kind: "create",
        minute: at.minute,
        moved: false,
        touch: nativeEvent.pointerType === "touch",
      })),
    [begin],
  );

  const beginMove = useCallback(
    (nativeEvent: React.PointerEvent, event: CalendarEvent) =>
      begin(nativeEvent, (at) => ({
        dayIndex: at.dayIndex,
        event,
        kind: "move",
        minute: at.minute,
        moved: false,
        originMinute: at.minute,
        touch: nativeEvent.pointerType === "touch",
      })),
    [begin],
  );

  const beginResize = useCallback(
    (nativeEvent: React.PointerEvent, event: CalendarEvent) =>
      begin(nativeEvent, (at) => ({
        dayIndex: at.dayIndex,
        event,
        kind: "resize",
        minute: at.minute,
        moved: false,
        touch: nativeEvent.pointerType === "touch",
      })),
    [begin],
  );

  const handlePointerMove = useCallback(
    (nativeEvent: React.PointerEvent) => {
      if (!gesture) return;
      const at = locate(nativeEvent.clientX, nativeEvent.clientY);
      if (!at) return;
      const press = pressRef.current;
      const travelled =
        press !== null &&
        Math.hypot(nativeEvent.clientX - press.x, nativeEvent.clientY - press.y) >= DRAG_THRESHOLD_PX;
      // A finger that moved is scrolling the page, not dragging out an event.
      if (gesture.touch && travelled) {
        pressRef.current = null;
        setGesture(null);
        return;
      }
      setGesture((prev) => {
        if (!prev) return prev;
        const moved = prev.moved || travelled;
        // A resize only ever changes the end time, so it stays in its own
        // column however far sideways the pointer wanders.
        if (prev.kind === "resize") return { ...prev, minute: at.minute, moved };
        return { ...prev, dayIndex: at.dayIndex, minute: at.minute, moved };
      });
    },
    [gesture, locate],
  );

  const handlePointerUp = useCallback(
    (nativeEvent: React.PointerEvent) => {
      if (!gesture) return;
      const grid = gridRef.current;
      if (grid?.hasPointerCapture(nativeEvent.pointerId)) grid.releasePointerCapture(nativeEvent.pointerId);
      pressRef.current = null;
      setGesture(null);

      const dayKey = days[gesture.dayIndex]?.key;
      if (!dayKey) return;

      if (gesture.kind === "create") {
        // A press with no travel is a click, and rangeFromDrag already turns
        // that into a default-length event at the minute clicked.
        const range = rangeFromDrag(gesture.anchorMinute, gesture.minute);
        const rect = grid?.getBoundingClientRect();
        if (!rect) return;
        const columnWidth = rect.width / days.length;
        onPickSlot(
          { dateKey: dayKey, range },
          new DOMRect(rect.left + gesture.dayIndex * columnWidth, nativeEvent.clientY, columnWidth, 1),
        );
        return;
      }

      if (!gesture.moved) {
        // The press never became a drag: treat it as what it looks like.
        if (gesture.kind === "move") onOpenEvent(gesture.event);
        return;
      }

      const range =
        gesture.kind === "move"
          ? movedRange(gesture.event, gesture.minute - gesture.originMinute)
          : resizedRange(gesture.event, gesture.minute);
      // An all-day event has no grid position, so there is nothing to commit.
      if (!range) return;
      // A resize never changes the day, whatever column the pointer ended in.
      onCommit(gesture.event, { dateKey: gesture.kind === "resize" ? gesture.event.date : dayKey, range });
    },
    [days, gesture, onCommit, onOpenEvent, onPickSlot],
  );

  // Escape abandons a drag in progress. Without it the only way out of a
  // mis-started drag is to complete it and then undo the change by hand.
  useEffect(() => {
    if (!gesture) return;
    const cancel = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      pressRef.current = null;
      setGesture(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [gesture]);

  /** The block to paint while a gesture runs, or null when nothing is dragging.
   *  Move and resize show a GHOST and leave the real block where it is, so the
   *  student can see what they are changing it from. */
  const preview = (():
    | { dayIndex: number; startMinute: number; endMinute: number; label: string }
    | null => {
    if (!gesture) return null;
    if (gesture.kind === "create") {
      const range = rangeFromDrag(gesture.anchorMinute, gesture.minute);
      return {
        dayIndex: gesture.dayIndex,
        endMinute: toMinutes(range.endTime),
        label: "New event",
        startMinute: toMinutes(range.time),
      };
    }
    if (!gesture.moved) return null;
    const range =
      gesture.kind === "move"
        ? movedRange(gesture.event, gesture.minute - gesture.originMinute)
        : resizedRange(gesture.event, gesture.minute);
    if (!range) return null;
    return {
      dayIndex: gesture.dayIndex,
      endMinute: toMinutes(range.endTime),
      label: gesture.event.title,
      startMinute: toMinutes(range.time),
    };
  })();

  return { beginCreate, beginMove, beginResize, gesture, gridRef, handlePointerMove, handlePointerUp, preview };
}

/** "HH:MM" back to minutes for drawing. The strings here are produced by
 *  clockOf, so they always parse; 0 is an unreachable fallback. */
function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
