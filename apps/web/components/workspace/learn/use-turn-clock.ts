"use client";

// The "Working for 1m 38s" clock ChatGPT Work shows over a turn in flight (measured 2026-09-06,
// docs/chatgpt-work-chat-reference.md §3): elapsed time since the turn started, ticking once a
// second, and NOTHING ELSE. It is kept out of canvas-thinking-preview.tsx on purpose: that file's
// caption is the step that is genuinely running and must never be driven by a timer
// (canvas-motion.test.ts). A clock that only counts is not a simulation of progress; a caption
// that advanced on a clock would be.

import { useEffect, useState } from "react";

/** Seconds since `startedAt` (a performance.now() stamp), ticking once a second; null while no turn runs. */
export function useTurnClock(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));
  useEffect(() => {
    if (startedAt === null) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? null : Math.max(0, (now - startedAt) / 1000);
}
