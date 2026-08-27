"use client";

// How wide a docked reader is, and the drag that changes it.
//
// Owner, 2026-08-27: *"allow user to slide the sidebar width like in chatgpt."*
//
// 🔴 A FRACTION OF THE VIEWPORT, NOT A PIXEL COUNT, AND THAT IS WHAT SURVIVES A RESIZE. The
// measured default is two thirds (980 of 1470 — see reader-chrome.ts). Storing pixels would make a
// panel dragged wide on a large monitor cover the whole canvas on a laptop; storing the fraction
// keeps the same PROPORTION the learner chose.
//
// 🔴 IT PERSISTS, BECAUSE A WIDTH YOU HAVE TO SET EVERY TIME IS NOT A PREFERENCE. Same reasoning
// and same storage as the canvas view: it is a fact about how somebody likes to work, never a fact
// about the document, so it goes in the browser and never on the source.

import { useCallback, useEffect, useRef, useState } from "react";

import { DOCK_FRACTION } from "./reader-chrome";

const STORAGE_KEY = "nemesis.reader.dock";

/**
 * 🔴 BOUNDED SO THE DRAG CANNOT PRODUCE A USELESS PANEL. Below a third the reader is narrower than
 * the column it is showing and every line wraps twice; above 0.9 the canvas behind it is a sliver,
 * and the close button becomes the only way back to a page the learner can no longer see.
 */
const MIN_FRACTION = 0.3;
const MAX_FRACTION = 0.9;

const clamp = (value: number) => Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, value));

/** Read a stored fraction, refusing anything that is not a usable number. */
export function readDockFraction(raw: string | null | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? clamp(parsed) : DOCK_FRACTION;
}

export function useDockWidth(): {
  /** Pixels, for the panel and for the inset the canvas is pushed by. */
  width: number;
  /** True while a drag is in progress — the panel drops its transition for the duration. */
  dragging: boolean;
  onDragStart: (event: React.PointerEvent) => void;
} {
  const [fraction, setFraction] = useState(DOCK_FRACTION);
  const [viewport, setViewport] = useState(0);
  const [dragging, setDragging] = useState(false);
  const live = useRef(false);

  // 🔴 ADOPTED AFTER MOUNT, never read during render: the server has no `localStorage` and no
  // window width, and a value that differs between the two makes React discard the tree.
  useEffect(() => {
    try {
      setFraction(readDockFraction(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Storage unavailable. The measured default is already in force.
    }
  }, []);

  useEffect(() => {
    const measure = () => setViewport(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const onDragStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    live.current = true;
    setDragging(true);
    // 🔴 ON THE WINDOW, NOT THE HANDLE. A 6px grip loses the pointer the moment the drag outruns
    // the render, and the panel then sticks mid-drag with the button still held.
    const onMove = (move: PointerEvent) => {
      if (!live.current) return;
      setFraction(clamp((window.innerWidth - move.clientX) / window.innerWidth));
    };
    const onUp = () => {
      live.current = false;
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // Written on release rather than on every frame: a drag is one decision, not sixty.
      setFraction((current) => {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(current));
        } catch {
          // The width still applies to this visit; it simply will not outlive it.
        }
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return { dragging, onDragStart, width: Math.round(viewport * fraction) };
}
