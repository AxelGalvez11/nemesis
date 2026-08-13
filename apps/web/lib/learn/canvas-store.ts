// Where a canvas lives.
//
// Supabase when `learning_canvases` exists, the browser when it does not.
//
// The table is now applied in production (verified 2026-08-10), so the cloud path is the live
// one and canvases survive a refresh. The browser fallback stays: it is what carried the pilot
// before the migration landed, it still covers a signed-out or offline session, and it holds
// the OLDEST documents we have — which is why `normaliseCanvas` runs on both read paths and not
// just on rows.

import { supabase } from "@/lib/supabase";

import {
  CANVAS_LEVELS,
  CANVAS_STATES,
  emptyCanvas,
  normaliseQuestion,
  type CanvasLevel,
  type CanvasResponse,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
} from "./canvas-model";
import { validateEvaluation } from "./canvas-judge";
import { isEvidenceStage } from "./canvas-hosting";
import { stateAfterSourceAttached } from "./canvas-state";

const TABLE = "learning_canvases";
const LOCAL_PREFIX = "nemesis.learn.canvas.v1.";
const LOCAL_INDEX = "nemesis.learn.canvases.v1";

export interface CanvasRow {
  id: string;
  title: string;
  state: string;
  level: string | null;
  document: unknown;
  active_ms: number;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------- row <-> canvas

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Bring a stored canvas up to the shape the code expects.
 *
 *  🔴 A CANVAS SAVED BEFORE FREE RESPONSE HAS NO `responses` ARRAY AT ALL, and the test stage
 *  calls `.find` on it. Adding a required field to a persisted shape is not free: every row
 *  already written predates it, and the browser-storage path in particular used to cast straight
 *  to the type without looking. So the default lives here, on the way in, where both readers
 *  pass — not at each use site, where the next reader would have to remember.
 *
 *  Judgements are re-checked rather than trusted. They were validated when written, but a
 *  document also round-trips through localStorage, and a stored verdict outside the closed set
 *  would otherwise reach `diagnose` and decide what the learner is told they do not understand. */
export function normaliseCanvas(raw: LearningCanvas | Record<string, unknown>): LearningCanvas {
  const canvas = raw as LearningCanvas;
  const conceptIds = list<{ id?: string }>((canvas as { concepts?: unknown }).concepts)
    .map((concept) => concept?.id)
    .filter((id): id is string => typeof id === "string");

  return {
    ...canvas,
    // 🔴 A CANVAS STORED MID-RUN RESOLVES TO READING — ON THE WAY IN, AND THE ROW IS NEVER TOUCHED.
    //
    // Two of the owner's six canvases are captured in a legacy evidence stage (`test`, `recall`).
    // With the six-stage machine retired they would otherwise sit in a state nothing routes to and
    // nothing paints. The obvious fix — an UPDATE setting `state` — is the wrong one: that is a
    // data change made to correct a projection, on the owner's own rows, and it is not reversible.
    // Resolving on read leaves the stored document exactly as written, so if this judgement is
    // wrong we change one function instead of restoring rows from a backup we do not have.
    //
    // 🔴 IT MUST SIT AFTER THE SPREAD. `...canvas` carries the raw `state`; placed above, the raw
    // value would win and this would silently do nothing — the failure mode being fixed, reproduced
    // one line higher.
    //
    // `learn` and not `orient`: both captured canvases hold real blocks (64 and 9), so reading is
    // something they can actually do, and it is already the fallback `canvasFromRow` uses for an
    // unrecognised state. A canvas is left with its document and whatever the policy can ask about
    // it — strictly better than a fixed quiz that recorded nothing.
    state: isEvidenceStage(canvas.state) ? "learn" : canvas.state,
    questions: list<Record<string, unknown>>((canvas as { questions?: unknown }).questions).map(normaliseQuestion),
    answers: list((canvas as { answers?: unknown }).answers),
    responses: list<CanvasResponse>((canvas as { responses?: unknown }).responses).map((response) => {
      if (!response?.evaluation) return response;
      const { evaluation } = validateEvaluation(response.evaluation, { conceptIds });
      // A judgement that no longer holds up is dropped, not downgraded: an unjudged response
      // carries no evidence either way, which is the honest state for one we cannot verify.
      return evaluation ? { ...response, evaluation } : { ...response, evaluation: undefined };
    }),
    recallResults: list((canvas as { recallResults?: unknown }).recallResults),
    // Absent on every canvas written before the teaching loop existed.
    correctiveAttempts:
      (canvas as { correctiveAttempts?: Record<string, number> }).correctiveAttempts ?? {},
    // Absent on every canvas written before interaction telemetry existed.
    events: list((canvas as { events?: unknown }).events),
    // Absent on every canvas written before outputs were distinguished from sources.
    outputs: list((canvas as { outputs?: unknown }).outputs),
  };
}

export function canvasFromRow(row: CanvasRow): LearningCanvas {
  // A jsonb column can hold anything; treating a non-object as an empty document keeps one
  // corrupted row from taking the whole surface down.
  const document = (typeof row.document === "object" && row.document !== null ? row.document : {}) as Record<
    string,
    unknown
  >;
  const state = (CANVAS_STATES as readonly string[]).includes(row.state) ? (row.state as CanvasState) : "learn";
  const level =
    row.level && (CANVAS_LEVELS as readonly string[]).includes(row.level) ? (row.level as CanvasLevel) : null;

  return normaliseCanvas({
    id: row.id,
    title: row.title ?? "",
    state,
    level,
    sources: list(document.sources),
    blocks: list(document.blocks),
    concepts: list(document.concepts),
    recall: list(document.recall),
    recallResults: list(document.recallResults),
    questions: list(document.questions),
    answers: list(document.answers),
    responses: list(document.responses),
    correctiveAttempts: (document.correctiveAttempts ?? {}) as Record<string, number>,
    // 🔴 `events` has to be lifted out of the document HERE, not left to `normaliseCanvas`.
    // The normaliser reads whatever field is on the object handed to it, and this literal is
    // that object — so omitting the line meant it read `undefined` and returned [] every time.
    // The result: interaction telemetry was written to the cloud correctly and silently
    // discarded on every cloud read. It survived in the browser only because the local path
    // normalises the parsed JSON directly, which still had the field.
    events: list(document.events),
    outputs: list(document.outputs),
    weakConceptIds: list(document.weakConceptIds),
    correctedConceptIds: list(document.correctedConceptIds),
    ...(typeof document.studyDeckId === "string" ? { studyDeckId: document.studyDeckId } : {}),
    activeMs: row.active_ms ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Title, state, level and time go in real columns so the list query and any later analysis
 *  never have to parse the document. Everything else rides in jsonb. */
export function canvasToRow(canvas: LearningCanvas, userId: string): Record<string, unknown> {
  return {
    id: canvas.id,
    user_id: userId,
    title: canvas.title.slice(0, 300),
    state: canvas.state,
    level: canvas.level,
    active_ms: Math.max(0, Math.round(canvas.activeMs)),
    // Sent explicitly so a canvas that started life in the browser (before the table existed)
    // keeps its real birthday when it is first written to the cloud. `updated_at` is NOT sent
    // — the table's trigger owns it, and a client clock must not be able to reorder the list.
    created_at: canvas.createdAt,
    document: {
      sources: canvas.sources,
      blocks: canvas.blocks,
      concepts: canvas.concepts,
      recall: canvas.recall,
      recallResults: canvas.recallResults,
      questions: canvas.questions,
      answers: canvas.answers,
      // 🔴 Every field on the canvas needs a line here or it is silently not persisted. This
      // list is written by hand rather than spread, so a new field is saved only when someone
      // remembers — and free responses are the learner's own words, which is the worst thing
      // on the canvas to lose.
      responses: canvas.responses,
      correctiveAttempts: canvas.correctiveAttempts,
      events: canvas.events,
      outputs: canvas.outputs,
      weakConceptIds: canvas.weakConceptIds,
      correctedConceptIds: canvas.correctedConceptIds,
      ...(canvas.studyDeckId ? { studyDeckId: canvas.studyDeckId } : {}),
    },
  };
}

/** Is this error "the table isn't there", as opposed to a real failure?
 *
 *  Narrow on purpose. Falling back to the browser on a permission or network error would hide
 *  a genuine bug behind a surface that looks like it works. */
export function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("could not find the table") || message.includes("does not exist");
}

// -------------------------------------------------------------- local storage

function localRead(id: string): LearningCanvas | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + id);
    // Through the same normaliser as the database path. This was a bare cast, which is exactly
    // how a canvas stored before free response reaches the test stage with no `responses` array
    // and crashes it — the browser holds the oldest documents we have.
    return raw ? normaliseCanvas(JSON.parse(raw) as LearningCanvas) : null;
  } catch {
    return null;
  }
}

