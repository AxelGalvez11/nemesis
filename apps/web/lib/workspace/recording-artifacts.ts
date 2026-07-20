"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export type RecordingSurface = "sessions" | "notebook";

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

  return { artifacts, createArtifact };
}

