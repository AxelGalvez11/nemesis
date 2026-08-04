"use client";

// Source FILES for the docs-style Library — the owner's 2026-08-03 design:
// "source files live inside the same Library, but in their own 'Sources' area
// under each course or topic … Notes = organized knowledge, Sources = original
// uploaded material", kept visibly separate so notes never mix with raw files.
//
// This module is the READ side. It is backed by a `library_sources` table and
// a private `library-sources` storage bucket, NEITHER OF WHICH EXISTS YET —
// they are the two owner-approved migrations tracked as the file-storage task.
// Until they land, loadLibrarySources returns [] for signed-in users (the
// query errors quietly) and the preview fixtures below carry the design for
// the signed-out demo and the dev-preview harness. The moment the migrations
// exist, imports start uploading originals and this module lights up with no
// further code changes.
//
// Expected table shape (mirrors readable_library_documents conventions):
//   id uuid pk · user_id uuid · folder_path text · file_name text ·
//   mime_type text · size_bytes bigint · storage_path text ·
//   created_at timestamptz · deleted boolean
// Bucket keys follow the library-images pattern: `<user_id>/<uuid>.<ext>`,
// owner-only RLS, opened via short-lived signed URLs minted client-side.

import { supabase } from "@/lib/supabase";

export type LibrarySourceKind = "pdf" | "slides" | "document" | "image" | "audio" | "file";

export interface LibrarySource {
  id: string;
  /** Slash-joined folder the file is filed under ("" = Library root). */
  folderPath: string;
  fileName: string;
  kind: LibrarySourceKind;
  sizeBytes: number | null;
  createdAt: string;
  /** Bucket key for the original bytes; null when nothing is stored (fixtures,
   *  or rows written before storage existed). Null = viewer shows metadata
   *  and says the original isn't kept, instead of a broken embed. */
  storagePath: string | null;
}

const KIND_META: Record<LibrarySourceKind, { label: string; icon: string }> = {
  pdf: { label: "PDF", icon: "file-pdf" },
  slides: { label: "Slides", icon: "file-media" },
  document: { label: "Document", icon: "file" },
  image: { label: "Image", icon: "file-media" },
  audio: { label: "Recording", icon: "mic" },
  file: { label: "File", icon: "file" },
};

export function librarySourceKindLabel(kind: LibrarySourceKind): string {
  return KIND_META[kind].label;
}

export function librarySourceKindIcon(kind: LibrarySourceKind): string {
  return KIND_META[kind].icon;
}

/** Judge a file's kind from its extension — the display grouping only, never
 *  a gate (unknown extensions are still stored and listed, as plain files). */
export function librarySourceKind(fileName: string): LibrarySourceKind {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (extension === "pdf") return "pdf";
  if (extension === "ppt" || extension === "pptx" || extension === "key") return "slides";
  if (extension === "doc" || extension === "docx" || extension === "rtf" || extension === "odt") return "document";
  if (["png", "jpg", "jpeg", "webp", "heic", "heif", "gif"].includes(extension)) return "image";
  if (["mp3", "m4a", "wav", "aac", "ogg", "flac"].includes(extension)) return "audio";
  return "file";
}

/** "2.4 MB" / "312 KB" — null in, null out (size is optional on old rows). */
export function formatSourceSize(sizeBytes: number | null): string | null {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

/** Sources filed DIRECTLY under one folder (subfolders list their own). */
export function sourcesInFolder(sources: readonly LibrarySource[], folderPath: string): LibrarySource[] {
  const target = folderPath.split("/").map((segment) => segment.trim()).filter(Boolean).join("/");
  return sources.filter((source) => source.folderPath === target);
}

// Fixture ids are referenced by library-provenance.ts PREVIEW_SOURCES rows
// (source_id), so in the signed-out demo clicking a note's source pill opens
// the matching file page — the full loop the owner described. Field-agnostic,
// aligned with the PREVIEW_NOTES folder paths in library-cloud-store.ts.
export const PREVIEW_LIBRARY_SOURCES: LibrarySource[] = [
  {
    id: "preview-src-conlaw-slides",
    folderPath: "Constitutional law/Commerce power",
    fileName: "Con Law – Week 4 slides.pdf",
    kind: "pdf",
    sizeBytes: 2_460_000,
    createdAt: "2026-07-28T15:04:00.000Z",
    storagePath: null,
  },
  {
    id: "preview-src-conlaw-recording",
    folderPath: "Constitutional law/Commerce power",
    fileName: "Lecture 9 — commerce power.m4a",
    kind: "audio",
    sizeBytes: 11_800_000,
    createdAt: "2026-07-29T18:40:00.000Z",
    storagePath: null,
  },
  {
    id: "preview-src-mech-ch6",
    folderPath: "Structural engineering/Mechanics",
    fileName: "Mechanics of Materials Ch6.pdf",
    kind: "pdf",
    sizeBytes: 8_120_000,
    createdAt: "2026-07-25T09:12:00.000Z",
    storagePath: null,
  },
];

interface SourceRow {
  id: string;
  folder_path: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
}

function rowToLibrarySource(row: SourceRow): LibrarySource {
  return {
    id: row.id,
    folderPath: row.folder_path ?? "",
    fileName: row.file_name,
    kind: librarySourceKind(row.file_name),
    sizeBytes: typeof row.size_bytes === "number" && Number.isFinite(row.size_bytes) ? row.size_bytes : null,
    createdAt: row.created_at,
    storagePath: row.storage_path,
  };
}

/** Every source file the user has, newest first. No uid = the signed-out /
 *  dev-preview demo, which gets the fixtures. Errors (including "table does
 *  not exist yet") degrade to an empty list — the truthful state today. */
export async function loadLibrarySources(uid: string | null): Promise<LibrarySource[]> {
  if (!uid) return PREVIEW_LIBRARY_SOURCES;
  try {
    const { data, error } = await supabase
      .from("library_sources")
      .select("id,folder_path,file_name,mime_type,size_bytes,storage_path,created_at")
      .eq("user_id", uid)
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (data as SourceRow[]).map(rowToLibrarySource);
  } catch {
    return [];
  }
}

/** Short-lived signed URL for the original bytes, or null when nothing is
 *  stored / the bucket doesn't exist yet. The viewer treats null as "explain,
 *  don't embed". */
export async function librarySourceUrl(source: LibrarySource): Promise<string | null> {
  if (!source.storagePath) return null;
  try {
    const { data, error } = await supabase.storage.from("library-sources").createSignedUrl(source.storagePath, 3600);
    return error || !data ? null : data.signedUrl;
  } catch {
    return null;
  }
}
