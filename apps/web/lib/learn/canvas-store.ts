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
import { readTerritory, type CanvasTerritory } from "./canvas-territory";
import { documentTitle, nameFromFile } from "./document-title";

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

/** Exactly the columns `canvasFromRow` reads, spelled once so the read and the reader cannot drift.
 *
 *  🔴 A CONSTANT RATHER THAN A LITERAL AT THE CALL SITE, because the failure it prevents is silent:
 *  a field added to `CanvasRow` and not to the select comes back `undefined`, and every normaliser
 *  in this file is written to tolerate a missing field. `canvas-store.test.ts` walks the interface
 *  and this string together so the two cannot disagree. */
const CANVAS_COLUMNS = "id,title,state,level,document,active_ms,created_at,updated_at";

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
    // 🔴 Lifted out of the document HERE for the same reason `events` is — see the note above.
    moments: list(document.moments),
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
      moments: canvas.moments,
      outputs: canvas.outputs,
      weakConceptIds: canvas.weakConceptIds,
      correctedConceptIds: canvas.correctedConceptIds,
      ...(canvas.studyDeckId ? { studyDeckId: canvas.studyDeckId } : {}),
    },
    // 🔴 `territory` IS ABSENT ON PURPOSE — DO NOT ADD IT HERE, AND DO NOT PUT IT ON THE CANVAS.
    //
    // It is written by `saveCanvasTerritory` and read by `loadCanvasTerritory`, and it is the one
    // column on this table that the in-memory canvas never carries. Listing it here would write
    // `undefined` over a territory that was built minutes ago, on the learner's very next edit, and
    // the only symptom would be that topic canvases quietly started costing a model call per open
    // again. Unlisted columns survive a partial upsert — measured, with a control — which is what
    // makes leaving it out the correct and safe thing rather than an oversight.
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

function localWrite(canvas: LearningCanvas): boolean {
  try {
    window.localStorage.setItem(LOCAL_PREFIX + canvas.id, JSON.stringify(canvas));
    const index = localIndex().filter((id) => id !== canvas.id);
    window.localStorage.setItem(LOCAL_INDEX, JSON.stringify([canvas.id, ...index].slice(0, 40)));
    return true;
  } catch {
    // A full quota must not stop the lesson the learner is reading right now.
    return false;
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

/** Fired on window whenever anything below changes a canvas or a folder. The sidebar's list
 *  subscribes; without a broadcast it would either poll or go stale the moment a rename
 *  happened on the canvas itself. Fired AFTER the write returns, so a listener that re-reads
 *  sees the new truth. */
export const CANVASES_CHANGED_EVENT = "nemesis:canvases-changed";

function emitCanvasesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CANVASES_CHANGED_EVENT));
}

