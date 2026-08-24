// Library — the home of OUTPUTS (owner 2026-08-25).
//
// Third meaning for this route, each by owner decision: files → canvases (§L, 2026-08-13) →
// what Nemesis has made (2026-08-25, the same day the canvases moved to the sidebar with
// their folders). The canvas manager is not deleted — /dev-preview/library still renders it.
//
// 🔴 ITS PRIMARY OBJECTS WERE CANVASES, NOT FILES. The two-surface retirement removed Library as a
// file manager; §L reinstates it as a different object — the place a learner finds and organises
// what they have learned. The docs-style file surface it used to render still exists untouched at
// `/library/classic`, and `library-v2/library-docs-page.tsx` is not deleted.
//
// 🔴 REMOVING THE REDIRECT STRENGTHENED THE EXTENSION CONDITION RATHER THAN THREATENING IT, and
// this route must keep both halves of that true. The shipped browser extension opens
// `/library?import=coursework` (`extension/src/content-scan.ts:33`), and `CourseworkImportGate` —
// mounted at the `(workspace)` LAYOUT, not here — fires on the mere presence of a param named
// `import`. So:
//
//   (a) the query string must reach the browser intact, with no redirect that drops it.
//       There is still NO redirect on this route.
//   (b) the route must stay inside `(workspace)` so the gate still mounts. It has not moved.
//
// A `redirect()`, a middleware rule, or a move out of `(workspace)` would make "Send to Nemesis"
// open a tab that silently never shows the import wizard — no error, no fallback. A shipped
// client cannot be updated by this repo.

"use client";

import { useAuth } from "@/components/AuthProvider";
import { LibraryOutputs } from "@/components/workspace/library/library-outputs";

export default function LibraryPage() {
  const { session } = useAuth();
  return <LibraryOutputs userId={session?.user.id ?? null} />;
}
