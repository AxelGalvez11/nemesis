// The phone's view of a canvas: rows in, summaries and threads out. PURE — no React, no I/O.
//
// A canvas is the web app's session object (`learning_canvases`, see
// apps/web/lib/learn/canvas-store.ts). This module is the row ↔ canvas mapping that store keeps
// for the browser, mirrored column for column so a canvas written by either app reads the same
// on the other — plus the two projections the phone's screens draw: the sidebar's summaries
// grouped into projects, and a canvas's conversation as a thread of turns.
//
// 🔴 THE ROW MAPPING IS THE WEB'S, LINE FOR LINE. `canvasToRow` enumerates the document's fields
// by hand there ("a new field is saved only when someone remembers"), and an upsert from here
// carries the SAME list — a field the web writes and this list omits would be deleted the first
// time the phone saved the canvas. `canvases.test.ts` pins the list against the web's.
//
// The web also re-validates every stored judgement on the way in (`validateEvaluation`). The
// phone does not run `diagnose`, so it reads `responses` as stored and never acts on a verdict.

import {
  appendMoment,
  buildCanvasHistory,
  CANVAS_LEVELS,
  CANVAS_STATES,
  emptyCanvas,
  fileTurn,
  reconstructMoment,
  sameMoment,
  shortTitle,
  turnHasContent,
  type CanvasLevel,
  type CanvasState,
  type CanvasThreadTurn,
  type LearningCanvas,
} from "../learn/web.ts";

// ----------------------------------------------------------------------------- rows

/** `select("*")` on `learning_canvases`, as PostgREST returns it. `territory` is on the row and
 *  deliberately not on this type: the canvas object never carries it (see the web store). */
export interface CanvasRow {
  id: string;
  title: string | null;
  state: string;
  level: string | null;
  document: unknown;
  active_ms: number | null;
  created_at: string;
  updated_at: string;
  pinned_at?: string | null;
  folder_id?: string | null;
}

/** The list query's row — the same computed columns the web's sidebar selects. */
export interface CanvasListRow {
  id: string;
  title: string | null;
  state: string;
  updated_at: string;
  created_at?: string;
  pinned_at: string | null;
  folder_id: string | null;
  course_title?: string | null;
  preview?: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at?: string | null;
  icon?: string | null;
  color?: string | null;
  instructions?: string | null;
  pinned_at?: string | null;
}

/** One sidebar row. Same fields as the web's `CanvasSummary`. */
export interface CanvasSummary {
  id: string;
  title: string;
  state: CanvasState;
  updatedAt: string;
  createdAt?: string;
  pinnedAt: string | null;
  folderId: string | null;
  /** The curriculum's title when this canvas built a course. */
  courseTitle: string | null;
  /** The last thing Nemesis said, for a row that shows its tail. */
  preview: string | null;
}

/** A project. Same fields as the web's `Folder`. */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt?: string;
  icon: string | null;
  color: string | null;
  instructions: string | null;
  pinnedAt: string | null;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** The stages the web retired with its six-stage machine — `isEvidenceStage` in
 *  apps/web/lib/learn/canvas-hosting.ts, which the phone cannot import (see learn/web.ts).
 *  `canvases.test.ts` reads that function's source and fails if the two lists disagree. */
export const EVIDENCE_STAGES: readonly CanvasState[] = ["recall", "test", "retest", "diagnose", "complete"];

/** The web's two read-time rules in one place: an unrecognised state reads as `learn`, and so
 *  does a retired evidence stage — `normaliseCanvas` in the web store, whose comment explains
 *  why the row itself is never rewritten. */
function knownState(state: string): CanvasState {
  const known = (CANVAS_STATES as readonly string[]).includes(state) ? (state as CanvasState) : "learn";
  return EVIDENCE_STAGES.includes(known) ? "learn" : known;
}

