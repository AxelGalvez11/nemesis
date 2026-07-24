"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { buildRecordingTitleMessages, cleanRecordingTitle } from "@/lib/workspace/recording-title";

export type RecordingSurface = "sessions" | "notebook";

/** Ceiling on the AI-title round-trip. A one-line title is normally back in a
 *  second or two; this only bounds a hung valve so the card can't be stranded
 *  waiting to be named — past it we fall back to the timestamp title. */
const RECORDING_TITLE_TIMEOUT_MS = 12_000;

/** Ask the cheap conversational model for a short human title for a finished
 *  recording. Routes through the SAME slot the live-notes pass uses (never
 *  search, never the reasoner — mobile's LIVE_NOTES_DECISION / web's
 *  live-audio-insights). Returns the cleaned title, or null when there's
 *  nothing to name from, the call fails, or it times out — the caller keeps
 *  its timestamp title in every one of those cases, never "untitled". */
export async function requestRecordingTitle(uid: string, transcript: string, notes?: string): Promise<string | null> {
  const source = transcript.trim();
  if (!source) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECORDING_TITLE_TIMEOUT_MS);
  try {
    const reply = await postChatCompletion(uid, buildRecordingTitleMessages(source, notes), {
      decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
      signal: controller.signal,
    });
    return cleanRecordingTitle(reply.text);
  } catch {
    // Aborted (timeout) or offline — postChatCompletion only throws on abort;
    // every other failure already comes back as reply.text === null above.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RecordingArtifactDraft {
  durationSeconds: number;
  notes: string;
  transcript: string;
}

export interface RecordingArtifact extends RecordingArtifactDraft {
  id: string;
  surface: RecordingSurface;
  contextId: string;
  title: string;
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
  surface: RecordingSurface;
  userId: string | null;
}

export function useRecordingArtifacts({ contextId, preview, surface, userId }: UseRecordingArtifactsOptions) {
  const [artifacts, setArtifacts] = useState<RecordingArtifact[]>([]);

  useEffect(() => {
    let cancelled = false;
    setArtifacts([]);
    if (preview || !userId || !contextId) return () => { cancelled = true; };
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
  }, [contextId, preview, surface, userId]);

  const createArtifact = useCallback(async (draft: RecordingArtifactDraft, title?: string) => {
    if (!contextId) throw new Error("Choose a conversation before saving a recording.");
    const createdAt = new Date().toISOString();
    const artifact: RecordingArtifact = {
      id: crypto.randomUUID(),
      contextId,
      surface,
      title: title?.trim() || `Recording · ${new Date(createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      transcript: draft.transcript.trim(),
      notes: draft.notes.trim(),
      durationSeconds: Math.max(0, Math.round(draft.durationSeconds)),
      createdAt,
    };
    setArtifacts((current) => [artifact, ...current]);
    if (preview) return artifact;
    if (!userId) throw new Error("Sign in to save recording outputs.");
    const { data, error } = await supabase
      .from("chat_recording_artifacts")
      .insert({
        id: artifact.id,
        user_id: userId,
        surface,
        context_id: contextId,
        title: artifact.title,
        transcript: artifact.transcript,
        notes: artifact.notes,
        duration_seconds: artifact.durationSeconds,
        created_at: createdAt,
      })
      .select("id,surface,context_id,title,transcript,notes,duration_seconds,created_at")
      .single();
    if (error) {
      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
      throw new Error(error.message);
    }
    const saved = toRecordingArtifact(data);
    if (saved) setArtifacts((current) => current.map((item) => item.id === saved.id ? saved : item));
    return saved ?? artifact;
  }, [contextId, preview, surface, userId]);

  /** Rename a saved recording — used to swap the timestamp title for the AI
   *  title once it's back (owner item 3). The `chat_recording_artifacts` row is
   *  the durable source of truth web's rail reads (same as mobile's enhance
   *  pass), so it's updated FIRST and local state only follows on success —
   *  that way a failed write throws without leaving the rail showing a title
   *  the row never got. No-op on a blank title. */
  const renameArtifact = useCallback(async (id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    if (!preview && userId) {
      const { error } = await supabase
        .from("chat_recording_artifacts")
        .update({ title: clean })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    setArtifacts((current) => current.map((item) => item.id === id ? { ...item, title: clean } : item));
  }, [preview, userId]);

  return { artifacts, createArtifact, renameArtifact };
}

