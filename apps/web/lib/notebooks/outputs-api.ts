// Cloud CRUD for notebook deliverable outputs (notebook_outputs) plus the
// notebook-wide recording listing. RLS scopes rows to auth.uid(); reads
// degrade to empty before the migration lands (same posture as ./api.ts).

import { isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type NotebookOutputKind = "flashcards" | "test" | "slides";
export type NotebookOutputStatus = "pending" | "ready" | "failed";

export interface NotebookOutput {
  id: string;
  notebookId: string;
  kind: NotebookOutputKind;
  title: string;
  content: string;
  status: NotebookOutputStatus;
  createdAt: string;
}

const OUTPUT_COLS = "id,notebook_id,kind,title,content,status,created_at";

function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

function toOutput(row: Record<string, unknown>): NotebookOutput | null {
  const kind = row.kind;
  const status = row.status;
  if (typeof row.id !== "string" || typeof row.notebook_id !== "string") return null;
  if (kind !== "flashcards" && kind !== "test" && kind !== "slides") return null;
  if (status !== "pending" && status !== "ready" && status !== "failed") return null;
  return {
    content: typeof row.content === "string" ? row.content : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    id: row.id,
    kind,
    notebookId: row.notebook_id,
    status,
    title: typeof row.title === "string" ? row.title : "",
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function listNotebookOutputs(notebookId: string): Promise<NotebookOutput[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("notebook_outputs")
    .select(OUTPUT_COLS)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).flatMap((row) => {
    const output = toOutput(row as Record<string, unknown>);
    return output ? [output] : [];
  });
}

export async function createNotebookOutput(input: { notebookId: string; kind: NotebookOutputKind; title: string }): Promise<NotebookOutput | null> {
  if (isPreviewMode) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_outputs")
    .insert({ kind: input.kind, notebook_id: input.notebookId, status: "pending", title: input.title, user_id: userId })
    .select(OUTPUT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toOutput(data as Record<string, unknown>);
}

export async function updateNotebookOutput(id: string, patch: { content?: string; status?: NotebookOutputStatus; title?: string }): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase
    .from("notebook_outputs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNotebookOutput(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("notebook_outputs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface NotebookRecordingRow {
  id: string;
  title: string;
  transcript: string;
  notes: string;
  durationSeconds: number;
  createdAt: string;
}

/** Every recording captured in ANY of this notebook's chats (surface
 *  'notebook', context_id = chat id). */
export async function listNotebookRecordings(chatIds: string[]): Promise<NotebookRecordingRow[]> {
  if (isPreviewMode || chatIds.length === 0) return [];
  const { data, error } = await supabase
    .from("chat_recording_artifacts")
    .select("id,title,transcript,notes,duration_seconds,created_at")
    .eq("surface", "notebook")
    .in("context_id", chatIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).flatMap((row) => {
    if (typeof row.id !== "string") return [];
    return [{
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      durationSeconds: typeof row.duration_seconds === "number" ? row.duration_seconds : 0,
      id: row.id,
      notes: typeof row.notes === "string" ? row.notes : "",
      title: typeof row.title === "string" ? row.title : "Recording",
      transcript: typeof row.transcript === "string" ? row.transcript : "",
    }];
  });
}