export interface CanvasSummary {
  id: string;
  title: string;
  state: CanvasState;
  updatedAt: string;
  /** Set when the learner pinned it. Pinned sessions sort first. */
  pinnedAt?: string | null;
  folderId?: string | null;
  /** When the canvas was first made. Optional because only Library asks for it — the front
   *  door's `listCanvases` does not select it, and a second row type for one extra column is
   *  how two readers of one table drift apart. `learning_canvases.created_at` is
   *  `not null default now()`, so whenever it IS selected it is always a real date. */
  createdAt?: string;
  /** The curriculum plan's title, when this canvas built a course. Read straight out of the
   *  territory jsonb in the SELECT (`territory->plan->>title`) — a course has no column and no
   *  table of its own on purpose (see curriculum-plan.ts), and lists only need the one fact
   *  "this canvas carries a course", not the plan itself. */
  courseTitle?: string | null;
  /** The tail of the conversation — the last moment's `assistantText`, extracted INSIDE the same
   *  SELECT (`document->moments->-1->>assistantText`), so a list row can show what a ChatGPT row
   *  shows (its last message) without the N+1 of loading every document. Null when the last
   *  moment carries no assistant text (an answer submit, a source attach); readers fall back to
   *  the course title or a plain label, never to an invented sentence. */
  preview?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  /** When the folder was made. Optional only because callers that seed folders by hand (the dev
   *  preview) have no reason to invent one; `folders.created_at` is `not null default now()`. */
  createdAt?: string;
  /** The learner's own look for the project (owner 2026-08-30, matching the reference: "chatgpt
   *  allows users to customise projects with special instructions and icon and color"). A codicon
   *  name from PROJECT_ICONS and a preset hex; null means the plain folder. */
  icon?: string | null;
  color?: string | null;
  /** Standing instructions that ride every turn of every canvas filed here. */
  instructions?: string | null;
  /** When the learner pinned this project (folders.pinned_at, 20260830T40). A pinned project
   *  moves to the sidebar's Pinned section — it does not appear twice. */
  pinnedAt?: string | null;
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
      .select("id,title,state,updated_at,pinned_at,folder_id,course_title:territory->plan->>title,preview:document->moments->-1->>assistantText")
      .eq("deleted", false)
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      return data.map((row) => {
        // `as unknown` because supabase-js's compile-time select parser cannot read the negative
        // array index (`->-1`) in the preview extraction — the SERVER parses it fine (verified
        // against production PostgREST 2026-08-30; a parse failure is a 400, and the probe came
        // back permission-denied, i.e. parsed and executed). The runtime rows are untouched.
        const typed = row as unknown as {
          id: string;
          title: string;
          state: string;
          updated_at: string;
          pinned_at: string | null;
          folder_id: string | null;
          course_title: string | null;
          preview: string | null;
        };
        return {
          id: typed.id,
          title: typed.title,
          state: (CANVAS_STATES as readonly string[]).includes(typed.state) ? (typed.state as CanvasState) : "learn",
          updatedAt: typed.updated_at,
          pinnedAt: typed.pinned_at,
          folderId: typed.folder_id,
          courseTitle: typed.course_title,
          preview: typed.preview,
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
  emitCanvasesChanged();
}

/**
 * File a canvas into a project (or back out of one, with null).
 *
 * 🔴 RETURNS WHETHER THE WRITE FOUND A ROW, AND THE FALSE CASE IS REAL. This is an UPDATE, and a
 * front-door canvas is filed by an effect that can run BEFORE the first save has inserted the
 * row — measured live 2026-08-30: the update matched nothing, said nothing, and the canvas stayed
 * loose while its project's instructions never rode a single turn. The sidebar's drag callers may
 * ignore the return (their rows exist by definition); the front-door effect retries on false.
 */
export async function setCanvasFolder(userId: string | null, id: string, folderId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.from(TABLE).update({ folder_id: folderId }).eq("id", id).select("id");
  if (error && !isMissingTableError(error)) console.warn("[learn] move failed", error.message);
  emitCanvasesChanged();
  return Array.isArray(data) && data.length > 0;
}

export async function listFolders(userId: string | null): Promise<Folder[]> {
  if (!userId) return [];
  const { data, error } = await supabase.from("folders").select("id,name,parent_id,created_at,icon,color,instructions,pinned_at").order("name");
  if (error || !data) return [];
  return (data as { id: string; name: string; parent_id: string | null; created_at: string; icon: string | null; color: string | null; instructions: string | null; pinned_at: string | null }[]).map((row) => ({
    color: row.color,
    createdAt: row.created_at,
    icon: row.icon,
    id: row.id,
    instructions: row.instructions,
    name: row.name,
    parentId: row.parent_id,
    pinnedAt: row.pinned_at,
  }));
}

/** Save a project's look and standing instructions. Nulls put the plain folder back. */
export async function customizeFolder(
  userId: string | null,
  id: string,
  custom: { icon: string | null; color: string | null; instructions: string | null },
): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase
    .from("folders")
    .update({
      color: custom.color,
      icon: custom.icon,
      instructions: custom.instructions ? custom.instructions.slice(0, 4000) : null,
    })
    .eq("id", id);
  if (error) {
    console.warn("[learn] project customize failed", error.message);
    return false;
  }
  emitCanvasesChanged();
  return true;
}

/** Pin or unpin a project, the same contract as `setCanvasPinned`: a timestamp, not a flag,
 *  so the Pinned section keeps its own stable order. */
export async function setFolderPinned(userId: string | null, id: string, pinned: boolean): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from("folders")
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) console.warn("[learn] project pin failed", error.message);
  emitCanvasesChanged();
}

