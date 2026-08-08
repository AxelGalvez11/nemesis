"use client";

// The Learning Canvas pilot (/learn).
//
// Inside the (workspace) group on purpose: sign-in, the two-factor guard and the upgrade
// dialog all come from the shell, and — decisively — the whole `--ui-*` token layer is scoped
// under the `[data-workspace]` attribute the shell stamps. A route outside the group would
// have no design system at all.
//
// It is NOT in the sidebar. That is how /slides and /notebooks are already kept reachable but
// unadvertised, and it is the only hiding this app can do (there is no middleware).

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { LearningCanvas } from "@/components/workspace/learn/learning-canvas";

function LearnSurface() {
  // A canvas is addressable by `?c=<id>` rather than by path segment, because the shell's
  // immersive-route check compares the pathname by exact string — a /learn/[id] route would
  // silently get the sidebar back.
  const canvasId = useSearchParams().get("c");
  return <LearningCanvas canvasId={canvasId} />;
}

export default function LearnPage() {
  return (
    <Suspense fallback={<main className="h-full bg-(--ui-bg-editor)" />}>
      <LearnSurface />
    </Suspense>
  );
}
