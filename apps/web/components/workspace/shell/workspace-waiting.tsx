"use client";

// What the whole workspace shows while it is deciding whether you are signed in.
//
// 🔴🔴 THE SCREEN THIS REPLACES WAS THE PRODUCT'S ONLY UNRECOVERABLE STATE. Owner, 2026-08-30:
// *"exiting a canvas cause the screen to go blank, it should take to landing page."*
//
// `(workspace)/layout.tsx` used to render `<main className="nemesis-account-loading">Loading…</main>`
// — the ACCOUNT PORTAL's screen, borrowed. Measured on production in the owner's own browser: a
// full-viewport `#080809` ground with the word LOADING at **11px**, letter-spaced, centred in a
// field of near-black. It is right where it belongs, on a black account site; inside the product it
// is indistinguishable from a page that failed to draw. It is also what the prerendered HTML for
// `/learn` literally contains, so it is the first thing every full page load of the workspace shows.
//
// 🔴 AND IT COULD STAY UP FOR EVER, WHICH IS THE HALF THAT MAKES IT A BUG RATHER THAN A TASTE
// PROBLEM. `AuthProvider` clears `loading` only when `supabase.auth.getSession()` settles, and that
// call has no timeout. A request that hangs — a cold token refresh on a flaky network, a captive
// portal, a tab woken after hours asleep — leaves this screen up with nothing on it that leads
// anywhere. No rail, no exit, no text. The learner's only move is one nobody thinks to make on a
// blank page: reload.
//
// So this screen does two things the old one could not:
//
//   1. IT LOOKS LIKE THE PRODUCT. Same ground as the surface that is about to replace it, so the
//      hand-over is a fill rather than a flash of another app's colour scheme.
//   2. IT ADMITS WHEN IT IS STUCK. Silent for `PATIENT_MS`, because almost every wait here is
//      under a second and a message that flashes on every load is worse than no message. Past that
//      it says so and offers the two things that actually work.
//
// 🔴 THE WAY OUT IS A PLAIN `<a>`, NOT `router.push`. Whatever is wrong may be the client router or
// the application state itself, and a control that runs application code to work is exactly the
// kind that fails in the same breath. `learn/error.tsx` and `canvas-quiet.tsx` both already argue
// this in their own notes; this is the third place it applies and the first where the alternative
// was nothing at all.

import { useEffect, useState } from "react";

/**
 * How long the wait stays silent.
 *
 * 🔴 LONG ENOUGH THAT NOBODY EVER SEES IT ON A NORMAL LOAD. Measured on production: the workspace
 * is past this gate 285ms after the document loads, so a threshold anywhere above a second means
 * the message is only ever read by someone genuinely stuck. Six is comfortably past the slowest
 * honest session check and still well inside the time it takes to decide a page is broken.
 */
const PATIENT_MS = 6_000;

export function WorkspaceWaiting() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStuck(true), PATIENT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex h-screen w-full items-center justify-center bg-(--ui-bg-editor)">
      {/* 🔴 NOTHING AT ALL UNTIL IT IS SLOW. A spinner or a word here would appear and vanish on
          every single load of the workspace, announcing an internal step that is over before it
          can be read — the same reasoning `workspace-shell.tsx` uses to hold its own nav transition
          until after the first paint. */}
      {stuck ? (
        <div className="mx-auto w-full max-w-sm px-6 text-center">
          <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
            Nemesis is taking longer than usual to open.
          </p>
          <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            Your work is saved. Reloading almost always fixes it.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {/* 🔴 BOTH ARE REAL LINKS. See the file header: a click handler is not a recovery path
                when the thing that is broken might be the client router. */}
            <a
              className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              href="/learn"
            >
              Reload
            </a>
            <a
              className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              href="/sign-in"
            >
              Sign in again
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
