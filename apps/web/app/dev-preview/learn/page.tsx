"use client";

// DEV-ONLY PREVIEW — the Learning Canvas in its real composition, without the auth gate.
//
// This renders the SAME LearningCanvas component /learn does, so what is verified here is the
// real surface rather than a mock of it. Model-backed steps (writing the lesson, the recall
// cards, the test, the targeted rewrite) need a signed-in account and are inert here; every
// other behaviour — the states, selection, citations, recall keys, scoring, the diagnosis —
// runs exactly as it does in production against a seeded canvas.
//
// ?seed=lesson|recall|test|diagnose|complete picks the state to open in.
//
// The query string is read off `window` after mount rather than through useSearchParams,
// following the convention the reader harness set: a Suspense boundary here left the whole
// subtree unhydrated once, and the surface sat inert with no effects running.

import { useEffect, useState } from "react";

import { LearningCanvas } from "@/components/workspace/learn/learning-canvas";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { PREVIEW_CANVASES, type PreviewSeed } from "@/lib/learn/canvas-preview-fixture";

export default function LearnPreviewPage() {
  const [canvasId, setCanvasId] = useState<string | null>(null);

  useEffect(() => {
    const requested = (new URLSearchParams(window.location.search).get("seed") ?? "lesson") as PreviewSeed;
    const canvas = PREVIEW_CANVASES[requested] ? PREVIEW_CANVASES[requested]() : PREVIEW_CANVASES.lesson();
    // Written where the store's signed-out path reads from, so the real loader picks it up —
    // no preview-only branch inside the surface itself.
    window.localStorage.setItem(`nemesis.learn.canvas.v1.${canvas.id}`, JSON.stringify(canvas));
    setCanvasId(canvas.id);
  }, []);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        {canvasId === null ? (
          <div className="grid h-full place-items-center text-xs">Opening…</div>
        ) : (
          <LearningCanvas canvasId={canvasId} />
        )}
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
