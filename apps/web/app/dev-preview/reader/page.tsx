"use client";

// DEV-ONLY PREVIEW — the document reader, without the auth gate.
//
// Opens the fixture PDF in public/ through the exact component the real route
// mounts, so the reader can be checked (and screenshotted) with no account and
// no stored file. ?source=<fixture id> picks which fixture; ?page= and ?q= work
// here the same way they do on a real document, which is what makes citation
// anchoring testable at all.
//
// The query string is read off `window` after mount rather than through
// `useSearchParams`, following the convention the workspace preview harness
// already set: it keeps this page prerenderable with no Suspense boundary.

import { useEffect, useMemo, useState } from "react";

import { DocumentReader } from "@/components/workspace/reader/document-reader";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { NO_ANCHOR, parseReaderAnchor, type ReaderAnchor } from "@/lib/reader/reader-anchor";
import { readerSourceFromLibrary } from "@/lib/reader/reader-source";
import { PREVIEW_LIBRARY_SOURCES } from "@/lib/workspace/library-sources";

export default function ReaderPreviewPage() {
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => setSearch(window.location.search), []);

  const params = useMemo(() => new URLSearchParams(search ?? ""), [search]);
  const source = useMemo(() => {
    const requested = params.get("source");
    const row = PREVIEW_LIBRARY_SOURCES.find((entry) => entry.id === requested) ?? PREVIEW_LIBRARY_SOURCES[0];
    return row ? readerSourceFromLibrary(row) : null;
  }, [params]);
  const anchor: ReaderAnchor = useMemo(() => (search === null ? NO_ANCHOR : parseReaderAnchor(params)), [params, search]);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        {source === null || search === null ? (
          <div className="grid h-full place-items-center text-xs">Opening…</div>
        ) : (
          <DocumentReader
            anchor={anchor}
            linkedNotes={[
              { id: "preview-note-1", title: "Commerce power — the three tests", path: "Constitutional law/Commerce power.md" },
            ]}
            onSendToChat={(prompt, files) => window.alert(`Would send to chat, with ${files.length} attachment(s):\n\n${prompt}`)}
            source={source}
          />
        )}
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
