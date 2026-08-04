// The pre-docs Library, kept reachable but out of the nav (standing rule:
// remove the control, not the feature). /library is the docs-style Library
// now; this page is the old sidebar + tab-strip screen, unchanged, for
// anything the new surface doesn't cover yet. Its internal links stay on
// /library/classic via libraryRouteBase.

"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useTheme } from "@/components/theme-provider";
import { LibraryMain } from "@/components/workspace/library/library-main";
import { LibrarySidebar } from "@/components/workspace/library/library-sidebar";
import { useMediaQuery } from "@/components/workspace/shell/use-media-query";
import { useResponsiveSidebar } from "@/components/workspace/shell/use-responsive-sidebar";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { cn } from "@/lib/utils";

export default function LibraryClassicPage() {
  const { libraryFullScreen } = useTheme();
  const narrowViewport = useMediaQuery("(max-width: 768px)");
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useResponsiveSidebar(narrowViewport, "nemesis.web.library-sidebar");
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
    <div className="relative flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      {sidebarOpen && (
        <>
          {narrowViewport && <button aria-label="Close Library sidebar" className="absolute inset-0 z-30 bg-black/25" onClick={() => setSidebarOpen(false)} type="button" />}
          <div className={cn(narrowViewport ? "absolute inset-y-0 left-0 z-40 shadow-2xl" : "contents")}>
            <LibrarySidebar
              onNavigate={() => narrowViewport && setSidebarOpen(false)}
              showBack={libraryFullScreen && !narrowViewport}
            />
          </div>
        </>
      )}
      <LibraryMain
        leftSidebarOpen={sidebarOpen}
        onCollapseLeft={() => setSidebarOpen(false)}
        onExpandLeft={() => setSidebarOpen(true)}
      />
    </div>
  );
}
