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
  /**
   * The `refreshKey` these rows were actually READ FOR — not the one being asked
   * for right now.
   *
   * 🔴 THIS IS THE FIX FOR A REAL DATA-LOSS SCARE, not bookkeeping. This hook is
   * always at least one network round trip behind the jobs that drive it: the
   * key changes, the effect fires, and the rows arrive some time later. A caller
   * that reads `artifacts` in between is holding a snapshot of an OLDER job
   * state, and for a recording mid-write-up that snapshot has a transcript and
   * no notes — indistinguishable, from the outside, from a write-up that failed.
   *
   * A chat card believed exactly that and told a student their 47-minute lecture
   * had been lost, while the notes sat finished in their Library. Comparing this
   * against the current key is what lets a caller tell "the notes are not there"
   * apart from "the notes are not here YET".
   *
   * Starts as null rather than "" so a fresh mount, whose key is also "", cannot
   * accidentally look fresh before anything has been read.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (preview || !userId || !contextId) {
      setArtifacts([]);
      setLoadedKey(null);
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
        // AFTER the rows, and in the same commit, so there is no moment where
        // the key claims freshness for data that has not landed.
        setLoadedKey(refreshKey);
      });
    return () => { cancelled = true; };
  }, [contextId, preview, refreshKey, surface, userId]);

  return { artifacts, fresh: loadedKey === refreshKey };
}

