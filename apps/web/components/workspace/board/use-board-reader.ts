"use client";

// Resolving a dropped file into something the document reader can open.
//
// 🔴🔴 ONE RESOLUTION, TWO CALLERS, AND IT USED TO BE INLINE IN THE PANEL. The rule it encodes is
// the whole of the owner's report on 2026-09-04 ("pdfs, docx, pptx still cannot be seen in the
// canvas, they only render text"): when the drop was FILED, the original is in the Library and the
// reader must be given that, so a PDF is pages and a deck is slides. Only when there is no filed
// row does the extracted text stand in. The card no longer says so in a sentence above the
// document (owner, 2026-09-04: *"remove this line"*); what says it is the NAME, since
// `extractedTextFileName` calls a reconstruction "Lecture 9.md" and never "Lecture 9.pdf".
//
// 🔴 THE HARNESS MAKES NO NETWORK CALLS. `/dev-preview/board` signs a mock session, so `uid` is
// set, so a library lookup went to the database, found nothing under a fixture id, and the one
// screen this is reviewed on showed an error. `useWorkspacePreview()` is how every other board
// component knows it is in the harness.

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import type { BoardSource } from "@/lib/board/board-model";
import type { ReaderSource } from "@/lib/reader/reader-source";
import { loadLibrarySource } from "@/lib/workspace/library-sources";

import { boardReaderSource, filedIdOf, filedReaderSource } from "./board-reader-source";

export type BoardReaderState =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "ready"; readonly source: ReaderSource };

const NOTHING_READ = "Nemesis could not read any text out of this source, so there is nothing to show here yet.";

/**
 * The document behind a board source, resolved once per source.
 *
 * Runs only when `enabled`, so a collapsed or still-processing card costs nothing: a board holding
 * thirty documents must not fetch thirty Library rows to draw thirty title bars.
 */
export function useBoardReader(source: BoardSource | undefined, enabled: boolean): BoardReaderState {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const preview = useWorkspacePreview() !== null;
  const [state, setState] = useState<BoardReaderState>({ kind: "loading" });
  const id = source?.id ?? null;
  const filed = source ? filedIdOf(source) : null;
  const length = source?.content.length ?? 0;

  useEffect(() => {
    if (!enabled || !id || !source) return;
    let live = true;
    const put = (next: BoardReaderState) => {
      if (live) setState(next);
    };
    put({ kind: "loading" });
    void (async () => {
      // The ORIGINAL file first, whenever the drop was filed: real pages, real slides, real layout.
      if (filed) {
        const row = await loadLibrarySource(uid, filed, { preview });
        if (row) {
          put({ kind: "ready", source: filedReaderSource(row) });
          return;
        }
      }
      const reader = boardReaderSource(source);
      if (!reader) {
        put({ kind: "unavailable", reason: NOTHING_READ });
        return;
      }
      put({ kind: "ready", source: reader });
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the source's identity, not its object
  }, [enabled, filed, id, length, preview, uid]);

  return enabled ? state : { kind: "loading" };
}
