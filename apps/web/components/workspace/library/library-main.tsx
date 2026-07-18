"use client";

// Library main pane — desktop src/app/library/index.tsx "note open" branch, v1: read-only
// markdown render of the selected cloud note (lib/workspace/library-cloud-store.ts shares the
// fetch + selection with the sidebar). No tab strip, no rail, no CodeMirror/editing
// (library-study spec §2.11) — this slice only reads.

import { EmptyState } from "@/components/desktop-ui/empty-state";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";

export function LibraryMain() {
  const { notes, selectedPath } = useCloudLibrary();
  const note = selectedPath ? (notes.find((n) => n.path === selectedPath) ?? null) : null;

  if (!note) {
    return (
      <main className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-editor)">
        <EmptyState description="Pick a note on the left, or start a fresh one." title="No note open" />
      </main>
    );
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-(--ui-bg-editor)">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-16 pt-[calc(var(--titlebar-height)+1.5rem)]">
          <h1 className="mb-4 text-xl font-semibold tracking-tight text-foreground">{note.title}</h1>
          <AssistantMarkdown text={note.content} />
        </div>
      </div>
    </main>
  );
}
