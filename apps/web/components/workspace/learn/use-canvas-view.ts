"use client";

// The view preference, held in React and mirrored to the browser.
//
// 🔴 SEPARATE FROM `lib/learn/canvas-view.ts` SO THAT FILE STAYS PURE. The rules about what a view
// may be, and what it may never reach, are testable without a DOM; this is only the plumbing.

import { useCallback, useEffect, useState } from "react";

import {
  CANVAS_VIEW_STORAGE_KEY,
  DEFAULT_CANVAS_VIEW,
  otherCanvasView,
  readCanvasView,
  type CanvasView,
} from "@/lib/learn/canvas-view";

/**
 * 🔴🔴 IT STARTS ON THE DEFAULT AND ADOPTS THE STORED VALUE IN AN EFFECT, WHICH IS NOT AN
 * OPTIMISATION — IT IS THE ONLY CORRECT ORDER UNDER SERVER RENDERING. Reading `localStorage` in the
 * initialiser runs during hydration, where the server rendered the default and the client would
 * render something else: React discards the tree and warns, and in production it silently keeps
 * whichever it got first. The one-frame flash of the answer view is the price, and it is invisible
 * next to a hydration mismatch on the product's primary page.
 *
 * 🔴 EVERY ACCESS IS GUARDED. `localStorage` THROWS — not returns null — in a private window, with
 * site data blocked, and inside a cross-origin frame. An unguarded read here would take out the
 * whole Canvas for the sake of remembering a preference, which is the wrong trade by a wide margin.
 */
export function useCanvasView(): { view: CanvasView; setView: (next: CanvasView) => void; toggle: () => void } {
  const [view, setStateView] = useState<CanvasView>(DEFAULT_CANVAS_VIEW);

  useEffect(() => {
    try {
      setStateView(readCanvasView(window.localStorage.getItem(CANVAS_VIEW_STORAGE_KEY)));
    } catch {
      // Storage is unavailable. The default is already on screen; there is nothing to recover.
    }
  }, []);

  const setView = useCallback((next: CanvasView) => {
    setStateView(next);
    try {
      window.localStorage.setItem(CANVAS_VIEW_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this visit; it simply will not outlive it.
    }
  }, []);

  const toggle = useCallback(() => setStateView((current) => {
    const next = otherCanvasView(current);
    try {
      window.localStorage.setItem(CANVAS_VIEW_STORAGE_KEY, next);
    } catch {
      // As above.
    }
    return next;
  }), []);

  return { setView, toggle, view };
}