/**
 * The standing instructions for the project a canvas is filed in, or null.
 *
 * 🔴 TWO TINY READS, ONCE PER TURN, AND NEITHER CAN FAIL THE TURN — the same contract as
 * `loadMemory`: every problem (no folder, no row, table not migrated, network) returns null and
 * the turn proceeds exactly as it did before projects had instructions.
 */
/** The `?folder=` riding the address bar, or null — browser only, and never a throw. */
function folderFromLocation(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("folder");
  } catch {
    return null;
  }
}

export async function loadProjectInstructions(
  userId: string | null,
  canvasId: string,
): Promise<{ name: string; instructions: string } | null> {
  if (!userId) return null;
  try {
    const { data: canvasRow } = await supabase.from(TABLE).select("folder_id").eq("id", canvasId).maybeSingle();
    // 🔴 THE URL IS THE FALLBACK, FOR THE FIRST TURNS OF A FRONT-DOOR CANVAS. The row's own
    // folder_id is the truth once the filing write lands, but that write races the first save
    // (see the retry in learning-canvas.tsx), and the learner chose the project BEFORE the canvas
    // existed — the choice rides the address bar as `?folder=`. Reading it here means the very
    // first answer already follows the project's instructions. Same precedent as
    // use-policy-runtime.ts, which also reads its own URL.
    const folderId =
      (canvasRow as { folder_id?: string | null } | null)?.folder_id ?? folderFromLocation();
    if (!folderId) return null;
    const { data: folder } = await supabase.from("folders").select("name,instructions").eq("id", folderId).maybeSingle();
    const row = folder as { name?: string | null; instructions?: string | null } | null;
    if (!row?.instructions?.trim()) return null;
    return { instructions: row.instructions.trim(), name: row.name?.trim() || "this project" };
  } catch {
    return null;
  }
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
  emitCanvasesChanged();
  return { id: row.id, name: row.name, parentId: row.parent_id };
}

export async function loadCanvas(userId: string | null, id: string): Promise<LearningCanvas | null> {
  if (userId) {
    // 🔴 THE COLUMNS `canvasFromRow` READS, NOT `*`. This was `select("*")`, which also fetched
    // `territory` — the serialised knowledge territory, up to 24-48 objects — on every open of every
    // canvas, and then threw it away: `CanvasRow` does not declare the column and `canvasFromRow`
    // never touches it. `listCanvases` above already does the narrow thing (it extracts one string
    // out of the same jsonb server-side rather than shipping it), and this is the same rule applied
    // to the read every single session makes.
    const { data, error } = await supabase.from(TABLE).select(CANVAS_COLUMNS).eq("id", id).maybeSingle();
    if (!error && data) return canvasFromRow(data as CanvasRow);
    if (error && !isMissingTableError(error)) return localRead(id);
  }
  return localRead(id);
}

/**
 * Persist. Always writes locally too, so a canvas is never lost to a transient network failure in
 * the middle of a lesson.
 *
 * 🔴🔴 IT REPORTS WHETHER THE CANVAS CAN BE FOUND AGAIN, and that answer is load-bearing since
 * 2026-09-02: the session puts the canvas's id in the address bar after its first save, and it must
 * only do that once there is genuinely something at that address. `loadCanvas` falls back to the
 * local copy on every path, so a cloud failure with a local write still counts as findable — but a
 * full quota AND a cloud error does not, and pointing the URL at nothing would turn a refresh into
 * a blank canvas standing where the learner's work was.
 *
 * Callers that do not care still write `void saveCanvas(…)` and are unaffected.
 */
export async function saveCanvas(userId: string | null, canvas: LearningCanvas): Promise<boolean> {
  const local = localWrite(canvas);
  // 🔴 NO BROADCAST WHEN SIGNED OUT, exactly as before. This function's shape changed to report
  // findability; what it DOES must not, and the signed-out path never notified the lists.
  if (!userId) return local;
  const { error } = await supabase.from(TABLE).upsert(canvasToRow(canvas, userId), { onConflict: "id" });
  emitCanvasesChanged();
  if (error && !isMissingTableError(error)) {
    // Local copy already succeeded; a cloud failure is worth knowing about but not worth
    // interrupting the learner for.
    console.warn("[learn] canvas save failed", error.message);
    return local;
  }
  return true;
}

