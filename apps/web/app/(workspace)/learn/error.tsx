"use client";

// The crash barrier for the Canvas route.
//
// 🔴🔴 WITHOUT THIS FILE, THERE IS NO ERROR BOUNDARY ANYWHERE IN THIS APP — not here, not at the
// app root (`apps/web/app/global-error.tsx` does not exist), not anywhere in `apps/web/app`. So
// any render-phase exception thrown by ANYTHING inside `LearningCanvas` — a 2000+ line component
// with dozens of conditional branches over real, sometimes-irregular session data — fell all the
// way through to Next's own bare handling: no exit, no nav rail, nothing. Verified on screen by
// throwing deliberately from inside `LearningCanvas` with this file absent: Next's dev overlay (in
// production, an unstyled "Application error") replaced the ENTIRE viewport, and there was no
// control anywhere on it that led back into the product.
//
// 🔴 THIS IS THE SAME INVARIANT `canvas-surface.tsx` PROTECTS, ONE LAYER OUT. That file makes sure
// every RENDER BRANCH of a working canvas carries the `×`; a branch that throws instead of
// returning is not a branch that file can see, because it never finishes rendering far enough to
// reach `CanvasSurface` at all. This file is what catches that case.
//
// 🔴 SAFE TO PLACE HERE, RATHER THAN NEEDING A FIX INSIDE `learning-canvas.tsx` ITSELF, BECAUSE OF
// HOW NEXT SCOPES `error.tsx`: it wraps this ROUTE SEGMENT (`page.tsx` and everything under it) in
// a boundary that sits OUTSIDE that segment — so `(workspace)/layout.tsx`, and the
// `WorkspaceShell` it renders, stay mounted and un-crashed. `WorkspaceShell` is what owns the nav
// rail and the `ImmersiveSurfaceProvider` registry (see `shell/immersive-surface.tsx`), so when
// React unmounts the crashed subtree to show this fallback, `useDeclareImmersiveSurface`'s cleanup
// runs exactly as it would on any ordinary unmount, the claim releases, and the rail comes back on
// its own. This file only has to supply the second half: something to press.
//
// 🔴 "Leave the canvas" IS A PLAIN `<a>`, NOT `router.push`. Whatever crashed the render may be
// crashed application state rather than a merely-ugly screen, so a click handler that reads that
// same state to decide where to go is exactly the kind of thing that could also fail. The same
// reasoning is already in this codebase — `canvas-quiet.tsx`'s retry note explains why its own
// recovery path is a full document load rather than a client navigation. An anchor tag's `href`
// does not run application code to work.
//
// 🔴 RESTRAINED, NOT AN ERROR SCREEN (§19, §28's rule, carried over from `canvas-quiet.tsx`). No
// icon, no red, no stack trace on screen — this is still Nemesis, having a bad moment, not a
// crash page bolted onto it. The detail goes to the console, where whoever is debugging looks.

import { useEffect } from "react";

export default function LearnError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next's own documented contract for this file: report it, then let the learner choose.
    // There is no error-reporting service wired into this app yet, so the console is where this
    // goes — see the file header on why the ON-SCREEN copy stays quiet regardless.
    console.error("[learn] the canvas failed to render", error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center bg-(--ui-bg-editor)">
      <div className="mx-auto w-full max-w-sm px-6 text-center">
        <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
          Nemesis couldn&rsquo;t render this canvas.
        </p>
        <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          Try again, or leave the canvas — your other canvases are unaffected.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          {/* 🔴 `reset()` IS NEXT'S OWN RETRY — it re-renders this segment without a full reload.
              Worth offering: some of what lands here is a transient race rather than a durably bad
              state, and the learner should not have to leave a canvas over one bad frame. */}
          <button
            className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          {/* 🔴 A REAL <a>, NOT router.push — see the file header for why. */}
          <a
            className="rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            href="/learn"
          >
            Leave the canvas
          </a>
        </div>
      </div>
    </div>
  );
}
