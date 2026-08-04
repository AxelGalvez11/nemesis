"use client";

// Source pills for the docs-style Library: where a note CAME FROM.
//
// Backed by `library_provenance` (supabase/migrations/20260729222659_second_
// brain_graph.sql) — one row per (note, origin). The table shipped with the
// second-brain migration with a SELECT-only policy and, as of 2026-08-03, has
// ZERO writers: clients cannot insert (no INSERT grant/policy) and the
// library-brain function only reads it. So today this module renders whatever
// rows exist (none in prod yet) plus the preview fixtures below; the write
// path — uploads and agent-written notes stamping their origin — arrives with
// the file-storage layer, which needs a migration the owner has to approve.
//
// `location` is a jsonb the migration documents as "page/slide/time ranges"
// without fixing a shape. THIS FILE is the shape: writers must emit one of
//   { page: 7 } | { pages: [3, 9] } | { slide: 12 } | { slides: [2, 5] }
//   { seconds: 750 } | { start_seconds: 60, end_seconds: 95 }
// and describeSourceLocation() below is the single reader.

import { supabase } from "@/lib/supabase";

export type NoteSourceKind =
  | "library_note"
  | "upload"
  | "lecture"
  | "recording"
  | "test"
  | "study_deck"
  | "notebook_source"
  | "notebook_output"
  | "chat";

export interface NoteSource {
  id: string;
  kind: NoteSourceKind;
  /** What the pill says — a filename, a recording title, or the kind label. */
  label: string;
  /** "p. 7", "slides 2–5", "12:30" … null when the row carries no location. */
  location: string | null;
  sourceId: string | null;
  sourcePath: string | null;
  excerpt: string | null;
}

const KIND_LABELS: Record<NoteSourceKind, string> = {
  library_note: "Linked note",
  upload: "Uploaded file",
  lecture: "Lecture",
  recording: "Recording",
  test: "Practice test",
  study_deck: "Flashcard deck",
  notebook_source: "Notebook source",
  notebook_output: "Notebook output",
  chat: "Chat",
};

const KIND_ICONS: Record<NoteSourceKind, string> = {
  library_note: "book",
  upload: "file",
  lecture: "mic",
  recording: "mic",
  test: "checklist",
  study_deck: "layers",
  notebook_source: "notebook",
  notebook_output: "notebook",
  chat: "comment-discussion",
};

export function sourceKindLabel(kind: NoteSourceKind): string {
  return KIND_LABELS[kind];
}

export function sourceKindIcon(kind: NoteSourceKind): string {
  return KIND_ICONS[kind];
}

function clockTime(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  return isFiniteNumber(value[0]) && isFiniteNumber(value[1]) ? [value[0], value[1]] : null;
}

/** Human text for a provenance `location` jsonb; null when unrecognised. */
export function describeSourceLocation(location: unknown): string | null {
  if (typeof location !== "object" || location === null) return null;
  const spot = location as Record<string, unknown>;
  if (isFiniteNumber(spot.page)) return `p. ${spot.page}`;
  const pages = numberPair(spot.pages);
  if (pages) return pages[0] === pages[1] ? `p. ${pages[0]}` : `pp. ${pages[0]}–${pages[1]}`;
  if (isFiniteNumber(spot.slide)) return `slide ${spot.slide}`;
  const slides = numberPair(spot.slides);
  if (slides) return slides[0] === slides[1] ? `slide ${slides[0]}` : `slides ${slides[0]}–${slides[1]}`;
  if (isFiniteNumber(spot.seconds)) return clockTime(spot.seconds);
  if (isFiniteNumber(spot.start_seconds) && isFiniteNumber(spot.end_seconds)) {
    return `${clockTime(spot.start_seconds)}–${clockTime(spot.end_seconds)}`;
  }
  return null;
}

/** Pill text: the origin's own name when we have one, else the kind label. */
export function sourceLabelFor(kind: NoteSourceKind, sourcePath: string | null, excerpt: string | null): string {
  const basename = sourcePath?.split("/").filter(Boolean).pop()?.trim();
  if (basename) return basename;
  const trimmedExcerpt = excerpt?.trim();
  if (trimmedExcerpt) return trimmedExcerpt.length > 60 ? `${trimmedExcerpt.slice(0, 59)}…` : trimmedExcerpt;
  return KIND_LABELS[kind];
}

interface ProvenanceRow {
  id: string;
  source_kind: string;
  source_id: string | null;
  source_path: string | null;
  location: unknown;
  excerpt: string | null;
}

function rowToSource(row: ProvenanceRow): NoteSource | null {
  if (!(row.source_kind in KIND_LABELS)) return null;
  const kind = row.source_kind as NoteSourceKind;
  return {
    id: row.id,
    kind,
    label: sourceLabelFor(kind, row.source_path, row.excerpt),
    location: describeSourceLocation(row.location),
    sourceId: row.source_id,
    sourcePath: row.source_path,
    excerpt: row.excerpt,
  };
}

// Fixtures keyed by PREVIEW_NOTES ids (library-cloud-store.ts) so the
// dev-preview harness and the signed-out demo show the pill design even though
// production has no provenance rows yet. Field-agnostic, like the notes.
// source_id values point at PREVIEW_LIBRARY_SOURCES rows (library-sources.ts)
// so the demo walks the whole loop the owner designed: note → source pill →
// the original file's page. Writers must do the same once storage lands.
const PREVIEW_SOURCES: Record<string, ProvenanceRow[]> = {
  "preview-commerce": [
    { id: "pv-1", source_kind: "upload", source_id: "preview-src-conlaw-slides", source_path: "Con Law – Week 4 slides.pdf", location: { pages: [12, 18] }, excerpt: null },
    { id: "pv-2", source_kind: "recording", source_id: "preview-src-conlaw-recording", source_path: null, location: { seconds: 1010 }, excerpt: "Lecture 9 — commerce power" },
  ],
  "preview-beams": [
    { id: "pv-3", source_kind: "upload", source_id: "preview-src-mech-ch6", source_path: "Mechanics of Materials Ch6.pdf", location: { page: 214 }, excerpt: null },
  ],
};

/** The reverse direction: ids of notes built FROM one source file — the
 *  "Notes from this file" list on a source's own page. Same degrade-to-empty
 *  contract as loadNoteSources. */
export async function loadNoteIdsForSource(sourceId: string, options?: { preview?: boolean }): Promise<string[]> {
  if (options?.preview || sourceId.startsWith("preview-")) {
    return Object.entries(PREVIEW_SOURCES)
      .filter(([, rows]) => rows.some((row) => row.source_id === sourceId))
      .map(([noteId]) => noteId);
  }
  const { data, error } = await supabase
    .from("library_provenance")
    .select("document_id")
    .eq("source_id", sourceId)
    .limit(100);
  if (error || !data) return [];
  return [...new Set((data as { document_id: string }[]).map((row) => row.document_id))];
}

/** Provenance rows for one note, newest first. Errors degrade to "no pills". */
export async function loadNoteSources(noteId: string, options?: { preview?: boolean }): Promise<NoteSource[]> {
  if (options?.preview || noteId.startsWith("preview-")) {
    return (PREVIEW_SOURCES[noteId] ?? []).map(rowToSource).filter((source): source is NoteSource => source !== null);
  }
  const { data, error } = await supabase
    .from("library_provenance")
    .select("id,source_kind,source_id,source_path,location,excerpt")
    .eq("document_id", noteId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error || !data) return [];
  return (data as ProvenanceRow[]).map(rowToSource).filter((source): source is NoteSource => source !== null);
}
