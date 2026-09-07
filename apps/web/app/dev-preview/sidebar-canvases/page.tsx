"use client";

// DEV-ONLY PREVIEW — the sidebar's list of canvases, populated.
//
// 🔴 THIS PREVIEWED THE CHAT LIST UNTIL 2026-09-07. It seeded three named groups (Pinned /
// Projects / Chats) and drew three panels side by side, because two of the three sections were
// conditional and the sparse states were the ones nobody could otherwise look at. Owner that day:
// *"remove 'chats' from the left sidebar"*, after *"pretty much no more projects"* the message
// before. There is one list now and one interesting empty state, so there is one panel.
//
// Exists because local dev is signed into an unreachable cloud, so the real sidebar can only ever
// show its empty state here.

import { SidebarCanvases } from "@/components/workspace/shell/sidebar-canvases";
import { Sidebar, SidebarContent } from "@/components/workspace/shell/sidebar-primitives";
import type { BoardSummary } from "@/lib/board/board-store";

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

const BOARDS: BoardSummary[] = [
  { id: "b1", title: "Finals cram plan", updatedAt: ago(1) },
  { id: "b2", title: "Cell respiration deep-dive", updatedAt: ago(2) },
  { id: "b3", title: "Krebs cycle questions", updatedAt: ago(30) },
  { id: "b4", title: "Consideration doctrine", updatedAt: ago(50) },
  { id: "b5", title: "Thermo problem set 4", updatedAt: ago(3) },
  { id: "b6", title: "Spanish subjunctive drills", updatedAt: ago(70) },
];

function Panel({ boards, title }: { boards: BoardSummary[]; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-(--ui-text-tertiary)">{title}</p>
      <div className="h-[420px] w-64 overflow-hidden rounded-xl border border-(--ui-stroke-secondary)">
        <Sidebar className="h-full">
          <SidebarContent className="gap-0 px-[var(--nav-row-inset)] pt-2">
            <SidebarCanvases seed={boards} />
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
        One flat list of canvases, most recently worked on first. The header carries the only way to
        make a first one, which is why it shows even when the list is empty.
      </p>
      <div className="flex flex-wrap gap-8">
        <Panel boards={BOARDS} title="A learner with six canvases" />
        <Panel boards={BOARDS.slice(0, 1)} title="A learner with one" />
        <Panel boards={[]} title="A new account" />
      </div>
    </main>
  );
}
