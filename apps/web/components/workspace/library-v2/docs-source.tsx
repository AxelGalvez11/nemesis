"use client";

// A source FILE's own page in the center pane — "Clicking a source opens the
// original PDF, PowerPoint, image, or recording in the center viewer" (owner
// 2026-08-03). PDFs, images and recordings render inline; formats a browser
// can't display (PowerPoint, Word) get an Open button. When no original is
// stored — every row today, until the file-storage migrations land — the page
// says so honestly instead of showing a broken embed.

import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import {
  formatSourceSize,
  librarySourceKindIcon,
  librarySourceKindLabel,
  librarySourceUrl,
  type LibrarySource,
} from "@/lib/workspace/library-sources";

import { DocsCrumbs } from "./docs-crumbs";

interface DocsSourceProps {
  source: LibrarySource;
  /** Notes whose provenance cites this file (may be empty). */
  notesFromSource: readonly CloudLibraryNote[];
  onOpenPath: (path: string) => void;
  /** Breadcrumb folder click — opens that folder's page (see DocsCrumbs). */
  onOpenFolder: (path: string) => void;
  /** The "Library" crumb goes to the Library home note. */
  onGoHome: () => void;
}

export function DocsSource({ source, notesFromSource, onOpenPath, onOpenFolder, onGoHome }: DocsSourceProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setUrl(null);
    void librarySourceUrl(source).then((signed) => {
      if (cancelled) return;
      setUrl(signed);
      setResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const meta = useMemo(() => {
    const added = Number.isFinite(Date.parse(source.createdAt))
      ? `added ${new Date(Date.parse(source.createdAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : null;
    return [librarySourceKindLabel(source.kind), formatSourceSize(source.sizeBytes), added].filter(Boolean).join(" · ");
  }, [source]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl min-w-0 flex-col px-8 pb-16 pt-6 max-sm:px-4">
      <header>
        <DocsCrumbs onGoHome={onGoHome} onOpenFolder={onOpenFolder} path={source.folderPath} />
        <h1 className="mt-2 flex items-center gap-2.5 text-[1.375rem] font-bold tracking-tight text-foreground">
          <Codicon className="shrink-0 text-(--ui-text-tertiary)" name={librarySourceKindIcon(source.kind)} size="1.125rem" />
          <span className="min-w-0 break-words">{source.fileName}</span>
        </h1>
        <p className="mt-1 text-xs text-(--ui-text-tertiary)">{meta}</p>
      </header>

      <div className="mt-5" data-testid="source-body">
        {resolving ? (
          <div aria-hidden className="h-64 animate-pulse rounded-xl bg-(--ui-bg-quaternary)" />
        ) : url && source.kind === "pdf" ? (
          <iframe className="h-[72vh] w-full rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)" src={url} title={source.fileName} />
        ) : url && source.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL; next/image can't optimize it
          <img alt={source.fileName} className="max-h-[72vh] max-w-full rounded-xl border border-(--ui-stroke-tertiary)" src={url} />
        ) : url && source.kind === "audio" ? (
          <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-4">
            <audio className="w-full" controls src={url} />
          </div>
        ) : url ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-5 py-6">
            <p className="text-sm text-(--ui-text-secondary)">This file type doesn&rsquo;t preview in the browser.</p>
            <a
              className="inline-flex items-center gap-1.5 rounded-md border border-(--ui-stroke-tertiary) px-3 py-1.5 text-xs font-medium text-(--ui-text-secondary) hover:border-(--ui-stroke-secondary) hover:text-foreground"
              href={url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconExternalLink size={13} /> Open the original
            </a>
          </div>
        ) : (
          <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-5 py-6">
            <p className="text-sm font-medium text-foreground">The original file isn&rsquo;t stored yet.</p>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-(--ui-text-secondary)">
              Nemesis kept the knowledge it read from this file — the notes below — but not the file itself. Once file
              storage is turned on, this page will open the original.
            </p>
          </div>
        )}
      </div>

      {notesFromSource.length > 0 && (
        <section className="mt-8" data-testid="source-notes">
          <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Notes from this file</h2>
          <div className="flex flex-wrap gap-1.5">
            {notesFromSource.map((note) => (
              <button
                className="rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:border-(--ui-stroke-secondary) hover:text-foreground"
                key={note.id}
                onClick={() => onOpenPath(note.path)}
                type="button"
              >
                {note.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
