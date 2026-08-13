// Library — the docs-style study wiki (owner 2026-08-03). Left: the folder
// tree. Middle: the open note as a rendered article, or the home page.
// Right: "On this page". The previous screen lives on at /library/classic.

"use client";

import { LibraryDocsPage } from "@/components/workspace/library-v2/library-docs-page";

// 🔴 NO LONGER A RETIRED SURFACE (§L, owner 2026-08-13). Library is a destination in the sidebar
// again, so `RetiredSurfaceGuard` had to go: it redirected a bare visit to `/learn`, which would
// have made the new nav row bounce straight back to the Canvas the moment anyone pressed it.
//
// 🔴 REMOVING THE GUARD STRENGTHENS THE EXTENSION CONDITION RATHER THAN THREATENING IT.
// The shipped browser extension opens `/library?import=coursework`
// (`extension/src/content-scan.ts:33`), and `CourseworkImportGate` — mounted at the `(workspace)`
// LAYOUT, not here — fires on the mere presence of a param named `import`. Two conditions keep it
// working, and both hold here:
//
//   (a) the query string must reach the browser intact, with no redirect that drops it.
//       There is now NO redirect on this route at all, so this is safer than the guard was.
//   (b) the route must stay inside `(workspace)` so the gate still mounts. It has not moved.
//
// Anything later added to this route must hold both. A `redirect()`, a middleware rule or a move
// out of `(workspace)` would make "Send to Nemesis" open a tab that silently never shows the
// import wizard — no error, no fallback. See #547 for the related defect that already breaks this
// for logged-out users before any of this.
//
// 🔴 STILL THE FILE-ORIENTED SURFACE. §L reinstates Library as the CANVAS manager — its primary
// objects are canvases, with folders organising canvases rather than files. That table is not
// built yet; this renders the existing docs-style surface so the destination resolves. The object
// model is the remaining §L work, tracked separately.
export default function LibraryPage() {
  return <LibraryDocsPage />;
}
