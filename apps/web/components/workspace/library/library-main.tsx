"use client";

// Library main pane — desktop src/app/library/index.tsx "no tab selected"
// branch, v1: no tab strip, no rail, no CodeMirror (library-study spec §2.11).

import { EmptyState } from "@/components/desktop-ui/empty-state";

export function LibraryMain() {
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-editor)">
      <EmptyState description="Pick a note on the left, or start a fresh one." title="No note open" />
    </main>
  );
}
