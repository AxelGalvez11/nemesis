"use client";

// Notebooks workspace — switches between the full-width list (no notebook selected) and the Claude-
// style detail (chat center + right rail). State-driven off the shared store's selectedId; the
// detail's breadcrumb clears the selection to return to the list.

import { NotebookDetail } from "./notebook-detail";
import { NotebooksLanding } from "./notebooks-landing";
import { useNotebooks } from "./notebooks-store";

export function NotebooksWorkspace() {
  const { selectedId } = useNotebooks();
  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-(--ui-bg-editor)">
      {selectedId ? <NotebookDetail /> : <NotebooksLanding />}
    </div>
  );
}