// ------------------------------------------------------------ topic territory

/** What this canvas's territory was built from, if one has been. */
export async function loadCanvasTerritory(userId: string | null, canvasId: string): Promise<CanvasTerritory | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from(TABLE).select("territory").eq("id", canvasId).maybeSingle();
  if (error || !data) {
    // 🔴 A FAILED READ IS A MISS, NOT AN ERROR THE LEARNER SEES. The cost of missing is one model
    // call; the cost of treating this as fatal is a canvas that will not open.
    if (error && !isMissingTableError(error)) console.warn("[learn] territory read failed", error.message);
    return null;
  }
  return readTerritory((data as { territory?: unknown }).territory);
}

/**
 * Record that this canvas's territory has been built.
 *
 * 🔴 AN UPSERT, NOT AN UPDATE — DEFENSIVE RATHER THAN LOAD-BEARING. `saveCanvas` is on a 600 ms
 * debounce, so a canvas created moments ago could in principle still be memory-only, and a bare
 * `.update()` would then match zero rows and report success — every open would rebuild with no
 * error anywhere. Measured on the production canvas that exposed this bug, the row was written 23
 * minutes before either build ran, so in practice it exists; this costs nothing and the failure it
 * guards against is silent, which is the combination worth paying for.
 *
 * 🔴 `document` IS DELIBERATELY NOT LISTED, AND THAT IS SAFE BY MEASUREMENT. A partial PostgREST
 * upsert leaves unlisted columns alone — proved against this project on 2026-08-13 with a positive
 * control showing the same upsert DOES null a column once it is listed. So this cannot overwrite
 * the learner's own canvas, and symmetrically `canvasToRow` must never list `territory`, or the
 * next edit would write a stale null over a freshly built one.
 */
export async function saveCanvasTerritory(
  userId: string | null,
  canvas: LearningCanvas,
  territory: CanvasTerritory,
): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: canvas.id, territory, title: canvas.title.slice(0, 300), user_id: userId }, { onConflict: "id" });
  if (error && !isMissingTableError(error)) {
    // 🔴 NOT FATAL, AND THE DEGRADATION IS EXACTLY TODAY'S BEHAVIOUR. The learner has their
    // territory and their objectives; what was lost is the record that it exists, so the next open
    // rebuilds. Failing the whole resolve over a bookkeeping write would turn a spend problem into
    // a blank canvas.
    console.warn("[learn] territory marker save failed", error.message);
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
  emitCanvasesChanged();
}

// ------------------------------------------------------- naming and unfiling (Library)
//
// 🔴 THREE FUNCTIONS ADDED UNDER A SCOPED CROSS-LANE AUTHORISATION (Canvas UI, 2026-08-13).
// `lib/learn/**` is Runtime's. Library needs to rename canvases, rename folders and delete
// folders, and none of those existed anywhere; the authorisation was for exactly these three and
// nothing else, which is why the Library's paged/searched query lives in `lib/library/` instead
// of being added here as a fourth.
//
// 🔴 NONE OF THEM MAY TOUCH LEARNER STATE. Filing is not evidence: moving, naming or unfiling a
// canvas must not change what Nemesis asks next. Each is a single `update`/`delete` against
// `learning_canvases.title` or `folders`, and Library never imports the policy runtime.

/** The longest title the column will accept — `check (char_length(title) <= 300)`. Enforced here
 *  so an over-long name is quietly trimmed rather than rejected by the database after the
 *  learner has already seen the new name appear. */
const TITLE_MAX = 300;
const FOLDER_NAME_MAX = 120;

/** Rename a canvas. Returns the name that was actually stored, so the caller renders the trimmed
 *  value rather than the raw input it optimistically painted. */
export async function renameCanvas(userId: string | null, id: string, title: string): Promise<string | null> {
  const next = title.trim().slice(0, TITLE_MAX);
  // An empty name is a cancelled rename, not a request for an untitled canvas — the list would
  // then show a nameless row the learner cannot tell apart from any other.
  if (!next) return null;

  // The local copy is updated whether or not the cloud write lands, for the same reason
  // `saveCanvas` always writes locally: a rename that vanishes on refresh reads as data loss.
  const local = localRead(id);
  if (local) localWrite({ ...local, title: next });

  if (!userId) return next;
  const { error } = await supabase.from(TABLE).update({ title: next }).eq("id", id);
  if (error && !isMissingTableError(error)) {
    console.warn("[learn] canvas rename failed", error.message);
    return null;
  }
  emitCanvasesChanged();
  return next;
}