function localWrite(canvas: LearningCanvas): void {
  try {
    window.localStorage.setItem(LOCAL_PREFIX + canvas.id, JSON.stringify(canvas));
    const index = localIndex().filter((id) => id !== canvas.id);
    window.localStorage.setItem(LOCAL_INDEX, JSON.stringify([canvas.id, ...index].slice(0, 40)));
  } catch {
    // A full quota must not stop the lesson the learner is reading right now.
  }
}

function localIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_INDEX);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------- the API

export interface CanvasSummary {
  id: string;
  title: string;
  state: CanvasState;
  updatedAt: string;
  /** Set when the learner pinned it. Pinned sessions sort first. */
  pinnedAt?: string | null;
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

/** The learner's sessions, pinned first and then most recently worked.
 *
 *  🔴 ORDERED BY THE DATABASE, not in the page. The index
 *  `(user_id, pinned_at desc nulls last, updated_at desc)` exists precisely so this never
 *  becomes a client-side sort over whatever page of rows happened to arrive — which is the
 *  quiet way a list starts lying once it exceeds one page. */
export async function listCanvases(userId: string | null): Promise<CanvasSummary[]> {
  if (userId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id,title,state,updated_at,pinned_at,folder_id")
      .eq("deleted", false)
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      return data.map((row) => {
        const typed = row as {
          id: string;
          title: string;
          state: string;
          updated_at: string;
          pinned_at: string | null;
          folder_id: string | null;
        };
        return {
          id: typed.id,
          title: typed.title,
          state: (CANVAS_STATES as readonly string[]).includes(typed.state) ? (typed.state as CanvasState) : "learn",
          updatedAt: typed.updated_at,
          pinnedAt: typed.pinned_at,
          folderId: typed.folder_id,
        };
      });
    }
    if (error && !isMissingTableError(error)) return [];
  }
  return localIndex()
    .map((id) => localRead(id))
    .filter((canvas): canvas is LearningCanvas => canvas !== null)
    .map((canvas) => ({ id: canvas.id, title: canvas.title, state: canvas.state, updatedAt: canvas.updatedAt }));
}

