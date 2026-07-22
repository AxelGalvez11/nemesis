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
    // Page, not a card — --ui-bg-chrome (pure black in dark mode). The card
    // colour lives on the notebook cards inside, which stay lifted.
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-(--ui-bg-chrome)">
      {selectedId ? <NotebookDetail /> : <NotebooksLanding />}
    </div>
  );
}
