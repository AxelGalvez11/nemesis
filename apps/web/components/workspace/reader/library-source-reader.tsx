"use client";

// The reader, wired to a filed Library source.
//
// Mounted by LibraryDocsPage in its main column, so the Library's own left
// sidebar stays exactly where it was and a document opens without losing the
// tree it was filed in (owner 2026-08-05: "left sidebar is reserved for library
// sidebar"). This piece is the part that knows about the Library — which row
// the id belongs to, which notes cite it, where "back" goes. The reader itself
// knows none of that, which is what lets the same component serve the chat
// popup.

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { seedChatIntent } from "@/lib/workspace/composer-seed";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { loadNoteIdsForSource } from "@/lib/workspace/library-provenance";
import { loadLibrarySources, type LibrarySource } from "@/lib/workspace/library-sources";
import { parseReaderAnchor } from "@/lib/reader/reader-anchor";
import { readerSourceFromLibrary } from "@/lib/reader/reader-source";
import { cn } from "@/lib/utils";

import { DocumentReader } from "./document-reader";
import type { LinkedNote } from "./reader-top-bar";

interface LibrarySourceReaderProps {
  sourceId: string;
  className?: string;
  /** Back out of the file — the host decides where that goes. */
  onBack?: () => void;
  onOpenNote?: (path: string) => void;
}

export function LibrarySourceReader({ sourceId, className, onBack, onOpenNote }: LibrarySourceReaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const { notes } = useCloudLibrary();

  const [sources, setSources] = useState<LibrarySource[] | null>(null);
  const [noteIds, setNoteIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadLibrarySources(uid).then((loaded) => {
      if (!cancelled) setSources(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Real provenance: the rows an import wrote when it made a note from this
  // file. Never inferred from a note's wording.
  useEffect(() => {
    let cancelled = false;
    void loadNoteIdsForSource(sourceId, { preview: uid === null }).then((ids) => {
      if (!cancelled) setNoteIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, uid]);

  const source = useMemo(() => sources?.find((row) => row.id === sourceId) ?? null, [sourceId, sources]);
  const readerSource = useMemo(() => (source ? readerSourceFromLibrary(source) : null), [source]);
  const anchor = useMemo(() => parseReaderAnchor(searchParams), [searchParams]);

  const linkedNotes: LinkedNote[] = useMemo(
    () =>
      noteIds
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .map((note) => ({ id: note.id, title: note.title, path: note.path })),
    [noteIds, notes],
  );

  const sendToChat = useCallback(
    (prompt: string, files: File[]) => {
      seedChatIntent({ files, prompt });
      router.push("/sessions");
    },
    [router],
  );

  if (sources === null) {
    return <div className={cn("grid h-full flex-1 place-items-center text-xs text-(--ui-text-tertiary)", className)}>Opening…</div>;
  }

  if (!readerSource) {
    return (
      <div className={cn("flex h-full flex-1 flex-col items-center justify-center gap-3 px-6", className)}>
        <EmptyState description="It may have been removed, or its link is out of date." title="That file isn't here" />
        {onBack && (
          <Button onClick={onBack} size="sm" variant="secondary">
            Go to Library home
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("min-h-0 min-w-0 flex-1", className)}>
      <DocumentReader
        anchor={anchor}
        linkedNotes={linkedNotes}
        onBack={onBack}
        onOpenNote={onOpenNote}
        onSendToChat={sendToChat}
        source={readerSource}
      />
    </div>
  );
}
