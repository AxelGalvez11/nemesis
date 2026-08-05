"use client";

// The reader, wired to a filed Library source: /library/source/<id>
//
// This is the piece that knows about the Library — which row the id belongs to,
// which notes cite it, where "back" goes. The reader itself knows none of that,
// which is what lets the same component serve the chat popup.

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

import { DocumentReader, type LinkedNote } from "./document-reader";

export function LibrarySourceReader({ sourceId }: { sourceId: string }) {
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
    return <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening…</div>;
  }

  if (!readerSource) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <EmptyState description="It may have been removed, or its link is out of date." title="That file isn't here" />
        <Button onClick={() => router.push("/library")} size="sm" variant="secondary">
          Go to Library
        </Button>
      </div>
    );
  }

  return (
    <DocumentReader
      anchor={anchor}
      linkedNotes={linkedNotes}
      onBack={() => router.push("/library")}
      onOpenNote={(path) => router.push(`/library?note=${encodeURIComponent(path)}`)}
      onSendToChat={sendToChat}
      source={readerSource}
    />
  );
}
