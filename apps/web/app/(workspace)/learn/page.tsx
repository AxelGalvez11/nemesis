"use client";

// The Canvas surface — the product's primary page.
//
// Two states, one route:
//   /learn            the home: one composer, and the learner's sessions below it
//   /learn?c=<id>     that session
//
// 🔴 THE HOME IS ALSO THE LIBRARY. There is no /library navigation item any more: the durable
// collection is Canvas sessions, not a pile of documents, and scrolling down from the composer
// is the whole organisational experience. A second page showing the same information a
// different way is exactly what was retired.
//
// Inside the (workspace) group on purpose: sign-in, the two-factor guard and the upgrade
// dialog all come from the shell, and — decisively — the whole `--ui-*` token layer is scoped
// under the `[data-workspace]` attribute the shell stamps. A route outside the group would
// have no design system at all.

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useAuth } from "@/components/AuthProvider";
import { CanvasHome } from "@/components/workspace/learn/canvas-home";
import { LearningCanvas } from "@/components/workspace/learn/learning-canvas";

function LearnSurface() {
  // A canvas is addressable by `?c=<id>` rather than by path segment, because the shell's
  // immersive-route check compares the pathname by exact string — a /learn/[id] route would
  // silently get the sidebar back.
  const params = useSearchParams();
  const canvasId = params.get("c");
  const ask = params.get("ask");
  const { session } = useAuth();

  // No canvas named and nothing asked: this is the landing surface.
  if (!canvasId && !ask) return <CanvasHome userId={session?.user.id ?? null} />;
  return <LearningCanvas canvasId={canvasId} openingAsk={ask} />;
}

export default function LearnPage() {
  return (
    <Suspense fallback={<main className="h-full bg-(--ui-bg-editor)" />}>
      <LearnSurface />
    </Suspense>
  );
}
