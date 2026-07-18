"use client";

// Library folder-tree sidebar — desktop src/app/library/index.tsx LibraryView
// aside, v1 empty-vault anatomy (library-study spec §2.2/§2.3). No real vault
// data yet (cloud sync isn't live): counts are fixed at zero and the three
// header actions are inert placeholders explained by a shared tooltip.

import { IconFilePlus, IconFolderPlus, IconLayoutSidebarLeftCollapse } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { SearchField } from "@/components/desktop-ui/search-field";
import { Tip } from "@/components/desktop-ui/tooltip";

import { LibraryTreeBlankState } from "./library-tree-blank-state";

const INERT_TIP = "Notes live on your Mac until cloud sync ships";

const HEADER_ACTIONS = [
  { label: "New note", icon: IconFilePlus },
  { label: "New folder", icon: IconFolderPlus },
  { label: "Hide file list", icon: IconLayoutSidebarLeftCollapse },
];

export function LibrarySidebar() {
  const [query, setQuery] = useState("");

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Library</h1>
          <p className="mt-0.5 text-[0.65rem] font-medium tabular-nums text-(--ui-text-tertiary)">
            0 notes · 0 files
          </p>
        </div>
        <div className="flex gap-0.5">
          {HEADER_ACTIONS.map(({ label, icon: Icon }) => (
            <Tip key={label} label={INERT_TIP}>
              <Button aria-label={label} size="icon-xs" type="button" variant="ghost">
                <Icon />
              </Button>
            </Tip>
          ))}
        </div>
      </div>

      <div className="mx-3">
        <SearchField
          aria-label="Search notes"
          containerClassName="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2 opacity-100"
          onChange={setQuery}
          placeholder="Search notes…"
          value={query}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <LibraryTreeBlankState />
      </div>
    </aside>
  );
}
