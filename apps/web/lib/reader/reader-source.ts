// What the reader needs to know about a document, independent of where the
// document came from.
//
// Two surfaces open the same reader — a filed Library source and a chat
// attachment — and they are stored differently (different tables, different
// buckets, different id shapes). Rather than teach the reader about both, each
// caller describes its document as a `ReaderSource` and hands over a function
// that produces a short-lived URL for the bytes. The reader never touches
// Supabase, never sees a bucket name, and cannot leak a storage URL into the
// page, because it only ever holds a promise for one.

import { librarySourceKind, librarySourceUrl, type LibrarySource, type LibrarySourceKind } from "@/lib/workspace/library-sources";

/** How the reader will DISPLAY a document. Narrower than the storage kind:
 *  "slides" and "document" are separate lanes because they are rendered
 *  completely differently, and everything unrecognised lands on "file", which
 *  is an honest metadata page rather than a broken viewer. */
export type ReaderKind = "pdf" | "slides" | "document" | "image" | "audio" | "file";

export interface ReaderSource {
  /** Stable identity — `library_sources.id` for a filed document. Used in the
   *  URL and in every citation that points back here. */
  id: string;
  fileName: string;
  kind: ReaderKind;
  mime: string | null;
  sizeBytes: number | null;
  /** ISO timestamp, or null when the caller doesn't track one. */
  createdAt: string | null;
  /** Slash-joined Library folder. "" = filed at the root. */
  folderPath: string;
  /** Mints a short-lived URL for the original bytes, or null when nothing is
   *  stored. Called by the reader, never by the caller. */
  resolveUrl: () => Promise<string | null>;
}

/** The course a document is filed under: the first segment of its folder path.
 *  Structural, not a lookup table — it works the same for "Contract law" and
 *  "Thermodynamics" because it never looks at the words. */
export function courseOf(folderPath: string): string | null {
  const first = folderPath.split("/").map((segment) => segment.trim()).filter(Boolean)[0];
  return first ?? null;
}

/** "Constitutional law › Commerce power" — the trail under the filename. */
export function folderTrail(folderPath: string): string[] {
  return folderPath.split("/").map((segment) => segment.trim()).filter(Boolean);
}

const EXTENSION_KINDS: Record<string, ReaderKind> = {
  pdf: "pdf",
  ppt: "slides",
  pptx: "slides",
  key: "slides",
  doc: "document",
  docx: "document",
  rtf: "document",
  odt: "document",
  md: "document",
  txt: "document",
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "avif", "bmp", "tif", "tiff"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "aac", "ogg", "flac", "opus"]);

/** Decide the display lane from the filename and, where it disagrees, the MIME
 *  type the browser reported. Extension first because a real file's extension
 *  is right far more often than a MIME type invented by an upload widget —
 *  but a missing or unknown extension defers to the MIME type rather than
 *  giving up. */
export function readerKind(fileName: string, mime?: string | null): ReaderKind {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (extension && extension !== fileName.toLocaleLowerCase()) {
    if (EXTENSION_KINDS[extension]) return EXTENSION_KINDS[extension];
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  }
  const type = (mime ?? "").toLocaleLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.includes("presentation") || type.includes("powerpoint")) return "slides";
  if (type.includes("word") || type.startsWith("text/")) return "document";
  return "file";
}

const STORAGE_TO_READER: Record<LibrarySourceKind, ReaderKind> = {
  pdf: "pdf",
  slides: "slides",
  document: "document",
  image: "image",
  audio: "audio",
  file: "file",
};

/** A filed Library source, as the reader sees it. */
export function readerSourceFromLibrary(source: LibrarySource): ReaderSource {
  return {
    id: source.id,
    fileName: source.fileName,
    kind: STORAGE_TO_READER[source.kind] ?? readerKind(source.fileName),
    mime: null,
    sizeBytes: source.sizeBytes,
    createdAt: source.createdAt,
    folderPath: source.folderPath,
    resolveUrl: () => librarySourceUrl(source),
  };
}

/** Keeps `librarySourceKind` the single authority on storage kinds — imported
 *  so a future divergence between the two tables shows up as a type error
 *  rather than as two lanes quietly disagreeing about what a .pptx is. */
export function readerKindForStoredFile(fileName: string): ReaderKind {
  return STORAGE_TO_READER[librarySourceKind(fileName)];
}

/** "2.4 MB · added 28 Jul" — the quiet line under the filename. Every part is
 *  optional, because old rows are missing pieces and inventing them would be
 *  worse than a shorter line. */
export function describeSource(source: Pick<ReaderSource, "sizeBytes" | "createdAt">, kindLabel: string): string {
  const parts = [kindLabel];
  const { sizeBytes, createdAt } = source;
  if (sizeBytes !== null && Number.isFinite(sizeBytes) && sizeBytes >= 0) {
    parts.push(
      sizeBytes >= 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : sizeBytes >= 1024
          ? `${Math.round(sizeBytes / 1024)} KB`
          : `${sizeBytes} B`,
    );
  }
  if (createdAt && Number.isFinite(Date.parse(createdAt))) {
    parts.push(`added ${new Date(Date.parse(createdAt)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`);
  }
  return parts.join(" · ");
}
