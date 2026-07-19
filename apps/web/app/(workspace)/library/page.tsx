// Library page — desktop src/app/library/index.tsx LibraryView root, v1
// empty-vault anatomy (library-study spec §2.2). Sidebar + main only: no tab
// strip; creation/editing/linking now ride the readable cloud Library.

"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LibraryMain } from "@/components/workspace/library/library-main";
import { LibrarySidebar } from "@/components/workspace/library/library-sidebar";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";

export default function LibraryPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchParams = useSearchParams();
  const { notes, select } = useCloudLibrary();
  const requestedPath = searchParams.get("note");
  const appliedRequest = useRef<string | null>(null);

  useEffect(() => {
    if (requestedPath && requestedPath !== appliedRequest.current && notes.some((note) => note.path === requestedPath)) {
      appliedRequest.current = requestedPath;
      select(requestedPath);
    }
  }, [notes, requestedPath, select]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      {sidebarOpen && <LibrarySidebar onCollapse={() => setSidebarOpen(false)} />}
      <LibraryMain leftSidebarOpen={sidebarOpen} onExpandLeft={() => setSidebarOpen(true)} />
    </div>
  );
}
