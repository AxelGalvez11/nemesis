// Library page — desktop src/app/library/index.tsx LibraryView root, v1
// empty-vault anatomy (library-study spec §2.2). Sidebar + main only: no tab
// strip; creation/editing/linking now ride the readable cloud Library.

"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { LibraryMain } from "@/components/workspace/library/library-main";
import { LibrarySidebar } from "@/components/workspace/library/library-sidebar";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";

export default function LibraryPage() {
  const searchParams = useSearchParams();
  const { notes, select } = useCloudLibrary();
  const requestedPath = searchParams.get("note");

  useEffect(() => {
    if (requestedPath && notes.some((note) => note.path === requestedPath)) select(requestedPath);
  }, [notes, requestedPath, select]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <LibrarySidebar />
      <LibraryMain />
    </div>
  );
}
