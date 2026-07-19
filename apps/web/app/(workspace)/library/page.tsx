// Library page — desktop src/app/library/index.tsx LibraryView root, v1
// empty-vault anatomy (library-study spec §2.2). Sidebar + main only: no tab
// strip; creation/editing/linking now ride the readable cloud Library.

"use client";

import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { LibraryMain } from "@/components/workspace/library/library-main";
import { LibrarySidebar } from "@/components/workspace/library/library-sidebar";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";

export default function LibraryPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchParams = useSearchParams();
  const { notes, select } = useCloudLibrary();
  const requestedPath = searchParams.get("note");

  useEffect(() => {
    if (requestedPath && notes.some((note) => note.path === requestedPath)) select(requestedPath);
  }, [notes, requestedPath, select]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      {sidebarOpen ? (
        <LibrarySidebar onCollapse={() => setSidebarOpen(false)} />
      ) : (
        <aside className="flex w-10 shrink-0 justify-center border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-2">
          <Button aria-label="Expand Library sidebar" onClick={() => setSidebarOpen(true)} size="icon-xs" variant="ghost">
            <IconLayoutSidebarLeftExpand />
          </Button>
        </aside>
      )}
      <LibraryMain />
    </div>
  );
}
