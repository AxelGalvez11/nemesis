// The phone's canvas store: the web app's `learning_canvases` + `folders`, read and written as
// the signed-in user. Mirrors apps/web/lib/learn/canvas-store.ts call for call — same SELECT
// (computed columns included), same partial upserts, same soft delete — so a canvas is one
// object in one table whichever app touched it last. No local fallback: the phone is signed in
// or it is on the sign-in screen.
//
// Freshness is an in-process event, as on the web (`CANVASES_CHANGED_EVENT`): every mutator here
// calls `emit()`, and the drawer re-reads. A save from the canvas screen therefore reorders the
// sidebar without the sidebar polling.

import { supabase } from "./supabase";
import { completeMessages } from "./chat";
import {
  canvasFromRow,
  canvasToRow,
  folderFromRow,
  newCanvas,
  nextMomentId,
  summaryFromRow,
  wireHistory,
  withExchange,
  type CanvasListRow,
  type CanvasRow,
  type CanvasSummary,
  type Folder,
  type FolderRow,
} from "@/lib/canvases";
import { generateUuidV4 } from "@/lib/chat-threads";
import type { LearningCanvas } from "@/learn/web";

const TABLE = "learning_canvases";
const TITLE_MAX = 300;
const FOLDER_NAME_MAX = 120;

// ------------------------------------------------------------------------ change bus

const listeners = new Set<() => void>();

/** Hear about every mutation made through this module. Returns the unsubscribe. */
export function subscribeCanvasChanges(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

// ------------------------------------------------------------------------------ reads

/** The learner's canvases, pinned first and then most recently worked — ordered by the
 *  database, exactly the web's query. */
export async function listCanvases(uid: string): Promise<CanvasSummary[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,title,state,updated_at,created_at,pinned_at,folder_id,course_title:territory->plan->>title,preview:document->moments->-1->>assistantText")
    .eq("user_id", uid)
    .eq("deleted", false)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data) {
    console.warn("[canvases] list failed", error?.message);
    return [];
  }
  // `as unknown` for the same reason the web casts: supabase-js's select parser cannot read the
  // `->-1` preview extraction that the server handles fine.
  return (data as unknown as CanvasListRow[]).map(summaryFromRow);
}

export async function listFolders(uid: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("id,name,parent_id,created_at,icon,color,instructions,pinned_at")
    .eq("user_id", uid)
    .order("name");
  if (error || !data) {
    console.warn("[canvases] folders failed", error?.message);
    return [];
  }
  return (data as FolderRow[]).map(folderFromRow);
}

export async function loadCanvas(uid: string, id: string): Promise<LearningCanvas | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).eq("user_id", uid).maybeSingle();
  if (error || !data) return null;
  return canvasFromRow(data as CanvasRow);
}

// ----------------------------------------------------------------------------- writes

export function newCanvasId(): string {
  return generateUuidV4();
}

/** A fresh, unsaved canvas. Saved by the first exchange, not by being opened — the web's rule
 *  ("nothing is created by pressing this, only by beginning"). */
export function startCanvas(): LearningCanvas {
  return newCanvas(newCanvasId());
}

export async function saveCanvas(uid: string, canvas: LearningCanvas): Promise<boolean> {
  const { error } = await supabase.from(TABLE).upsert(canvasToRow(canvas, uid), { onConflict: "id" });
  if (error) {
    console.warn("[canvases] save failed", error.message);
    return false;
  }
  emit();
  return true;
}

export async function setCanvasPinned(uid: string, id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.warn("[canvases] pin failed", error.message);
  emit();
}

export async function setCanvasFolder(uid: string, id: string, folderId: string | null): Promise<boolean> {
  const { data, error } = await supabase.from(TABLE).update({ folder_id: folderId }).eq("id", id).eq("user_id", uid).select("id");
  if (error) console.warn("[canvases] move failed", error.message);
  emit();
  return Array.isArray(data) && data.length > 0;
}

/** Returns the name actually stored (trimmed), or null when nothing was renamed. */
export async function renameCanvas(uid: string, id: string, title: string): Promise<string | null> {
  const next = title.trim().slice(0, TITLE_MAX);
  if (!next) return null;
  const { error } = await supabase.from(TABLE).update({ title: next }).eq("id", id).eq("user_id", uid);
  if (error) {
    console.warn("[canvases] rename failed", error.message);
    emit(); // the listener re-reads and reverts whatever was painted optimistically
    return null;
  }
  emit();
  return next;
}

/** Soft delete, as on the web: the row stays, the list stops showing it. */
export async function deleteCanvas(uid: string, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ deleted: true }).eq("id", id).eq("user_id", uid);
  if (error) console.warn("[canvases] delete failed", error.message);
  emit();
}

export async function createFolder(uid: string, name: string, parentId?: string | null): Promise<Folder | null> {
  const clean = name.trim().slice(0, FOLDER_NAME_MAX);
  if (!clean) return null;
  const { data, error } = await supabase
    .from("folders")
    .insert({ name: clean, user_id: uid, ...(parentId ? { parent_id: parentId } : {}) })
    .select("id,name,parent_id,created_at,icon,color,instructions,pinned_at")
    .single();
  if (error || !data) {
    console.warn("[canvases] folder create failed", error?.message);
    emit();
    return null;
  }
  emit();
  return folderFromRow(data as FolderRow);
}

