// Library — the docs-style study wiki (owner 2026-08-03). Left: the folder
// tree. Middle: the open note as a rendered article, or the home page.
// Right: "On this page". The previous screen lives on at /library/classic.

"use client";

import { RetiredSurfaceGuard } from "@/components/workspace/retired-surface-guard";
import { LibraryDocsPage } from "@/components/workspace/library-v2/library-docs-page";

function LibraryPageSurface() {
  return <LibraryDocsPage />;
}

// RETIRED SURFACE. A bare visit goes to the Canvas home; a link carrying parameters is a caller
// asking for something specific and is still served. See retired-surface-guard.tsx for the list
// of callers this protects.
export default function LibraryPage() {
  return (
    <RetiredSurfaceGuard>
      <LibraryPageSurface />
    </RetiredSurfaceGuard>
  );
}
