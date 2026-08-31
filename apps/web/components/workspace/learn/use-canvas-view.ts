"use client";

// The view choice, held in React for the visit — and the healer for the pin old builds left behind.
//
// 🔴 SEPARATE FROM `lib/learn/canvas-view.ts` SO THAT FILE STAYS PURE. The rules about what a view
// may be, and what it may never reach, are testable without a DOM; this is only the plumbing.
//
// 🔴🔴🔴 THE VIEW IS NEVER READ FROM STORAGE AND NEVER WRITTEN TO IT. This hook used to persist the
// toggle under `CANVAS_VIEW_STORAGE_KEY`, and that one decision produced the same owner report
// three times over four days ("chat mode not showing conversation history"): one click of "Focus on
// the latest output" pinned `answer` for every canvas, on every visit, invisibly — while the thread
// underneath it worked the whole time. The full account, with the owner's words and the on-screen
// reproduction, is on the key's own doc in `lib/learn/canvas-view.ts`. Every canvas now opens on
// `DEFAULT_CANVAS_VIEW`; focusing lasts while you look.

import { useCallback, useEffect, useState } from "react";

import { CANVAS_VIEW_STORAGE_KEY, DEFAULT_CANVAS_VIEW, otherCanvasView, type CanvasView } from "@/lib/learn/canvas-view";

export function useCanvasView(): { view: CanvasView; setView: (next: CanvasView) => void; toggle: () => void } {
  const [view, setStateView] = useState<CanvasView>(DEFAULT_CANVAS_VIEW);

  // 🔴 DELETE THE OLD PIN, ADOPT NOTHING. Browsers that used the persisting build still carry
  // `answer` under this key; leaving it there invites some future reader to trust it. Removal is
  // the one storage access this feature has left, and it is guarded because `localStorage` THROWS —
  // not returns null — in a private window, with site data blocked, and inside a cross-origin
  // frame. An unguarded touch here would take the whole Canvas down to tidy a dead key.
  useEffect(() => {
    try {
      window.localStorage.removeItem(CANVAS_VIEW_STORAGE_KEY);
    } catch {
      // Storage is unavailable, so the pin it might hold cannot be read by anything either.
    }
  }, []);

  const setView = useCallback((next: CanvasView) => setStateView(next), []);
  const toggle = useCallback(() => setStateView((current) => otherCanvasView(current)), []);

  return { setView, toggle, view };
}
