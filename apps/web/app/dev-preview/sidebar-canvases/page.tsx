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

export default function SidebarCanvasesPreview() {
  return (
    <main className="flex min-h-screen items-start gap-10 p-10" data-workspace="">
      <div className="h-[560px] w-64 overflow-hidden rounded-xl border border-(--ui-stroke-secondary)">
        <Sidebar className="h-full">
          <SidebarContent className="gap-0 px-[var(--nav-row-inset)] pt-2">
            <SidebarCanvases seed={{ canvases: CANVASES, folders: FOLDERS }} />
          </SidebarContent>
        </Sidebar>
      </div>
      <p className="max-w-sm text-sm text-(--ui-text-secondary)">
        Pinned first, then folders, then recents. The mortar-board marks a canvas that carries a
        course. Kebab menus rename, pin, file and delete through the same store the app uses —
        here they act on seeded rows, so changes reset on reload.
      </p>
    </main>
  );
}