/** Pin or unpin. Pinning stamps a time rather than setting a flag, so the pinned block has its
 *  own stable order instead of re-shuffling every time an unrelated session is touched. */
export async function setCanvasPinned(userId: string | null, id: string, pinned: boolean): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from(TABLE)
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  if (error && !isMissingTableError(error)) console.warn("[learn] pin failed", error.message);
}

export async function setCanvasFolder(userId: string | null, id: string, folderId: string | null): Promise<void> {
  if (!userId) return;
  const { error } = await supabase.from(TABLE).update({ folder_id: folderId }).eq("id", id);
  if (error && !isMissingTableError(error)) console.warn("[learn] move failed", error.message);
}

export async function listFolders(userId: string | null): Promise<Folder[]> {
  if (!userId) return [];
  const { data, error } = await supabase.from("folders").select("id,name,parent_id").order("name");
  if (error || !data) return [];
  return (data as { id: string; name: string; parent_id: string | null }[]).map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
  }));
}

export async function createFolder(userId: string | null, name: string, parentId?: string | null): Promise<Folder | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("folders")
    .insert({ name: name.slice(0, 120), ...(parentId ? { parent_id: parentId } : {}) })
    .select("id,name,parent_id")
    .single();
  if (error || !data) {
    // The two-level trigger raises here rather than silently nesting deeper. Worth surfacing
    // as a failure the caller can report, not swallowing.
    console.warn("[learn] folder create failed", error?.message);
    return null;
  }
  const row = data as { id: string; name: string; parent_id: string | null };
  return { id: row.id, name: row.name, parentId: row.parent_id };
}

