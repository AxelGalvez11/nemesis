"use client";

// Which app slugs this learner has connected, for gating the two connection-borne nav rows.
//
// 🔴 CACHED IN sessionStorage SO THE RAIL DOES NOT POP ON EVERY LOAD. `connectionStatus()` is a
// network read; rows that appear half a second after the rail would read as the page breaking
// (owner 2026-08-19, on exactly that: "why do the icons on the right disappear?"). The cache makes
// every load after the first render with the answer already in hand; the very first visit renders
// the ungated rows and gains Plugins/Calendar once, when the read lands — appearing once and
// staying is the minimap's own precedent, flicker is what is forbidden.
//
// 🔴 A FAILED READ IS "NOTHING CONNECTED", NOT AN ERROR — the same rule `canvas-home.tsx` states
// for the Connect-apps row. Without a key on the server this stays [], which simply keeps the two
// gated rows off, and the always-present front-door row remains the way in.

import { useEffect, useState } from "react";

import { connectionStatus } from "@/lib/workspace/composio-client";

const CACHE_KEY = "nemesis.nav.connectedApps.v1";

/**
 * 🔴🔴 THE SHARE MOVED INTO `connectionStatus` ITSELF, 2026-09-02, AND THE MOVE IS THE FIX.
 *
 * The reason it was built here still stands: since 2026-09-01 the collapsed rail and the open
 * sidebar are BOTH in the document at once so they can cross-fade (workspace-shell.tsx), and each
 * one draws `visibleNav`, so each one asks. But a deduplicator that lives in one caller cannot see
 * the others — and `canvas-home.tsx` asks the same question for the connect row under the front
 * door's composer. Measured on production the same day: two `POST /api/composio` calls on every
 * `/learn` load, both starting at 342 ms, 589 ms and 713 ms long, each a round trip to Composio's
 * own API behind our route.
 *
 * `composio-client.ts` now merges overlapping reads for every caller, with the same "cleared when
 * it settles, never cached" rule this copy had — so a `focus` re-read, and the Plugins page's
 * re-read after a connect, are still fresh.
 */

function readCache(): readonly string[] {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function useConnectedApps(): readonly string[] {
  const [connected, setConnected] = useState<readonly string[]>(readCache);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void connectionStatus().then(
        (status) => {
          if (!alive) return;
          // 🔴 UNIONED, NEVER REPLACED, BECAUSE THE RAIL'S RULE IS ARRIVE-AND-STAY. The owner's
          // 2026-08-19 "why do the icons disappear?" is what `visibleNav` is built around: gates
          // must be monotonic within a session, and flicker is the sin. Re-reading on focus could
          // otherwise take Plugins away mid-session on one slow or half-failed response, which is
          // a worse bug than the one this re-read fixes. A disconnection still takes effect on the
          // next load; within a session the row only ever appears.
          setConnected((had) => [...new Set([...had, ...status.connected])]);
          try {
            window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(status.connected));
          } catch {
            // A browser that refuses the cache costs one pop-in per load, nothing else.
          }
        },
        () => {},
      );
    read();
    // 🔴 AND AGAIN WHEN THE TAB COMES BACK. Connecting an app happens in ANOTHER tab, so nothing
    // here unmounts and the single read above never ran again: the learner authorised Google
    // Calendar, returned, and the Calendar row still was not there. Owner, 2026-08-31.
    const onFocus = () => read();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return connected;
}
