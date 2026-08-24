"use client";

// DEV-ONLY PREVIEW — the sidebar's canvas list, populated. Same convention as the other
// dev-preview routes; exists because local dev is signed into an unreachable cloud, so the
// real sidebar can only ever show its empty state here.

import { SidebarCanvases } from "@/components/workspace/shell/sidebar-canvases";
import { Sidebar, SidebarContent } from "@/components/workspace/shell/sidebar-primitives";
import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

const FOLDERS: Folder[] = [
  { id: "f-bio", name: "Biology", parentId: null },
  { id: "f-law", name: "Law school", parentId: null },
  { id: "f-tort", name: "Torts", parentId: "f-law" },
];

const CANVASES: CanvasSummary[] = [
  { id: "c1", title: "Finals cram plan", state: "learn", updatedAt: ago(1), pinnedAt: ago(5), folderId: null },
  { id: "c2", title: "Cell respiration deep-dive", state: "learn", updatedAt: ago(2), folderId: "f-bio", courseTitle: "AP Biology" },
  { id: "c3", title: "Krebs cycle questions", state: "learn", updatedAt: ago(30), folderId: "f-bio" },
  { id: "c4", title: "Consideration doctrine", state: "learn", updatedAt: ago(50), folderId: "f-tort" },
  { id: "c5", title: "Thermo problem set 4", state: "learn", updatedAt: ago(3), folderId: null },
  { id: "c6", title: "Spanish subjunctive drills", state: "learn", updatedAt: ago(70), folderId: null, courseTitle: "Spanish II" },
];

// 🔴 THE SECOND AND THIRD SEEDS ARE THE POINT OF THIS PAGE NOW. The list draws three named
// groups, and two of the three are conditional — so the interesting states are the SPARSE ones,
// which the populated seed can never show. A new account has nothing pinned and no folders; an
// organised one has everything filed and no loose canvases. Both were code nobody could look at.
const SPARSE: CanvasSummary[] = [
  { id: "s1", title: "Intro to statistics", state: "learn", updatedAt: ago(2), folderId: null },
];

const ALL_FILED: CanvasSummary[] = [
  { id: "a1", title: "Finals cram plan", state: "learn", updatedAt: ago(1), pinnedAt: ago(5), folderId: null },
  { id: "a2", title: "Cell respiration deep-dive", state: "learn", updatedAt: ago(2), folderId: "f-bio" },
];

function Panel({ canvases, folders, title }: { canvases: CanvasSummary[]; folders: Folder[]; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-(--ui-text-tertiary)">{title}</p>
      <div className="h-[420px] w-64 overflow-hidden rounded-xl border border-(--ui-stroke-secondary)">
        <Sidebar className="h-full">
          <SidebarContent className="gap-0 px-[var(--nav-row-inset)] pt-2">
            <SidebarCanvases seed={{ canvases, folders }} />
          </SidebarContent>
        </Sidebar>
      </div>
    </div>
  );
}

export default function SidebarCanvasesPreview() {
  return (
    <main className="min-h-screen p-10" data-workspace="">
      <p className="mb-6 max-w-2xl text-sm text-(--ui-text-secondary)">
        Pinned, then Folders, then Canvases — each under its own quiet label, matching how ChatGPT
        groups Pinned / Projects / Chats. The mortar-board marks a canvas that carries a course.
        Kebab menus rename, pin, file and delete through the same store the app uses; here they act
        on seeded rows, so changes reset on reload.
      </p>
      <div className="flex flex-wrap items-start gap-8">
        <Panel canvases={CANVASES} folders={FOLDERS} title="Populated — all three groups" />
        <Panel canvases={SPARSE} folders={[]} title="New account — no pins, no folders" />
        <Panel canvases={ALL_FILED} folders={[FOLDERS[0]!]} title="All filed — no loose canvases" />
        <Panel canvases={[]} folders={[]} title="Empty" />
      </div>
    </main>
  );
}