export async function renameFolder(userId: string | null, id: string, name: string): Promise<string | null> {
  const next = name.trim().slice(0, FOLDER_NAME_MAX);
  if (!next) return null;
  if (!userId) return null;
  const { error } = await supabase.from("folders").update({ name: next }).eq("id", id);
  if (error) {
    console.warn("[learn] folder rename failed", error.message);
    return null;
  }
  emitCanvasesChanged();
  return next;
}

/**
 * Re-parent a folder. `null` puts it back at the top level.
 *
 * 🔴 THE CALLER MUST REJECT A CYCLE; THE DATABASE WILL NOT. `folders.parent_id` has no check
 * constraint against ancestry, so moving a folder into its own descendant is accepted and the whole
 * subtree detaches — it stops appearing under any root, and `on delete cascade` means deleting one
 * of the pair takes the rest with it. Nothing surfaces the loss. `wouldCycle()` in the Library is
 * the guard, and it runs before this is ever called.
 *
 * Kept deliberately dumb for the same reason `setCanvasFolder` is: the write is one column, and the
 * rules about which writes are legal belong where the folder tree is actually known.
 */
export async function setFolderParent(userId: string | null, id: string, parentId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (id === parentId) return false;
  const { error } = await supabase.from("folders").update({ parent_id: parentId }).eq("id", id);
  if (error) {
    console.warn("[learn] folder move failed", error.message);
    return false;
  }
  emitCanvasesChanged();
  return true;
}

/**
 * Delete a folder. **Never the canvases inside it.**
 *
 * 🔴 THE CANVASES RETURN TO `Unfiled` BY SCHEMA, NOT BY THIS FUNCTION REMEMBERING TO MOVE THEM:
 *
 * ```sql
 * learning_canvases.folder_id uuid references public.folders(id) on delete set null
 * ```
 *
 * That is the strong version of the guarantee. Nulling the column here as well would work today
 * and would hide it if the constraint were ever changed — the same reason evidence survives a
 * canvas delete by `on delete set null` rather than by application care. Verified against the
 * live database on 2026-08-13.
 *
 * 🔴 `folders.parent_id` IS `on delete cascade`, SO SUBFOLDERS GO WITH IT. Their canvases also
 * return to Unfiled, because the cascade fires each child's own `set null`. No canvas is lost at
 * any depth — but the learner has to be TOLD that subfolders are being deleted, and no constraint
 * will ever enforce that. The caller owns the confirmation copy.
 */
export async function deleteFolder(userId: string | null, id: string): Promise<boolean> {
  if (!userId) return false;
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) {
    console.warn("[learn] folder delete failed", error.message);
    return false;
  }
  emitCanvasesChanged();
  return true;
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

/**
 * Is this arriving source the one already sitting in the canvas?
 *
 * 🔴 THE OLD TEST — `candidate.id === source.id` — COULD NEVER FIRE. The only caller mints
 * `` `s${sources.length + 1}` `` immediately before calling, so the arriving id is new by
 * construction and the guard compared it against ids that were all older. It read like a
 * duplicate check and was one line of dead code; production canvas `186d0749` holds a single
 * document three times, as `s2`/`s3`/`s4`.
 *
 * 🔴 AND THE COST IS NOT A REPEATED CARD. `emptyCoverage(canvas.sources.length)` sizes the
 * coverage denominator from this array, and coverage is shown to the learner — so a document
 * attached twice reports that we understood a smaller share of their material than we did. A
 * source-accounting slip becomes a claim about the person.
 *
 * The `librarySourceId` is the only thing here that identifies a DOCUMENT rather than a slot:
 * it is the same `library_sources` row every canvas, the indexer and retrieval see. The id test
 * is kept because it is still correct and callers may legitimately re-offer the same slot.
 *
 * 🔴 ABSENT IS UNKNOWN, NEVER "THE SAME THING". Two ephemeral sources both lack a library row;
 * matching on shared absence would silently delete a file the learner attached. Both sides must
 * NAME the same row.
 */
