"use client";

// DEV-ONLY PREVIEW — the document reader in its real composition, without the
// auth gate: the Library page in source mode, so the Library's left sidebar is
// present exactly as a signed-in student sees it.
//
// ?source=<fixture id> picks the file; ?page= and ?q= work here the same way
// they do on a real document, which is what makes citation anchoring testable.
//
// The query string is read off `window` after mount rather than through
// `useSearchParams`, following the convention the workspace preview harness
// already set: it keeps this page prerenderable with no Suspense boundary.
// 🔴 That is not a style preference — a Suspense boundary here left the whole
// subtree unhydrated, so the reader sat on "Opening…" with no effects running.

import { useEffect, useState } from "react";

import { LibraryDocsPage } from "@/components/workspace/library-v2/library-docs-page";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { PREVIEW_LIBRARY_SOURCES } from "@/lib/workspace/library-sources";

export default function ReaderPreviewPage() {
  const [sourceId, setSourceId] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("source");
    const known = PREVIEW_LIBRARY_SOURCES.some((entry) => entry.id === requested);
    setSourceId(known && requested ? requested : (PREVIEW_LIBRARY_SOURCES[0]?.id ?? ""));
  }, []);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        {sourceId === null ? (
          <div className="grid h-full place-items-center text-xs">Opening…</div>
        ) : (
          <LibraryDocsPage sourceId={sourceId} />
        )}
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
