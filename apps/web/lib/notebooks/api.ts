// Cloud CRUD for Notebooks. RLS scopes every row to auth.uid() (no explicit user filter on reads).
// Mirrors the proven projects / project_sources shape in lib/api.ts, renamed onto the fresh notebooks
// tables (migration 20260718T01_notebooks.sql). The client is untyped for these tables, so every row
// is re-validated through ./parse. All columns arrive in one migration, so there is no pre-migration
// "split write" dance — either the tables exist (all columns) or they don't (reads degrade to empty).

import { isPreviewMode } from "@/lib/env";
import { supabase } from "@/lib/supabase";

import {
  mapRows,
  toNotebook,
  toNotebookSource,
  type Notebook,
  type NotebookSource,
  type NotebookSourceKind,
} from "./parse";

export type { Notebook, NotebookSource, NotebookSourceKind } from "./parse";

/** PostgREST "relation does not exist" — the notebooks tables aren't applied to this project yet.
 *  Lets reads degrade to empty instead of throwing in the window before the migration lands. */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

const NOTEBOOK_COLS = "id,name,description,instructions,updated_at";
const SOURCE_COLS = "id,notebook_id,kind,name,content,source_url,library_path,bytes,created_at";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── Notebooks ────────────────────────────────────────────────────────────────

export async function listNotebooks(): Promise<Notebook[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("notebooks")
    .select(NOTEBOOK_COLS)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebooks failed: ${error.message}`);
  }
  return mapRows(data, toNotebook);
}

export async function createNotebook(name: string): Promise<Notebook | null> {
  if (isPreviewMode) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebooks")
    .insert({ user_id: userId, name: name.trim().slice(0, 200) || "Untitled notebook" })
    .select(NOTEBOOK_COLS)
    .maybeSingle();
  if (error || !data) return null;
  return toNotebook(data);
}

/** Update editable fields (RLS-scoped). Only provided keys are written. */
export async function updateNotebook(
  id: string,
  patch: { name?: string; description?: string | null; instructions?: string | null },
): Promise<void> {
  if (isPreviewMode) return;
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 200);
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.instructions !== undefined) next.instructions = patch.instructions;
  if (!Object.keys(next).length) return;
  const { error } = await supabase.from("notebooks").update(next).eq("id", id);
  if (error) throw new Error(`update notebook failed: ${error.message}`);
}

export async function deleteNotebook(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("notebooks").delete().eq("id", id);
  if (error) throw new Error(`delete notebook failed: ${error.message}`);
}

// ── Sources ──────────────────────────────────────────────────────────────────

export async function listSources(notebookId: string): Promise<NotebookSource[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("notebook_sources")
    .select(SOURCE_COLS)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`notebook sources failed: ${error.message}`);
  }
  return mapRows(data, toNotebookSource);
}

async function insertSource(row: Record<string, unknown>): Promise<NotebookSource | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("notebook_sources")
    .insert({ user_id: userId, ...row })
    .select(SOURCE_COLS)
    .maybeSingle();
  if (error) throw new Error(`add source failed: ${error.message}`);
  return data ? toNotebookSource(data) : null;
}

/** Reference a Library note (a pointer + a text snapshot for later grounding). */
export function addLibrarySource(
  notebookId: string,
  input: { path: string; title: string; content: string },
): Promise<NotebookSource | null> {
  return insertSource({
    notebook_id: notebookId,
    kind: "library",
    name: input.title.trim().slice(0, 200) || "Untitled note",
    content: input.content,
    library_path: input.path,
    bytes: input.content.length,
  });
}

/** Attach pasted text. */
export function addTextSource(
  notebookId: string,
  input: { name: string; content: string },
): Promise<NotebookSource | null> {
  return insertSource({
    notebook_id: notebookId,
    kind: "text",
    name: input.name.trim().slice(0, 200) || "Pasted text",
    content: input.content,
    bytes: input.content.length,
  });
}

/** Persist an already-extracted source (url/pdf/docx/pptx/youtube). Extraction happens first via the
 *  Node API routes (app/api/notebooks/extract/*); this only writes the resulting text row. */
export function addExtractedSource(
  notebookId: string,
  input: {
    kind: Extract<NotebookSourceKind, "url" | "pdf" | "docx" | "pptx" | "youtube">;
    name: string;
    content: string;
    sourceUrl?: string | null;
    bytes?: number | null;
  },
): Promise<NotebookSource | null> {
  return insertSource({
    notebook_id: notebookId,
    kind: input.kind,
    name: input.name.trim().slice(0, 200) || "Untitled source",
    content: input.content,
    source_url: input.sourceUrl ?? null,
    bytes: input.bytes ?? input.content.length,
  });
}

export async function deleteSource(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("notebook_sources").delete().eq("id", id);
  if (error) throw new Error(`delete source failed: ${error.message}`);
}
