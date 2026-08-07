// Where a canvas lives.
//
// Supabase when `learning_canvases` exists, the browser when it does not. That fallback is
// deliberate rather than defensive: the migration is written but unapplied (applying anything
// to the live database is the owner's call), and the pilot has to be usable and judgeable
// today. The moment the table is applied, the same code starts persisting properly with no
// change here — and a canvas already sitting in the browser is migrated up on next save.

import { supabase } from "@/lib/supabase";

import {
  CANVAS_LEVELS,
  CANVAS_STATES,
  emptyCanvas,
  type CanvasLevel,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
} from "./canvas-model";
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

  return {
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
    weakConceptIds: list(document.weakConceptIds),
    correctedConceptIds: list(document.correctedConceptIds),
    ...(typeof document.studyDeckId === "string" ? { studyDeckId: document.studyDeckId } : {}),
    activeMs: row.active_ms ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    return raw ? (JSON.parse(raw) as LearningCanvas) : null;
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
}

export async function listCanvases(userId: string | null): Promise<CanvasSummary[]> {
  if (userId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id,title,state,updated_at")
      .eq("deleted", false)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!error && data) {
      return data.map((row) => {
        const typed = row as { id: string; title: string; state: string; updated_at: string };
        return {
          id: typed.id,
          title: typed.title,
          state: (CANVAS_STATES as readonly string[]).includes(typed.state) ? (typed.state as CanvasState) : "learn",
          updatedAt: typed.updated_at,
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
