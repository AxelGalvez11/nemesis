// Library page — desktop src/app/library/index.tsx LibraryView root, v1
// empty-vault anatomy (library-study spec §2.2). Sidebar + main only: no tab
// strip, no right rail, no CodeMirror until cloud sync ships.

import { LibraryMain } from "@/components/workspace/library/library-main";
import { LibrarySidebar } from "@/components/workspace/library/library-sidebar";

export default function LibraryPage() {
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-(--ui-editor-surface-background)">
      <LibrarySidebar />
      <LibraryMain />
    </div>
  );
}
