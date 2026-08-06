"use client";

// READING recordings that already exist.
//
// This file used to create them too. It does not any more (2026-08-05): the
// artifact row is written by /api/recordings/jobs at the same moment as the job
// and the Library note, and then filled in by the recording-worker function as
// each stage lands. A browser that creates the row is a browser that can be
// closed halfway through creating it.
//
// So there is no "draft" type here now either. There was one because the page
// held a finished transcript and a finished set of notes in memory and then
// wrote them; today it holds neither — the transcript arrives on the row.

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export type RecordingSurface = "sessions" | "notebook";

export interface RecordingArtifact {
  id: string;
  surface: RecordingSurface;
  contextId: string;
  title: string;
  /** Empty until the transcription stage lands, then permanent — this row is
   *  the transcript's durable home, which is why the transcription job hands its
   *  text over once and clears it. */
  transcript: string;
  /** Empty until the compose stage lands. */
  notes: string;
  /** Seconds of audio actually captured — the silence gate's quiet is not in
   *  here, and neither is it in the file, the upload, or the bill. */
  durationSeconds: number;
  createdAt: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toRecordingArtifact(value: unknown): RecordingArtifact | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.context_id !== "string" || typeof value.title !== "string") return null;
  if (value.surface !== "sessions" && value.surface !== "notebook") return null;
  return {
    id: value.id,
    surface: value.surface,
    contextId: value.context_id,
    title: value.title,
    transcript: typeof value.transcript === "string" ? value.transcript : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    durationSeconds: typeof value.duration_seconds === "number" && Number.isFinite(value.duration_seconds) ? Math.max(0, Math.round(value.duration_seconds)) : 0,
    createdAt: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
  };
}

interface UseRecordingArtifactsOptions {
  contextId: string | null;
  preview: boolean;
  /**
   * Change this to re-read.
   *
   * These rows are written by the recording worker now, not by this page, so
   * there is no local write to update from — a job moving on the server is the
   * only signal that an artifact has grown a transcript or a set of notes.
   * Callers pass a fingerprint of the jobs they are watching.
   */
  refreshKey?: string;
  surface: RecordingSurface;
  userId: string | null;
}

export function useRecordingArtifacts({ contextId, preview, refreshKey = "", surface, userId }: UseRecordingArtifactsOptions) {
  const [artifacts, setArtifacts] = useState<RecordingArtifact[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (preview || !userId || !contextId) {
      setArtifacts([]);
      return () => { cancelled = true; };
    }
    // Deliberately NOT blanked before the read. It used to be, because the only
    // thing that changed these inputs was switching conversation; `refreshKey`
    // now also fires on every stage change, and clearing first would make a
    // finished card flicker back to empty each time a job moved.
    void supabase
      .from("chat_recording_artifacts")
      .select("id,surface,context_id,title,transcript,notes,duration_seconds,created_at")
      .eq("user_id", userId)
      .eq("surface", surface)
      .eq("context_id", contextId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setArtifacts((data ?? []).flatMap((row) => {
          const artifact = toRecordingArtifact(row);
          return artifact ? [artifact] : [];
        }));
      });
    return () => { cancelled = true; };
  }, [contextId, preview, refreshKey, surface, userId]);

  return { artifacts };
}

