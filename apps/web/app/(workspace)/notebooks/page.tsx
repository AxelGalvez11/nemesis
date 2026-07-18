// Notebooks page — NotebookLM-style workspaces: sources + instructions + scoped chats. Two-pane
// (list + detail), same shell auth gate as the other workspace pages (app/(workspace)/layout.tsx).

import { NotebooksMain } from "@/components/workspace/notebooks/notebooks-main";
import { NotebooksSidebar } from "@/components/workspace/notebooks/notebooks-sidebar";

export default function NotebooksPage() {
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <NotebooksSidebar />
      <NotebooksMain />
    </div>
  );
}