export function summaryFromRow(row: CanvasListRow): CanvasSummary {
  return {
    id: row.id,
    title: row.title ?? "",
    state: knownState(row.state),
    updatedAt: row.updated_at,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    pinnedAt: row.pinned_at ?? null,
    folderId: row.folder_id ?? null,
    courseTitle: row.course_title ?? null,
    preview: row.preview ?? null,
  };
}

export function folderFromRow(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    icon: row.icon ?? null,
    color: row.color ?? null,
    instructions: row.instructions ?? null,
    pinnedAt: row.pinned_at ?? null,
  };
}

/** The web's `canvasFromRow`, minus the judgement re-validation the phone has no use for. */
export function canvasFromRow(row: CanvasRow): LearningCanvas {
  const document = (typeof row.document === "object" && row.document !== null ? row.document : {}) as Record<
    string,
    unknown
  >;
  const level =
    row.level && (CANVAS_LEVELS as readonly string[]).includes(row.level) ? (row.level as CanvasLevel) : null;
  return {
    id: row.id,
    title: row.title ?? "",
    state: knownState(row.state),
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
    events: list(document.events),
    moments: list(document.moments),
    outputs: list(document.outputs),
    weakConceptIds: list(document.weakConceptIds),
    correctedConceptIds: list(document.correctedConceptIds),
    ...(typeof document.studyDeckId === "string" ? { studyDeckId: document.studyDeckId } : {}),
    activeMs: row.active_ms ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The keys `canvasToRow` writes into the jsonb document — the web's list, kept as data so the
 *  test can compare it against the web's source file rather than against this file's memory. */
export const DOCUMENT_KEYS = [
  "sources",
  "blocks",
  "concepts",
  "recall",
  "recallResults",
  "questions",
  "answers",
  "responses",
  "correctiveAttempts",
  "events",
  "moments",
  "outputs",
  "weakConceptIds",
  "correctedConceptIds",
] as const;

/** The web's `canvasToRow`: real columns for what the list needs, everything else in jsonb.
 *  `updated_at` is never sent (the trigger owns it); `territory` is never sent (the canvas never
 *  carries it, and writing `undefined` would erase one built minutes ago). */
export function canvasToRow(canvas: LearningCanvas, userId: string): Record<string, unknown> {
  return {
    id: canvas.id,
    user_id: userId,
    title: canvas.title.slice(0, 300),
    state: canvas.state,
    level: canvas.level,
    active_ms: Math.max(0, Math.round(canvas.activeMs)),
    created_at: canvas.createdAt,
    document: {
      sources: canvas.sources,
      blocks: canvas.blocks,
      concepts: canvas.concepts,
      recall: canvas.recall,
      recallResults: canvas.recallResults,
      questions: canvas.questions,
      answers: canvas.answers,
      responses: canvas.responses,
      correctiveAttempts: canvas.correctiveAttempts,
      events: canvas.events,
      moments: canvas.moments,
      outputs: canvas.outputs,
      weakConceptIds: canvas.weakConceptIds,
      correctedConceptIds: canvas.correctedConceptIds,
      ...(canvas.studyDeckId ? { studyDeckId: canvas.studyDeckId } : {}),
    },
  };
}

/** A brand-new canvas, exactly as the web mints one (`newCanvas`), with the id supplied. */
export function newCanvas(id: string, now = new Date().toISOString()): LearningCanvas {
  return emptyCanvas(id, now);
}

// ------------------------------------------------------------------------ projects

/** One project on the page — the web's `ProjectNode`. */
export interface ProjectNode {
  id: string;
  name: string;
  modifiedAt: string;
  holdsPinned: boolean;
  pinnedAt: string | null;
  icon: string | null;
  color: string | null;
  instructions: string | null;
  canvases: CanvasSummary[];
  children: ProjectNode[];
}

function later(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function byRecency(a: ProjectNode, b: ProjectNode): number {
  return b.modifiedAt.localeCompare(a.modifiedAt);
}

/**
 * Fold folders and canvases into the tree the pages draw — the web's `buildProjects`, verbatim
 * (apps/web/components/workspace/projects/projects-model.ts), including its two guards: a cycle
 * in `folders.parent_id` terminates as a shorter branch instead of hanging, and a folder the
 * walk never reached is surfaced at the top rather than left off the page.
 */
export function buildProjects(folders: readonly Folder[], canvases: readonly CanvasSummary[]): ProjectNode[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const byParent = new Map<string, Folder[]>();
  for (const folder of folders) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    if (parent === null) continue;
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(folder);
    else byParent.set(parent, [folder]);
  }

  const held = new Map<string, CanvasSummary[]>();
  for (const canvas of canvases) {
    const folderId = canvas.folderId;
    if (!folderId || !ids.has(folderId)) continue;
    const bucket = held.get(folderId);
    if (bucket) bucket.push(canvas);
    else held.set(folderId, [canvas]);
  }

  const seen = new Set<string>();
  const build = (folder: Folder): ProjectNode => {
    seen.add(folder.id);
    const children = (byParent.get(folder.id) ?? []).filter((child) => !seen.has(child.id)).map(build);
    const own = (held.get(folder.id) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let modifiedAt = folder.createdAt ?? "";
    for (const canvas of own) modifiedAt = later(modifiedAt, canvas.updatedAt);
    for (const child of children) modifiedAt = later(modifiedAt, child.modifiedAt);
    return {
      canvases: own,
      children: children.sort(byRecency),
      color: folder.color ?? null,
      holdsPinned: own.some((canvas) => Boolean(canvas.pinnedAt)) || children.some((child) => child.holdsPinned),
      icon: folder.icon ?? null,
      id: folder.id,
      instructions: folder.instructions ?? null,
      modifiedAt,
      name: folder.name,
      pinnedAt: folder.pinnedAt ?? null,
    };
  };

  const roots = folders.filter((folder) => !folder.parentId || !ids.has(folder.parentId));
  const nodes = roots.map(build);
  for (const folder of folders) if (!seen.has(folder.id)) nodes.push(build(folder));
  return nodes.sort(byRecency);
}

export function findProject(nodes: readonly ProjectNode[], id: string): ProjectNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findProject(node.children, id);
    if (found) return found;
  }
  return null;
}

export function matchesQuery(node: ProjectNode, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (node.name.toLowerCase().includes(needle)) return true;
  return node.children.some((child) => matchesQuery(child, needle));
}

export type ProjectFilter = "all" | "pinned";

export function visibleProjects(projects: readonly ProjectNode[], filter: ProjectFilter, query: string): ProjectNode[] {
  return projects
    .filter((project) => (filter === "pinned" ? Boolean(project.pinnedAt) : true))
    .filter((project) => matchesQuery(project, query));
}

// ------------------------------------------------------------------------- sidebar

/** What the drawer draws: the web sidebar's three sections, in its order. */
export interface SidebarSections {
  /** Pinned canvases first (by pin time, newest pin first — the order the database gives),
   *  then pinned projects. A pinned project leaves the Projects section; it never appears twice. */
  pinnedCanvases: CanvasSummary[];
  pinnedProjects: ProjectNode[];
  projects: ProjectNode[];
  /** Everything else, most recently worked first. Filed canvases stay in their project. */
  recents: CanvasSummary[];
}

export function sidebarSections(
  canvases: readonly CanvasSummary[],
  folders: readonly Folder[],
  query = "",
): SidebarSections {
  const needle = query.trim().toLowerCase();
  const hit = (canvas: CanvasSummary) => !needle || canvasLabel(canvas).toLowerCase().includes(needle);
  const projects = buildProjects(folders, canvases);
  return {
    pinnedCanvases: canvases.filter((canvas) => canvas.pinnedAt && hit(canvas)),
    pinnedProjects: projects.filter((project) => project.pinnedAt && matchesQuery(project, query)),
    projects: projects.filter((project) => !project.pinnedAt && matchesQuery(project, query)),
    recents: canvases.filter((canvas) => !canvas.pinnedAt && !canvas.folderId && hit(canvas)),
  };
}

/** What a row calls a canvas. The title when it has one; otherwise its course, its tail, or a
 *  plain label — never an invented sentence (the web's rule). */
export function canvasLabel(canvas: Pick<CanvasSummary, "title" | "courseTitle" | "preview">): string {
  const title = canvas.title.trim();
  if (title) return title;
  const course = canvas.courseTitle?.trim();
  if (course) return course;
  const tail = canvas.preview?.trim();
  if (tail) return shortTitle(tail);
  return "New canvas";
}

// -------------------------------------------------------------------------- thread

/**
 * A canvas's conversation as turns, oldest first — rebuilt from `moments` exactly as the web does
 * on reopen (`learning-canvas.tsx`, the seeding effect): history rows → `reconstructMoment` →
 * `fileTurn`, flagged `restored`, empty rows dropped.
 *
 * 🔴 EVERY TURN, INCLUDING THE LAST. The web holds the newest turn back from its thread because
 * its live region draws it; the phone has no live region, so the thread is the whole conversation.
 */
export function threadFromCanvas(canvas: LearningCanvas): CanvasThreadTurn[] {
  const source = {
    createdAt: canvas.createdAt,
    moments: canvas.moments,
    questions: canvas.questions,
    responses: canvas.responses,
    sources: canvas.sources,
  };
  return buildCanvasHistory(source)
    .map((entry) => reconstructMoment(source, entry.momentId))
    .filter((moment): moment is NonNullable<typeof moment> => moment !== null)
    .map((moment) => ({
      ...fileTurn({
        at: moment.occurredAt,
        attached: moment.sourceTitles ?? [],
        id: moment.momentId,
        reply: moment.said ?? "",
        said: moment.asked ?? null,
        saidVia: moment.spoken ? "spoken" : null,
      }),
      restored: true,
      ...(moment.truncated ? { truncated: true } : {}),
    }))
    .filter(turnHasContent);
}

/** The moment id the web mints for a recorded exchange (`use-canvas-session.ts`). */
export function nextMomentId(canvas: Pick<LearningCanvas, "moments">, now = Date.now()): string {
  return `m${canvas.moments.length}-${now}`;
}

/**
 * The canvas after one conversational exchange: the learner's words and Nemesis's reply, as one
 * `assistant` moment (the web's "one moment for the pair"), through the web's own `appendMoment`
 * so the caps apply. A repeat of the last exchange is not recorded twice.
 *
 * A canvas with no title yet takes the learner's words, shortened, as a provisional one — the
 * web names a canvas with a model call, and until the phone does too (slice 2) a row that says
 * what was asked beats a row that says nothing.
 *
 * 🔴 `state` IS LEFT ALONE. Which stage a canvas is in is the web's teaching runtime's decision;
 * a plain reply from the phone is not evidence of anything.
 */
export function withExchange(
  canvas: LearningCanvas,
  exchange: { userText: string; assistantText: string; spoken?: boolean },
  now: string,
  id: string,
): LearningCanvas {
  const input = { kind: "assistant" as const, ...exchange };
  if (sameMoment(canvas.moments.at(-1), input)) return canvas;
  return {
    ...canvas,
    title: canvas.title.trim() ? canvas.title : shortTitle(exchange.userText),
    moments: appendMoment(canvas.moments, input, now, id),
    updatedAt: now,
  };
}

/** The exchange as the model should see it: the whole thread, oldest first, as chat messages. */
export function wireHistory(canvas: LearningCanvas): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of threadFromCanvas(canvas)) {
    if (turn.said?.trim()) out.push({ role: "user", content: turn.said });
    if (turn.reply.trim()) out.push({ role: "assistant", content: turn.reply });
  }
  return out;
}
