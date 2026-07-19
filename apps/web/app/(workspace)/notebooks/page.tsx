// Notebooks page — NotebookLM-style workspaces: a full-width list, and a Claude-style detail (chat
// center + right rail) when one is open. Same shell auth gate as the other workspace pages
// (app/(workspace)/layout.tsx).

import { NotebooksWorkspace } from "@/components/workspace/notebooks/notebooks-workspace";

export default function NotebooksPage() {
  return <NotebooksWorkspace />;
}
