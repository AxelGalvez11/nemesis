"use client";

// Source FILES for the docs-style Library — the owner's 2026-08-03 design:
// "source files live inside the same Library, but in their own 'Sources' area
// under each course or topic … Notes = organized knowledge, Sources = original
// uploaded material", kept visibly separate so notes never mix with raw files.
//
// Backed by the `library_sources` table and the private `library-sources`
// storage bucket (supabase/migrations/20260804010000, owner-approved:
// "yes it needs to be stored so that users can click on it"). Bucket keys
// follow the library-images pattern: `<user_id>/<uuid>.<ext>`, owner-only
// RLS, opened via short-lived signed URLs minted client-side.
//
// Every write here is BEST-EFFORT: an import must never fail because the
// original couldn't be kept — worst case the student has the notes and no
// file behind them, which is exactly what they had before storage existed.
// The preview fixtures below carry the design for the signed-out demo.

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

function normalizeSourceFolder(folderPath: string): string {
  return folderPath.split("/").map((segment) => segment.trim()).filter(Boolean).join("/");
}

/** Keep the ORIGINAL file: upload the bytes and file them under a folder.
 *  Returns the stored row, or null when anything failed (bucket rejects the
 *  type/size, network, …) — callers continue without an original. If the row
 *  insert fails after the upload succeeded, the orphaned object is removed
 *  best-effort so storage doesn't accumulate unlisted bytes. */
export async function uploadLibrarySource(uid: string, file: File, folderPath: string): Promise<LibrarySource | null> {
  try {
    const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
    const key = `${uid}/${crypto.randomUUID()}${extension && extension !== file.name ? `.${extension}` : ""}`;
    const uploaded = await supabase.storage.from("library-sources").upload(key, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploaded.error) return null;
    const { data, error } = await supabase
      .from("library_sources")
      .insert({
        file_name: file.name.slice(0, 512),
        folder_path: normalizeSourceFolder(folderPath),
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: key,
        user_id: uid,
      })
      .select("id,folder_path,file_name,mime_type,size_bytes,storage_path,created_at")
      .single();
    if (error || !data) {
      await supabase.storage.from("library-sources").remove([key]);
      return null;
    }
    return rowToLibrarySource(data as SourceRow);
  } catch {
    return null;
  }
}

/** Folder maintenance: when the note tree renames/moves/deletes a folder, its
 *  source files must follow or they'd silently vanish from the tree (their
 *  folder_path would point at a folder that no longer exists). `remap` returns
 *  the new folder path, the same path for untouched rows, or null for "this
 *  folder is gone" (soft-deletes the file row; the bytes stay recoverable).
 *  Best-effort by design — folder operations never fail on source upkeep. */
export async function remapLibrarySourceFolders(
  uid: string,
  remap: (folderPath: string) => string | null,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("library_sources")
      .select("id,folder_path")
      .eq("user_id", uid)
      .eq("deleted", false)
      .limit(500);
    if (error || !data) return;
    const updates = (data as { id: string; folder_path: string | null }[])
      .map((row) => {
        const current = row.folder_path ?? "";
        const next = remap(current);
        if (next === current) return null;
        return next === null
          ? supabase.from("library_sources").update({ deleted: true }).eq("id", row.id).eq("user_id", uid)
          : supabase.from("library_sources").update({ folder_path: next }).eq("id", row.id).eq("user_id", uid);
      })
      .filter((update): update is NonNullable<typeof update> => update !== null);
    if (updates.length) await Promise.all(updates);
  } catch {
    // Folder ops must not fail on source upkeep.
  }
}