function isSameDocument(existing: CanvasSource, arriving: CanvasSource): boolean {
  if (existing.id === arriving.id) return true;
  return Boolean(existing.librarySourceId) && existing.librarySourceId === arriving.librarySourceId;
}

/**
 * Fold a re-offered document onto the entry already there, keeping the identity anchors use.
 *
 * 🔴 THE ID IS LOAD-BEARING AND IT BELONGS TO THE ENTRY THAT WAS ALREADY HERE. `quotedExcerpt`
 * resolves a citation by matching `ref.sourceId` against this id and `ref.excerptId` against an
 * excerpt's. Taking the arriving entry wholesale would dedupe perfectly and orphan every
 * citation already written against the survivor — a fix that passes the obvious test and costs
 * a learner their provenance.
 *
 * 🔴 AND THE EXCERPTS ARE KEPT, NOT RE-KEYED BY POSITION, WHICH IS THE SUBTLER HALF. Re-keying
 * `arriving.excerpts[1]` to `s1:e2` is only sound while the two lists agree; if the stored parse
 * changed between attaches, an existing citation to `s1:e2` would silently resolve to DIFFERENT
 * TEXT. A dangling citation is visible and recoverable; one that quietly points at other words
 * is a false claim about what the source says, which is the worst failure available in this
 * direction. So the cited text wins and only the metadata is refreshed.
 *
 * The one exception is an entry that has no excerpts at all — nothing can be cited against it,
 * so there is nothing to protect and the arriving text is strictly better.
 */
function adoptIntoExisting(existing: CanvasSource, arriving: CanvasSource): CanvasSource {
  if (existing.id === arriving.id) return arriving;
  return {
    ...arriving,
    id: existing.id,
    excerpts:
      existing.excerpts.length > 0
        ? existing.excerpts
        : arriving.excerpts.map((excerpt, index) => ({ ...excerpt, id: `${existing.id}:e${index + 1}` })),
  };
}

/** Fold a freshly extracted source into a canvas. Immutable. */
export function mergeSourceIntoCanvas(canvas: LearningCanvas, source: CanvasSource): LearningCanvas {
  const existing = canvas.sources.findIndex((candidate) => isSameDocument(candidate, source));
  const sources =
    existing >= 0
      ? canvas.sources.map((candidate, index) =>
          index === existing ? adoptIntoExisting(candidate, source) : candidate,
        )
      : [...canvas.sources, source];

  return {
    ...canvas,
    sources,
    // The first source names the canvas; later ones never rename it, and neither ever
    // overwrites a title the learner typed.
    //
    // 🔴 AND IT HAS TO PASS THE SHAPE TESTS FIRST (owner 2026-08-26: *"the title of the canvas
    // became really long after adding the docs"*). A source arriving through the upload door is
    // already named by `documentTitle`, but this is not the only door — a source restored from a
    // canvas written before that existed, or attached by a lane that names itself, reaches here
    // too. A second check costs nothing and closes the whole class rather than one entrance.
    //
    // 🔴 AN UNUSABLE NAME LEAVES THE CANVAS UNNAMED, and that is deliberate: the header reads
    // "New canvas", which is honest, and the learner can rename it. Putting a row of column names
    // in the sidebar for ever is not the safer failure.
    //
    // 🔴🔴 `nameFromFile` FIRST SINCE 2026-09-03, BECAUSE A SOURCE IS NOW CALLED `08-insulin.pdf`.
    // Sources keep the learner's own file name letter for letter (see `attachedFileTitle`), and a
    // CANVAS is a conversation rather than a file: naming one `08-insulin.pdf` puts a file
    // extension in the sidebar and in the browser tab. This reads the source's name the way a
    // person reads a file name, and `documentTitle` then applies the same shape tests it always
    // did — a table header row still names nothing, because stripping a would-be extension off a
    // row of column names leaves a row of column names.
    title: canvas.title || documentTitle(nameFromFile(source.title)),
    state: stateAfterSourceAttached(canvas),
    updatedAt: new Date().toISOString(),
  };
}