export async function renameFolder(uid: string, id: string, name: string): Promise<string | null> {
  const next = name.trim().slice(0, FOLDER_NAME_MAX);
  if (!next) return null;
  const { error } = await supabase.from("folders").update({ name: next }).eq("id", id).eq("user_id", uid);
  if (error) {
    console.warn("[canvases] folder rename failed", error.message);
    emit(); // the listener re-reads and reverts whatever was painted optimistically
    return null;
  }
  emit();
  return next;
}

export async function setFolderPinned(uid: string, id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase
    .from("folders")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) console.warn("[canvases] folder pin failed", error.message);
  emit();
}

/** Deletes the project, never the canvases in it — they return to Unfiled by the schema's
 *  `on delete set null`. Subfolders go with it (`on delete cascade`); the caller says so. */
export async function deleteFolder(uid: string, id: string): Promise<boolean> {
  const { error } = await supabase.from("folders").delete().eq("id", id).eq("user_id", uid);
  if (error) {
    console.warn("[canvases] folder delete failed", error.message);
    emit(); // the listener re-reads and puts the row back
    return false;
  }
  emit();
  return true;
}

// ------------------------------------------------------------------------------- turn

/**
 * What the model is told before a plain canvas reply. The web's canvas prompt is a much larger
 * thing (canvas-prompts.ts) that rides its teaching runtime; that runtime is slice 2. This is the
 * honest minimum until then: answer the learner, in markdown, as the same assistant they see on
 * the web.
 */
const CANVAS_SYSTEM = [
  "You are Nemesis, a study companion for students in any field.",
  "Answer the learner directly and concretely, in markdown. Use headings only when they help.",
  "Use LaTeX ($…$ inline, $$…$$ display) for mathematics and chemistry.",
  "Do not pad, do not repeat the question, do not offer a menu of things you could do next.",
].join(" ");

export interface CanvasTurnResult {
  canvas: LearningCanvas;
  reply: string | null;
  errorText: string | null;
  /** The learner pressed Stop. Whatever had streamed is already recorded (or nothing was). */
  aborted: boolean;
}

/**
 * Record one exchange on the FRESHEST copy of the canvas and save it.
 *
 * 🔴🔴 RE-READ, THEN WRITE — NEVER WRITE THE SNAPSHOT THE SCREEN OPENED WITH. `saveCanvas` replaces
 * the whole document column (the web's own save shape), and the phone's copy was read when the
 * screen mounted. A canvas the web touched in between — a lesson written on a laptop while the
 * phone sat open — would have been overwritten wholesale by the phone's stale document plus one
 * moment (review finding, 2026-09-01). Reading the row again here shrinks that window from "as
 * long as the screen was open" to the milliseconds between this read and the upsert. A canvas
 * with no row yet (the front door's unsaved one) keeps the in-memory copy.
 */
async function recordExchange(
  uid: string,
  canvas: LearningCanvas,
  exchange: { userText: string; assistantText: string; spoken?: boolean },
): Promise<LearningCanvas> {
  const fresh = (await loadCanvas(uid, canvas.id)) ?? canvas;
  const now = new Date().toISOString();
  const next = withExchange(fresh, exchange, now, nextMomentId(fresh));
  if (next !== fresh) await saveCanvas(uid, next);
  return next;
}

/**
 * One exchange on a canvas: send the learner's words with the whole thread, stream the reply,
 * record the pair as one `assistant` moment, save. The saved canvas is what the web will open.
 *
 * `onDelta` receives the accumulated reply as it streams. A failed turn records nothing and
 * returns the canvas untouched with `errorText` set.
 *
 * 🔴 STOP SAVES AT MOST ONCE, AND IT SAVES HERE. A cancelled expo/fetch can come back as a clean
 * close with the partial text rather than a throw (see postChatCompletion), so "the call returned
 * text" is not proof the learner did not press Stop. The signal is the truth: if it is aborted by
 * the time the call returns, the partial answer is recorded once — the reference keeps a
 * half-answer — and `aborted` tells the screen not to record anything itself.
 */
export async function askCanvas(
  uid: string,
  canvas: LearningCanvas,
  text: string,
  options: { onDelta?: (accumulated: string) => void; signal?: AbortSignal; spoken?: boolean } = {},
): Promise<CanvasTurnResult> {
  const said = text.trim();
  if (!said) return { canvas, reply: null, errorText: null, aborted: false };
  const wire = [
    { role: "system" as const, content: CANVAS_SYSTEM },
    ...wireHistory(canvas),
    { role: "user" as const, content: said },
  ];
  let streamed = "";
  const result = await completeMessages(uid, wire, {
    onDelta: (_delta, accumulated) => {
      streamed = accumulated;
      options.onDelta?.(accumulated);
    },
    signal: options.signal,
  });
  const exchange = (assistantText: string) => ({
    userText: said,
    assistantText,
    ...(options.spoken ? { spoken: true } : {}),
  });
  if (options.signal?.aborted) {
    const partial = (result.text ?? streamed).trim();
    if (!partial) return { canvas, reply: null, errorText: null, aborted: true };
    const next = await recordExchange(uid, canvas, exchange(partial));
    return { canvas: next, reply: partial, errorText: null, aborted: true };
  }
  if (!result.text) {
    return { canvas, reply: null, errorText: result.errorText ?? "The answer came back empty. Try again.", aborted: false };
  }
  const next = await recordExchange(uid, canvas, exchange(result.text));
  return { canvas: next, reply: result.text, errorText: null, aborted: false };
}
