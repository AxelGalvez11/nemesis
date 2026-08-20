"use client";

// DEV-ONLY PREVIEW — the Canvas home (the app's landing surface), without the auth gate.
//
// Signed out, `listCanvases(null)` falls back to the browser's own index, so the session list
// below the composer is populated from whatever canvases this browser has seen — which is
// exactly the path a signed-out learner gets in production.

import { useEffect, useState } from "react";

import { CanvasHome } from "@/components/workspace/learn/canvas-home";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { PREVIEW_CANVASES } from "@/lib/learn/canvas-preview-fixture";

export default function CanvasHomePreviewPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Seed a couple of sessions so the library half of the surface has something to show.
    const ids: string[] = [];
    for (const [name, build] of Object.entries(PREVIEW_CANVASES).slice(0, 3)) {
      // Every fixture builder mints the SAME id, so seeding three of them produced three rows
      // sharing one key. Re-id them here — the fixtures are for one canvas at a time and it is
      // this harness, not them, that wants a list.
      const canvas = { ...build(), id: `preview-${name}` };
      canvas.title = canvas.title || name;
      window.localStorage.setItem(`nemesis.learn.canvas.v1.${canvas.id}`, JSON.stringify(canvas));
      ids.push(canvas.id);
    }
    window.localStorage.setItem("nemesis.learn.canvases.v1", JSON.stringify(ids));
    setReady(true);
  }, []);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>{ready ? <CanvasHome userId={null} /> : null}</WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
