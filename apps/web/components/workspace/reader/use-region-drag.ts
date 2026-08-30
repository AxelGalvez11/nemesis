"use client";

// Dragging a box over part of a page, wherever that page is drawn.
//
// This was `ImageDocumentView`'s private drag until PDFs needed the same thing. What makes it worth
// sharing is not the arithmetic, it is the two decisions inside it that were each found the hard way
// and would not be re-derived by a second implementation:
//
//   · The box is FRACTIONS of the element (0–1), never screen pixels. It is the only contract that
//     survives a zoom, a re-render at a new scale, or a different-sized window.
//   · The release corner comes from the `pointerup` itself, not from the last `pointermove`. A fast
//     drag can finish with very few move events, and an automated one with none at all; reading the
//     corner off the last move throws those selections away as stray clicks.

import { useCallback, useEffect, useState, type RefObject } from "react";

export interface RegionBox {
  /** All four are fractions of the drawn element, 0–1. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the box ended up on screen, so an action bar can be put beside it. Viewport coordinates,
 *  the same shape `SelectionActions` already takes for a text selection. */
export interface RegionAnchor {
  left: number;
  top: number;
  width: number;
}

/** A stray click is not a selection. Below ~1.5% in either direction there is nothing to ask about. */
const MIN_SIDE = 0.015;

export function useRegionDrag({
  enabled,
  onPicked,
  onPoint,
  target,
}: {
  enabled: boolean;
  onPicked: (region: RegionBox, anchor: RegionAnchor) => void;
  /**
   * A release too small to be a box, as the point it was.
   *
   * 🔴 ABSENT MEANS DISCARDED, which is what every box-only caller has always wanted — a stray
   * click is not a selection. The comment layer is the caller that wants both: there, a click IS
   * the gesture ("click to comment, drag to draw a box"), and swallowing it would make the
   * advertised gesture do nothing.
   */
  onPoint?: (point: { x: number; y: number }, anchor: RegionAnchor) => void;
  /** The element the box is measured against and drawn over. */
  target: RefObject<HTMLElement | null>;
}) {
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const pointFrom = useCallback(
    (event: React.PointerEvent | PointerEvent) => {
      const box = target.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return null;
      return {
        x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      };
    },
    [target],
  );

  const finish = useCallback(
    (release: { x: number; y: number } | null) => {
      setDragging(false);
      if (!drag) return;
      const x2 = release?.x ?? drag.x2;
      const y2 = release?.y ?? drag.y2;
      const region: RegionBox = {
        x: Math.min(drag.x1, x2),
        y: Math.min(drag.y1, y2),
        width: Math.abs(x2 - drag.x1),
        height: Math.abs(y2 - drag.y1),
      };
      if (region.width < MIN_SIDE || region.height < MIN_SIDE) {
        setDrag(null);
        if (onPoint) {
          const frame = target.current?.getBoundingClientRect();
          const at = { x: x2, y: y2 };
          onPoint(
            at,
            frame
              ? { left: frame.left + at.x * frame.width, top: frame.top + at.y * frame.height, width: 0 }
              : { left: 0, top: 0, width: 0 },
          );
        }
        return;
      }
      const frame = target.current?.getBoundingClientRect();
      const anchor: RegionAnchor = frame
        ? { left: frame.left + region.x * frame.width, top: frame.top + region.y * frame.height, width: region.width * frame.width }
        : { left: 0, top: 0, width: 0 };
      onPicked(region, anchor);
    },
    [drag, onPicked, onPoint, target],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const point = pointFrom(event);
      if (point) setDrag((current) => (current ? { ...current, x2: point.x, y2: point.y } : current));
    };
    const up = (event: PointerEvent) => {
      const point = pointFrom(event);
      finish(point ? { x: point.x, y: point.y } : null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, finish, pointFrom]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      const point = pointFrom(event);
      if (!point) return;
      event.preventDefault();
      setDrag({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      setDragging(true);
    },
    [enabled, pointFrom],
  );

  /** The marquee's CSS box, as percentages of the target, or null when nothing is drawn. */
  const box = drag
    ? {
        left: `${Math.min(drag.x1, drag.x2) * 100}%`,
        top: `${Math.min(drag.y1, drag.y2) * 100}%`,
        width: `${Math.abs(drag.x2 - drag.x1) * 100}%`,
        height: `${Math.abs(drag.y2 - drag.y1) * 100}%`,
      }
    : null;

  return { box, clear: useCallback(() => setDrag(null), []), dragging, onPointerDown };
}

/** The cut-out itself, taken from an already-drawn canvas or image at its own resolution.
 *
 *  🔴 NULL IS A REAL ANSWER. A cross-origin image taints the canvas and `toDataURL` throws; the
 *  region is still worth reporting, the message just has to stop claiming a picture went with it. */
export function cropFrom(source: CanvasImageSource & { width?: number; height?: number }, region: RegionBox, natural: { width: number; height: number }): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.width * natural.width));
    canvas.height = Math.max(1, Math.round(region.height * natural.height));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(
      source,
      region.x * natural.width,
      region.y * natural.height,
      region.width * natural.width,
      region.height * natural.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