export async function loadCanvas(userId: string | null, id: string): Promise<LearningCanvas | null> {
  if (userId) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (!error && data) return canvasFromRow(data as CanvasRow);
    if (error && !isMissingTableError(error)) return localRead(id);
  }
  return localRead(id);
}

/** Persist. Always writes locally too, so a canvas is never lost to a transient network
 *  failure in the middle of a lesson. */
export async function saveCanvas(userId: string | null, canvas: LearningCanvas): Promise<void> {
  localWrite(canvas);
  if (!userId) return;
  const { error } = await supabase.from(TABLE).upsert(canvasToRow(canvas, userId), { onConflict: "id" });
  if (error && !isMissingTableError(error)) {
    // Local copy already succeeded; a cloud failure is worth knowing about but not worth
    // interrupting the learner for.
    console.warn("[learn] canvas save failed", error.message);
  }
}

/** Remove a canvas from the learner's list.
 *
 *  🔴 SOFT DELETE, and that is not timidity — a canvas holds the learner's own words about what
 *  they understood and where they were wrong, which is the least recoverable thing in the
 *  product. The table has a `deleted` flag and every list query already filters on it.
 *
 *  🔴 AND IT DOES NOT TOUCH SOURCES. Today each canvas carries its own copy of the extracted
 *  text inside its document, so there is nothing shared to orphan. That is also why §12's
 *  reference-aware deletion cannot be written yet: two canvases built on the same PDF each hold
 *  their own copy, so there are no references to count. When sources become real assets, the
 *  counting belongs here. */
export async function deleteCanvas(userId: string | null, id: string): Promise<void> {
  try {
    window.localStorage.removeItem(LOCAL_PREFIX + id);
    window.localStorage.setItem(LOCAL_INDEX, JSON.stringify(localIndex().filter((entry) => entry !== id)));
  } catch {
    // A browser that will not let us forget it is not a reason to keep it in the cloud.
  }
  if (!userId) return;
  const { error } = await supabase.from(TABLE).update({ deleted: true }).eq("id", id);
  if (error && !isMissingTableError(error)) {
    console.warn("[learn] canvas delete failed", error.message);
  }
}

export function newCanvas(): LearningCanvas {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return emptyCanvas(id, now);
}

// ----------------------------------------------------------- attaching source

/** Fold a freshly extracted source into a canvas. Immutable. */
export function mergeSourceIntoCanvas(canvas: LearningCanvas, source: CanvasSource): LearningCanvas {
  const existing = canvas.sources.findIndex((candidate) => candidate.id === source.id);
  const sources =
    existing >= 0
      ? canvas.sources.map((candidate, index) => (index === existing ? source : candidate))
      : [...canvas.sources, source];

  return {
    ...canvas,
    sources,
    // The first source names the canvas; later ones never rename it, and neither ever
    // overwrites a title the learner typed.
    title: canvas.title || source.title,
    state: stateAfterSourceAttached(canvas),
    updatedAt: new Date().toISOString(),
  };
}
