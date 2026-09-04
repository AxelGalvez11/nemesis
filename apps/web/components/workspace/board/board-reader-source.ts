"use client";

// A board source, as the document reader sees it.
//
// 🔴🔴 THERE IS ONE DOCUMENT READER AND THIS FILE DOES NOT BECOME A SECOND ONE. `document-reader.tsx`
// already opens every format the product supports — PDF, slides, Word, spreadsheets, pictures,
// Markdown, text, HTML — and `reader-source.ts` is the shape it reads them through. All that is
// missing for the board is the translation, because a board source is stored differently from a
// filed Library row: it is a file somebody dropped on a canvas, kept as extracted text plus, for
// pictures, an object URL that lives as long as the tab does.
//
// So there are three answers here, best first:
//
//   filed     the source has a `librarySourceId`, so the ORIGINAL file is in the Library and the
//             reader gets the real thing — real pages, real slides, boxes you can cut a picture
//             out of. Resolved by the panel, which is where the network call belongs.
//   picture   an image dropped this session. The object URL is the picture itself.
//   text      everything else: what the extractor read, laid out as a document.
//
// 🔴 THE TEXT ANSWER IS HONEST ABOUT BEING TEXT. It is named `.md` rather than keeping a `.pdf`
// extension it can no longer honour, because handing the PDF lane a file that is not a PDF renders
// a red failure page, and calling extracted text "lecture.pdf" would offer a download that is not
// the document it claims to be. The TAB still shows the learner's own file name — that comes from
// the board source, not from here.

import type { BoardSource } from "@/lib/board/board-model";
import { readerSourceFromLibrary, type ReaderSource } from "@/lib/reader/reader-source";
import type { LibrarySource } from "@/lib/workspace/library-sources";

/**
 * The durable `library_sources.id` behind a board source, when there is one.
 *
 * 🔴 IT COMES OFF `grounded`, WHICH IS THE ONE PLACE THAT KNOWS. `BoardSource.grounded` is the
 * chat-shaped view the ingestion lane builds (see board-model.ts), and reading the filed id from
 * anywhere else would be a second answer to "is this document kept". Absent on a source dropped
 * before grounding existed, and absent means "no original to open", never "not filed anywhere".
 */
export function filedIdOf(source: BoardSource): string | null {
  const id = source.grounded?.librarySourceId;
  return typeof id === "string" && id.trim() ? id : null;
}

/**
 * One blob URL per source, made on demand.
 *
 * 🔴 CACHED, BECAUSE `resolveUrl` IS CALLED EVERY TIME A TAB IS OPENED. Minting a fresh object URL
 * per open and never revoking it leaks one buffer per glance at the same document; keyed by the id
 * and the text's length, a re-parse that changed the content still gets a fresh one.
 */
const textUrls = new Map<string, string>();

function textUrl(source: BoardSource): string | null {
  if (typeof URL === "undefined" || typeof Blob === "undefined") return null;
  const key = `${source.id}:${source.content.length}`;
  const held = textUrls.get(key);
  if (held) return held;
  const made = URL.createObjectURL(new Blob([source.content], { type: "text/markdown" }));
  textUrls.set(key, made);
  return made;
}

/** Test/harness hook: forget every minted URL. */
export function resetBoardReaderUrls(): void {
  for (const url of textUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Already gone, or no URL API. Either way there is nothing to release.
    }
  }
  textUrls.clear();
}

const TEXTUAL = /\.(?:md|markdown|txt|text)$/i;

/** "Lecture 9.pdf" -> "Lecture 9.md". A name that already reads as text keeps it. */
export function extractedTextFileName(name: string): string {
  const trimmed = name.trim() || "Source";
  if (TEXTUAL.test(trimmed)) return trimmed;
  const dot = trimmed.lastIndexOf(".");
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${stem}.md`;
}

/**
 * The reader's view of a board source that has no filed original: the picture when there is one,
 * otherwise the text the extractor read.
 *
 * Returns null when there is nothing at all to show — a source still being read, or one whose
 * extraction failed and left no words behind.
 */
export function boardReaderSource(source: BoardSource): ReaderSource | null {
  const picture = source.type === "image" ? source.previewUrls[0] : undefined;
  if (picture) {
    return {
      coverage: null,
      createdAt: null,
      fileName: source.name,
      folderPath: "",
      id: source.id,
      kind: "image",
      mime: null,
      resolveUrl: async () => picture,
      sizeBytes: null,
    };
  }
  if (!source.content.trim()) return null;
  const url = textUrl(source);
  if (!url) return null;
  return {
    coverage: null,
    createdAt: null,
    fileName: extractedTextFileName(source.name),
    folderPath: "",
    id: source.id,
    kind: "document",
    mime: "text/markdown",
    resolveUrl: async () => url,
    sizeBytes: new TextEncoder().encode(source.content).byteLength,
  };
}

/** The filed original, when the board source names one and the row came back. */
export function filedReaderSource(row: LibrarySource): ReaderSource {
  // 🔴 THE LIBRARY'S OWN PROJECTION, NOT A SECOND READING OF THE FILENAME — the same reason
  // `source-preview.tsx` gives: building a `ReaderSource` by hand here would be a second opinion
  // about what kind a file is, free to disagree with the page next door.
  return readerSourceFromLibrary(row);
}

/**
 * Whether what the reader is showing is the ORIGINAL file or Nemesis's reading of it.
 *
 * 🔴 SAID OUT LOUD IN THE PANEL, never inferred by the learner from a layout that looks a bit
 * plain. The product's standing rule is that a reconstruction never quietly stands in for the
 * original (`reading-view.tsx` carries the same banner for the same reason).
 */
export function isExtractedText(source: BoardSource): boolean {
  return filedIdOf(source) === null && !(source.type === "image" && Boolean(source.previewUrls[0]));
}
