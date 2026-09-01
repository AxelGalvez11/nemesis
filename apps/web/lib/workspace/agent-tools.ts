// Sessions-chat agent tools (owner decision 2026-07-20: READ + WRITE over the
// student's Library, Study, and Calendar). Schemas ride the OpenAI `tools`
// field straight through the valve to the model (tool_choice stays auto —
// DeepSeek thinking mode rejects forced choices, see
// docs/research/deepseek-tool-calling-fix-2026-07.md); executors run here in
// the browser against the same RLS-scoped Supabase tables the pages use, so
// the agent can never see or touch another account's data.

import {
  knownCourses,
  sourceCourseFolder,
  calendarEventPatch,
  describeTarget,
  destructiveSpec,
  heldForConfirmation,
  isPatchFailure,
  pendingDeleteResult,
  WEB_WORKSPACE_AGENT_TOOL_NAMES,
  toolDescription,
  workspaceId,
  type PendingDelete,
} from "@nemesis/shared";
import { EXAM_ITEM_RULES_SHORT } from "./item-writing";
import { figureAssetUrl } from "@/lib/learn/figure-asset-url";
import { supabase } from "@/lib/supabase";
import { refreshStudyAfterExternalWrite, type CreateArtifactInput, type StudyArtifact } from "@/lib/workspace/study-cloud-store";
import {
  calendarCoverage,
  calendarEventFromRow,
  eventsInWindow,
  isDateKey,
  localToday,
  resolveCalendarWindow,
  type CalendarEventRow,
} from "./calendar-agent-range";
import { parseRecurrence } from "./calendar-model";
import { isInLibrarySubtree, planFolderRelocation } from "./library-folder-plan";
import { mergeLibraryHits, type LexicalHit, type SemanticHit } from "./library-search-merge";
import { planLibraryMigration, migrationSummary } from "./library-migration";
import { remapLibrarySourceFolders, setLibrarySourceFolder } from "./library-sources";
import { expandLibraryFolder, summarizeLibraryTree, type LibraryTreeDoc } from "./library-tree-summary";
import { writeLibraryNote } from "./library-write";
import {
  bestAttempt,
  deckMaterial,
  missedFacts,
  mixedReviewMaterial,
  MISS_KIND_LABEL,
  noteMaterial,
  parseGeneratedMindmap,
  parseMindmapContent,
  parseTestContent,
  type StudyMaterial,
} from "./study-artifact-content";
import { generateStudyArtifact } from "./study-generate";
import { studyOverview, type OverviewCardRow, type OverviewDeckRow } from "./study-agent-overview";
import { joinGroupPath, normalizeGroupPath, pathLeaf, renamedGroupPath, uniqueDeckName } from "./study-tree";
import { findCalendarIssues, splitCalendarConflicts } from "./calendar-conflicts";
import { balanceAnswerPositions } from "./test-answer-balance";
import { fetchAllRows } from "./supabase-paging";

const MAX_NOTE_CHARS = 8_000;
// 🔴 30 made the model deny things that exist. list_study_decks orders by
// NAME, so with more than 30 decks anything past the alphabetical cutoff was
// invisible — the chat saved 22 cards to a deck and then told the owner the
// deck wasn't in the deck list (2026-08-03). 200 names is still only a few
// hundred tokens.
const MAX_LIST = 200;

export interface AgentToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  arguments: string;
}

export const AGENT_TOOL_NAMES = WEB_WORKSPACE_AGENT_TOOL_NAMES;

/** OpenAI-format tool schemas sent with every sessions turn. */
export const AGENT_TOOLS = [
  {
    function: {
      description: toolDescription("list_calendar_events", EXAM_ITEM_RULES_SHORT),
      name: "list_calendar_events",
      parameters: {
        properties: {
          days_ahead: { description: "Days forward from today when no dates are given (default 30, max 366)", type: "number" },
          end_date: { description: "Window end, YYYY-MM-DD, inclusive", type: "string" },
          start_date: { description: "Window start, YYYY-MM-DD — may be in the past", type: "string" },
        },
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("find_calendar_issues", EXAM_ITEM_RULES_SHORT),
      name: "find_calendar_issues",
      parameters: {
        properties: {
          end_date: { description: "Optional window end, YYYY-MM-DD", type: "string" },
          start_date: { description: "Optional window start, YYYY-MM-DD", type: "string" },
        },
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      // "Tell the student what you added and when" used to close this line, and
      // it was the loudest voice in the room on a syllabus import: the schema
      // description rides every turn, so it outranked anything the reply-side
      // prompt asked for. Fifty-one calls, fifty-one dates read back.
      description: toolDescription("add_calendar_event", EXAM_ITEM_RULES_SHORT),
      name: "add_calendar_event",
      parameters: {
        properties: {
          course: { description: "Optional course name", type: "string" },
          date: { description: "Event date, YYYY-MM-DD", type: "string" },
          kind: { description: "One of assignment, exam, rotation, class, other", type: "string" },
          note: { description: "Optional details", type: "string" },
          time: { description: "Optional time like '14:00' or '2:00 PM'", type: "string" },
          title: { description: "Event title", type: "string" },
        },
        required: ["title", "date"],
        type: "object",
      },
    },
    type: "function",
  },
  // ── Editing and removing what already exists ────────────────────────────────
  //
  // The descriptions below are deliberately flat and short. Two of this file's
  // schema lines have already steered the model badly — search_library's "use
  // this before answering anything" and add_calendar_event's date read-back —
  // because a tool description rides EVERY turn and outranks the system prompt.
  // A destructive tool that oversells itself is the worst version of that, so
  // none of these say "always", "whenever", or "make sure to".
  {
    function: {
      description: toolDescription("update_calendar_event", EXAM_ITEM_RULES_SHORT),
      name: "update_calendar_event",
      parameters: {
        properties: {
          cancel_date: {
            description:
              "For a REPEATING event only: mark this one meeting as not happening (a cancelled class, a holiday), "
              + "YYYY-MM-DD. The rest of the series is untouched. Use this instead of deleting — a repeating class is "
              + "one row, so deleting it removes every meeting for the whole term.",
            type: "string",
          },
          course: { description: "Course name, or empty string to clear it", type: "string" },
          date: { description: "New date, YYYY-MM-DD", type: "string" },
          event_id: { description: "The event's id from list_calendar_events", type: "string" },
          kind: { description: "One of assignment, exam, rotation, class, other", type: "string" },
          note: { description: "Details, or empty string to clear them", type: "string" },
          time: { description: "New time, or empty string to make it all-day", type: "string" },
          title: { description: "New title", type: "string" },
        },
        required: ["event_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("delete_calendar_event", EXAM_ITEM_RULES_SHORT),
      name: "delete_calendar_event",
      parameters: {
        properties: { event_id: { description: "The event's id from list_calendar_events", type: "string" } },
        required: ["event_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("get_study_record", EXAM_ITEM_RULES_SHORT),
      name: "get_study_record",
      parameters: { properties: {}, type: "object" },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("make_practice_test", EXAM_ITEM_RULES_SHORT),
      name: "make_practice_test",
      parameters: {
        properties: {
          question_count: { description: "How many questions (default 10, 3-25)", type: "number" },
          record: {
            description:
              "What you know of THIS student, in plain sentences — scores, their own miss diagnoses, what they "
              + "just struggled with in the conversation, what they asked for. The paper is aimed by this.",
            type: "string",
          },
          source: {
            description: 'A deck name, a note title, or "everything" for all decks and notes plus previously missed questions',
            type: "string",
          },
        },
        required: ["source"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("find_figure", EXAM_ITEM_RULES_SHORT),
      name: "find_figure",
      parameters: {
        properties: {
          limit: { description: "How many pictures to return (default 3, max 6)", type: "number" },
          query: {
            description:
              'What the picture SHOWS, in ordinary words — "loop of Henle", "steroid ring structure", '
              + '"insulin release curve". Not a file name. Leave empty with `source` set to see what '
              + "pictures one lecture holds.",
            type: "string",
          },
          source: {
            description: "Part of one lecture's file name, to look inside that lecture only",
            type: "string",
          },
        },
        type: "object",
      },
    },
    type: "function",
  },
] as const;

function clip(text: string, max = MAX_NOTE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeLibraryLeaf(value: string): string {
  return value.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
}

function safeLibraryFolder(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function usableSlides(raw: unknown) {
  return (Array.isArray(raw) ? raw : [])
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const title = str(row.title).trim().slice(0, 180);
      const bullets = (Array.isArray(row.bullets) ? row.bullets : [])
        .map((bullet) => str(bullet).trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 8);
      const speakerNotes = str(row.speaker_notes).trim().slice(0, 4_000);
      return title && (bullets.length || speakerNotes) ? [{ bullets, speakerNotes, title }] : [];
    })
    .slice(0, 40);
}

/** Today's substring arm — also the fallback whenever the semantic arm is unavailable. */
export async function lexicalLibrarySearch(query: string): Promise<LexicalHit[]> {
  const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("path,title,content")
    .eq("deleted", false)
    .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
    .limit(MAX_LIST);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const content = str(row.content);
    const at = content.toLowerCase().indexOf(query.toLowerCase());
    const snippet = at >= 0 ? content.slice(Math.max(0, at - 80), at + 160) : content.slice(0, 160);
    return { path: str(row.path), snippet: snippet.trim(), title: str(row.title) };
  });
}

/** Semantic arm. Returns [] on ANY failure — search must never go dark. */
async function semanticLibrarySearch(query: string): Promise<SemanticHit[]> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return [];
    const res = await fetch("/api/v1/library/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 8 }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { hits?: SemanticHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  } catch {
    return [];
  }
}
/** Attach each note's stable id to a list of path-keyed hits, in one query. */
async function withNoteIds<T extends { path: string }>(hits: T[]): Promise<(T & { id: string })[]> {
  if (hits.length === 0) return [];
  const { data } = await supabase
    .from("readable_library_documents")
    .select("id,path")
    .eq("deleted", false)
    .in("path", hits.map((hit) => hit.path));
  const idByPath = new Map((data ?? []).map((row) => [str(row.path), str(row.id)]));
  return hits.map((hit) => ({ ...hit, id: idByPath.get(hit.path) ?? "" }));
}
/** How much transcript one read hands back.
 *
 *  🔴 A BOUND, NOT A STYLE CHOICE. The lecture that exposed all of this is
 *  34,250 characters and it is a normal 47-minute class; a three-hour session is
 *  several times that. Returning a whole transcript would spend most of a turn's
 *  context on one tool result and leave no room to write anything from it. So a
 *  read is a WINDOW, and the reply says plainly how much is left, which is what
 *  lets the model decide whether to keep reading or start writing. */
const TRANSCRIPT_WINDOW_CHARS = 12_000;

/** The signed-in user id for THIS turn. readable_library_documents.user_id is
 *  NOT NULL with no auth.uid() default (unlike study_*), so every Library write
 *  must set it explicitly or the insert violates NOT NULL and the note never
 *  saves. Read from the cached session — no extra round-trip. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * The courses this student is actually taking, in their own words.
 *
 * Their calendar events' `course` field plus the top-level folders they made
 * themselves. Both are things they typed; nothing here is inferred, which is
 * what keeps course filing field-agnostic.
 *
 * NEVER THROWS — an empty list just means "file it where it is filed today".
 * Losing a note because a folder lookup timed out would be a far worse trade.
 */
export async function loadKnownCourses(): Promise<string[]> {
  try {
    const [events, folders] = await Promise.all([
      supabase.from("calendar_events").select("course").not("course", "is", null).limit(500),
      supabase.from("readable_library_documents").select("path").eq("deleted", false).limit(1000),
    ]);
    const top = new Set<string>();
    for (const row of folders.data ?? []) {
      const segments = str((row as { path?: string }).path).split("/").filter(Boolean);
      if (segments.length > 1) top.add(segments[0] as string);
    }
    return knownCourses((events.data ?? []).map((row) => (row as { course?: string }).course), [...top]);
  } catch {
    return [];
  }
}

/**
 * The course folder the documents attached to this turn already live in.
 *
 * Study items built from a lecture belong beside that lecture, and where it
 * lives is a fact the upload lane wrote down before the model ever ran — see
 * sourceCourseFolder for the incident this exists to stop.
 *
 * NEVER THROWS, same contract as loadKnownCourses: an empty string just means
 * "decide the folder the way you did before".
 */
export async function loadAttachedSourceFolder(sourceIds: readonly string[]): Promise<string> {
  if (sourceIds.length === 0) return "";
  try {
    const { data } = await supabase
      .from("library_sources")
      .select("folder_path")
      .in("id", [...sourceIds])
      .eq("deleted", false);
    return sourceCourseFolder((data ?? []).map((row) => (row as { folder_path?: string }).folder_path));
  } catch {
    return "";
  }
}
// ── Seeing and reshaping the Library tree ───────────────────────────────────

/** Every live row's path/kind/title, paged past the 1000-row cap. This is the
 *  authoritative read behind get_library_tree and the workspace overview. */
async function loadLibraryTreeDocs(): Promise<LibraryTreeDoc[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from("readable_library_documents")
      .select("id,path,kind,title")
      .eq("deleted", false)
      .order("path")
      .order("id")
      .range(from, to),
  );
  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return { kind: str(row.kind) || "note", path: str(row.path), title: str(row.title) };
  });
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

interface SubtreeRow {
  id: string;
  path: string;
  kind: string;
  title: string;
  deleted: boolean;
}

/** The folder's own row (if any) plus every row beneath it. `includeDeleted`
 *  exists because the (user_id, path) unique index counts trashed rows — a
 *  destination check that ignored them would promise a move the database
 *  then rejects halfway through. */
async function loadLibrarySubtree(path: string, opts: { includeDeleted: boolean }): Promise<SubtreeRow[]> {
  let ownQuery = supabase.from("readable_library_documents").select("id,path,kind,title,deleted").eq("path", path);
  if (!opts.includeDeleted) ownQuery = ownQuery.eq("deleted", false);
  const own = await ownQuery;
  if (own.error) throw new Error(own.error.message);
  const nested = await fetchAllRows((from, to) => {
    let query = supabase
      .from("readable_library_documents")
      .select("id,path,kind,title,deleted")
      .like("path", `${escapeLikePattern(path)}/%`);
    if (!opts.includeDeleted) query = query.eq("deleted", false);
    return query.order("path").order("id").range(from, to);
  });
  const byId = new Map<string, SubtreeRow>();
  for (const raw of [...(own.data ?? []), ...nested]) {
    const row = raw as Record<string, unknown>;
    const rowPath = str(row.path);
    // Belt and braces over the SQL. `LIKE 'test/%'` and `= 'test'` already
    // exclude a top-level note called `test.md`, but the rule that says so
    // lives in a pattern string; running every row past the same predicate the
    // tests pin means an escaping slip can never widen a rename's blast radius.
    if (!isInLibrarySubtree(rowPath, path)) continue;
    byId.set(str(row.id), {
      deleted: row.deleted === true,
      id: str(row.id),
      kind: str(row.kind) || "note",
      path: rowPath,
      title: str(row.title),
    });
  }
  return [...byId.values()];
}

/**
 * Rename or move one folder subtree, safely:
 * - the destination must be COMPLETELY free, trash included, before anything
 *   moves (a mid-move unique-index collision is how trees end up half-moved);
 * - updates run sequentially so a failure reports exactly how far it got;
 * - a rename updates the folder page's TITLE too — the fix for the
 *   two-pages-one-folder corruption the UI's own rename had (a folder page is
 *   recognized by name match, so a rename that only rewrote paths silently
 *   orphaned the page and a fresh empty one appeared on next open);
 * - stored source files follow via remapLibrarySourceFolders, exactly as the
 *   Library page's own folder operations do.
 */
async function relocateLibraryFolder(
  source: string,
  destination: string,
  userId: string,
  verb: "renamed" | "moved",
) {
  if (destination === source) return { note: "It is already there.", [verb]: false };
  if (`${destination}/`.startsWith(`${source}/`)) return { error: "A folder can't move inside itself." };
  const taken = await loadLibrarySubtree(destination, { includeDeleted: true });
  if (taken.length > 0) {
    const inTrash = taken.every((row) => row.deleted);
    return {
      error: `Something already uses '${destination}'${inTrash ? " (in the student's trash)" : ""}. Pick a different name.`,
    };
  }
  const rows = await loadLibrarySubtree(source, { includeDeleted: false });
  if (rows.length === 0) return { error: `No folder at '${source}'. Use get_library_tree to see what exists.` };
  const plan = planFolderRelocation(rows, source, destination, verb);
  let movedCount = 0;
  for (const step of plan) {
    const patch: Record<string, unknown> = { path: step.path, updated_at: new Date().toISOString() };
    if (step.title !== undefined) patch.title = step.title;
    const { error } = await supabase.from("readable_library_documents").update(patch).eq("id", step.id);
    if (error) {
      return {
        error: `Stopped partway: ${movedCount} of ${plan.length} items moved before "${error.message}". `
          + "Run get_library_tree to see the current state before retrying.",
      };
    }
    movedCount += 1;
  }
  await remapLibrarySourceFolders(userId, (folderPath) =>
    folderPath === source
      ? destination
      : folderPath.startsWith(`${source}/`)
        ? `${destination}${folderPath.slice(source.length)}`
        : folderPath);
  return { from: source, items: movedCount, to: destination, [verb]: true };
}
async function availableNotePath(userId: string, title: string, folder: string, currentId: string) {
  const leaf = safeLibraryLeaf(title);
  const dir = safeLibraryFolder(folder);
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const name = suffix === 1 ? leaf : `${leaf} ${suffix}`;
    const path = `${dir ? `${dir}/` : ""}${name}.md`;
    const { data, error } = await supabase
      .from("readable_library_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || str(data.id) === currentId) return { path, title: name };
  }
  throw new Error("Couldn't find an available note name.");
}
/** Every deck and every card, paged — the shared read behind list_study_decks
 *  and get_study_overview. The old version counted cards through a .limit(2000)
 *  query, which silently under-reported every account past 2,000 cards. */
async function loadStudyRows() {
  const [deckRows, cardRows] = await Promise.all([
    fetchAllRows((a, b) => supabase.from("study_decks").select("id,name").order("name").order("id").range(a, b)),
    fetchAllRows((a, b) => supabase.from("study_cards").select("id,deck_id,due_at,suspended,lapses").order("id").range(a, b)),
  ]);
  return {
    cards: cardRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        deck_id: str(row.deck_id),
        due_at: typeof row.due_at === "string" ? row.due_at : null,
        lapses: Number(row.lapses) || 0,
        suspended: row.suspended === true,
      } satisfies OverviewCardRow;
    }),
    decks: deckRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return { id: str(row.id), name: str(row.name) } satisfies OverviewDeckRow;
    }),
  };
}
function matchDeckName(wanted: string, names: string[]): string | null {
  const exact = names.find((name) => name === wanted);
  if (exact) return exact;
  const lowered = wanted.toLowerCase();
  const insensitive = names.filter((name) => name.toLowerCase() === lowered);
  if (insensitive.length === 1) return insensitive[0] ?? null;
  const leaves = names.filter((name) => (name.split("::").pop() ?? name).toLowerCase() === lowered);
  return leaves.length === 1 ? (leaves[0] ?? null) : null;
}
/** For a test artifact: how many sittings and how the last one went, straight
 *  from the content column the list query already fetches. Empty object for
 *  anything that is not a taken test, so other kinds gain no noise. */
function testAttemptSummary(content: unknown): { attempts?: number; last_score?: string; last_taken_at?: string } {
  if (!content || typeof content !== "object") return {};
  const attempts = (content as { attempts?: unknown }).attempts;
  if (!Array.isArray(attempts) || attempts.length === 0) return {};
  const last = attempts[attempts.length - 1] as { at?: unknown; score?: unknown; total?: unknown };
  const summary: { attempts: number; last_score?: string; last_taken_at?: string } = { attempts: attempts.length };
  if (typeof last?.score === "number" && typeof last?.total === "number") summary.last_score = `${last.score}/${last.total}`;
  if (typeof last?.at === "string") summary.last_taken_at = last.at;
  return summary;
}
type AgentFlashcard = {
  front: string;
  back: string;
  card_type?: "basic" | "cloze" | "reversed";
};
/** Every event relevant to [from, to]: rows dated inside the window, paged
 *  past the 1000-row cap, PLUS every recurring rule anchored before it whose
 *  weekly meetings may land inside (a rule's `until` lives in jsonb, so that
 *  last filter happens in expandRecurringEvents, not SQL — recurring rows are
 *  a handful per account). The model never sees pagination: this is the whole
 *  answer or an {error}. */
async function loadCalendarRangeEvents(from: string, to: string) {
  const columns = "id,title,date,time,end_time,kind,course,note,source,recurrence";
  const inWindow = await fetchAllRows((a, b) =>
    supabase.from("calendar_events").select(columns)
      .gte("date", from).lte("date", to)
      .order("date").order("id").range(a, b));
  const earlierRules = await fetchAllRows((a, b) =>
    supabase.from("calendar_events").select(columns)
      .not("recurrence", "is", null).lt("date", from)
      .order("date").order("id").range(a, b));
  const byId = new Map<string, CalendarEventRow>();
  for (const raw of [...inWindow, ...earlierRules]) {
    const row = raw as CalendarEventRow;
    byId.set(str(row.id), row);
  }
  return [...byId.values()].flatMap((row) => {
    const event = calendarEventFromRow(row);
    return event ? [event] : [];
  });
}

/** Above this many expanded rows the reply asks the model to narrow the
 *  window instead of flooding the transcript — and says so out loud. */
const AGENT_EVENT_ROWS_CAP = 500;

/** SQL bounds for "load the whole calendar". These are the limits of the
 *  `date` column, NOT a claim about coverage — what the account actually holds
 *  is derived from the rows themselves by calendarCoverage, and that is what
 *  the model is told. */
const EARLIEST_POSSIBLE_DATE = "0001-01-01";
const LATEST_POSSIBLE_DATE = "9999-12-31";

async function listCalendarEvents(args: Record<string, unknown>) {
  const today = localToday();
  const window = resolveCalendarWindow(
    { days_ahead: Number(args.days_ahead), end_date: str(args.end_date), start_date: str(args.start_date) },
    today,
  );
  try {
    const events = eventsInWindow(await loadCalendarRangeEvents(window.from, window.to), window.from, window.to);
    const clipped = events.length > AGENT_EVENT_ROWS_CAP;
    return {
      complete: !clipped,
      count: events.length,
      events: clipped ? events.slice(0, AGENT_EVENT_ROWS_CAP) : events,
      today,
      window,
      ...(clipped
        ? { note: `Showing the first ${AGENT_EVENT_ROWS_CAP} of ${events.length} events — narrow the window to see the rest.` }
        : {}),
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't read the calendar." };
  }
}

async function findCalendarIssuesTool(args: Record<string, unknown>) {
  const start = str(args.start_date).trim();
  const end = str(args.end_date).trim();
  try {
    // Load everything the account has, then let the rows say how far back the
    // answer can honestly reach. The old code opened this window at 0001-01-01
    // and reported that back as the range it had audited — see calendarCoverage.
    const events = await loadCalendarRangeEvents(EARLIEST_POSSIBLE_DATE, LATEST_POSSIBLE_DATE);
    const coverage = calendarCoverage(events, { from: start, to: end });
    return {
      ...findCalendarIssues(events, { from: coverage.from, to: coverage.to }),
      // Stored rows, not expanded meetings — a repeating class is one row here
      // and many dates inside the audit. `coverage` says which dates.
      calendar_rows: events.length,
      coverage,
      note:
        "Repeating classes are expanded into the dates they actually meet before this audit runs, and a finding that "
        + "recurs every week is reported ONCE with a `repeats` count rather than per meeting. Every id is a real event "
        + "id, so a recurring finding's id addresses the whole series. conflicting_versions means sources disagree "
        + "about WHEN one exam or assignment is — ask the student which date wins before changing anything.",
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't audit the calendar." };
  }
}

/**
 * The compact snapshot — exported because sendChatTurn also injects it on
 * workspace turns, so the model starts oriented instead of blind.
 *
 * ORIENTATION ONLY, and the payload says so: counts are complete, the lists
 * are samples, and anything that requires completeness must go back through
 * get_library_tree / list_calendar_events / get_study_overview. This must
 * never become another silently-capped packet the model mistakes for full
 * state (owner 2026-08-05).
 */
export async function loadWorkspaceOverview() {
  const today = localToday();
  const quarter = resolveCalendarWindow({ days_ahead: 90 }, today);
  const soonEnd = resolveCalendarWindow({ days_ahead: 21 }, today).to;
  const [courses, libraryDocs, deckRows, cardRows, artifactRows, quarterEvents, pastCount, futureCount] =
    await Promise.all([
      loadKnownCourses(),
      loadLibraryTreeDocs(),
      fetchAllRows((a, b) => supabase.from("study_decks").select("id,name").order("name").order("id").range(a, b)),
      fetchAllRows((a, b) => supabase.from("study_cards").select("id,deck_id,due_at,suspended,lapses").order("id").range(a, b)),
      fetchAllRows((a, b) => supabase.from("study_artifacts").select("id,kind").order("id").range(a, b)),
      loadCalendarRangeEvents(quarter.from, quarter.to),
      supabase.from("calendar_events").select("id", { count: "exact", head: true }).lt("date", today),
      supabase.from("calendar_events").select("id", { count: "exact", head: true }).gte("date", today),
    ]);

  const expanded = eventsInWindow(quarterEvents, quarter.from, quarter.to);
  const soon = expanded.filter((event) => event.date <= soonEnd);
  const exams = expanded.filter((event) => event.kind === "exam");
  const library = summarizeLibraryTree(libraryDocs);
  const topFolders = library.folders.filter((folder) => !folder.path.includes("/"));
  const inboxNotes = library.folders.find((folder) => folder.path === "Inbox")?.total_notes ?? 0;

  const study = studyOverview(
    deckRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return { id: str(row.id), name: str(row.name) } satisfies OverviewDeckRow;
    }),
    cardRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        deck_id: str(row.deck_id),
        due_at: typeof row.due_at === "string" ? row.due_at : null,
        lapses: Number(row.lapses) || 0,
        suspended: row.suspended === true,
      } satisfies OverviewCardRow;
    }),
    new Date(),
  );
  const testCount = artifactRows.filter((raw) => str((raw as Record<string, unknown>).kind) === "test").length;

  const needsAttention: string[] = [];
  if (inboxNotes > 0) needsAttention.push(`${inboxNotes} item${inboxNotes === 1 ? "" : "s"} waiting in Inbox`);
  if (study.totals.due > 0) needsAttention.push(`${study.totals.due} card${study.totals.due === 1 ? "" : "s"} due for review`);

  return {
    calendar: {
      next_3_weeks: soon.slice(0, 25).map(({ course, date, kind, time, title }) => ({
        date, kind, title, ...(course ? { course } : {}), ...(time ? { time } : {}),
      })),
      next_3_weeks_count: soon.length,
      past_events: pastCount.count ?? 0,
      today_and_future_events: futureCount.count ?? 0,
      upcoming_exams: exams.slice(0, 15).map(({ course, date, title }) => ({ date, title, ...(course ? { course } : {}) })),
    },
    courses,
    library: {
      inbox_notes: inboxNotes,
      root_notes: library.root_notes,
      top_folders: topFolders.map(({ path, total_notes }) => ({ notes: total_notes, path })),
      total_notes: library.total_notes,
    },
    needs_attention: needsAttention,
    note:
      "Snapshot for ORIENTATION only. The counts are complete; the lists are samples. Before reorganizing, reconciling, "
      + "or answering about 'everything', read the full state with get_library_tree, list_calendar_events, or get_study_overview.",
    study: {
      decks: study.decks.slice(0, 40),
      folders: study.folders,
      tests: testCount,
      totals: study.totals,
      ...(study.decks.length > 40 ? { decks_note: `Showing 40 of ${study.decks.length} decks — get_study_overview lists all.` } : {}),
    },
    today,
  };
}
const EVENT_KINDS = new Set(["assignment", "exam", "rotation", "class", "other"]);

async function addCalendarEvent(args: Record<string, unknown>) {
  const title = str(args.title).trim().slice(0, 300);
  const date = str(args.date).trim();
  if (!title) return { error: "Event title is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date must be YYYY-MM-DD." };
  const kindRaw = str(args.kind).trim().toLowerCase();

  // Look before writing (owner 2026-08-03: conflicts must be recognized, not
  // discovered later on the calendar). Same rules as the syllabus importer,
  // via the same lib/workspace/calendar-conflicts helpers: an event with this
  // name already on this date is NOT added again; a clock overlap is added
  // and reported so the model can say so. One date's rows is a tiny read.
  const time = str(args.time).trim().slice(0, 40) || null;
  const sameDay = await supabase.from("calendar_events").select("id,title,date,time,end_time").eq("date", date);
  if (!sameDay.error) {
    const existing: CalendarConflictEvent[] = (sameDay.data ?? []).map((row) => ({
      date: str(row.date),
      id: str(row.id),
      kind: "other",
      title: str(row.title),
      ...(row.time ? { time: str(row.time) } : {}),
      ...(row.end_time ? { endTime: str(row.end_time) } : {}),
    }));
    const incoming: CalendarConflictEvent = { date, id: "incoming", kind: "other", title, ...(time ? { time } : {}) };
    const split = splitCalendarConflicts([incoming], existing);
    if (split.duplicates.length > 0) {
      return {
        added: false,
        already_on_calendar: true,
        instruction: `"${title}" is already on the calendar for ${date} — nothing was added. Tell the student it was already there.`,
      };
    }
    const clash = split.clashes[0];
    if (clash) {
      const clashNote = `Heads up: it overlaps "${clash.existing.title}"${clash.existing.time ? ` at ${clash.existing.time}` : ""} on ${date}. Mention this to the student in one short line.`;
      return addCalendarEventRow(args, { date, kindRaw, time, title }, clashNote);
    }
  }
  return addCalendarEventRow(args, { date, kindRaw, time, title }, null);
}

type CalendarConflictEvent = Parameters<typeof splitCalendarConflicts>[0][number];

async function addCalendarEventRow(
  args: Record<string, unknown>,
  fields: { date: string; kindRaw: string; time: string | null; title: string },
  clashNote: string | null,
) {
  const { date, kindRaw, time, title } = fields;
  const { data, error } = await supabase.from("calendar_events").insert({
    course: str(args.course).trim().slice(0, 200) || null,
    date,
    kind: EVENT_KINDS.has(kindRaw) ? kindRaw : "other",
    note: str(args.note).trim().slice(0, 4000) || null,
    // "manual", not "agent", and this is load-bearing: calendar-workspace routes
    // source === "agent" to EventViewDialog, which takes only onClose — no edit,
    // no delete. Every event chat wrote was therefore permanent, while the dialog
    // told the student to "ask it to change this" with no update or delete tool
    // in AGENT_TOOLS to change it with. The student asked for this event, so it
    // is theirs to correct. Provenance stays readable in `note`.
    source: "manual",
    time,
    title,
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't add that event." };
  // NO `artifact` here, deliberately (owner 2026-07-28: "it shouldnt output as
  // an artifact in sidebar either"). Every other write returns one because a
  // deck, test or note has its own destination that a card is the only route
  // to. An event does not: it is one row on a calendar the student already
  // has a tab for, so the card added a click and a duplicate rather than a way
  // in. Dropping it here clears BOTH surfaces at once — the transcript cards
  // and the right rail read the same `outputs` array (chat-api.ts).
  return {
    added: true,
    date,
    // Owner 2026-07-28: "syllabus and calendar events should not be outputted
    // into chat, the chat should just say 'ive put the events into the
    // calendar'". Steering it from the TOOL RESULT rather than stripping the
    // model's reply afterwards — stripping throws away real answers when the
    // same turn was doing something else too.
    //
    // It says "no card" out loud because CHAT_TOOLS_PROMPT promises one for
    // saves in general, and that promise is now false for this tool alone. A
    // prompt that over-claims what a tool did is how the model starts
    // narrating the gap — listing the dates back to prove the save happened.
    instruction:
      "Saved. This tool shows the student NO card and NO artifact — the calendar itself is where the event lives, "
      + "and they already have it open. Do NOT write the event back: no dates, no table, no list. "
      + "When every event in this batch is in, reply with ONE short line: \"I've put the events into your calendar.\" "
      + "Add a second short line only if something could not be added, naming just those."
      + (clashNote ? ` ${clashNote}` : ""),
    title,
  };
}

/**
 * Resolve the handle a destructive verb was given.
 *
 * Returns the row's id only when it is a real uuid AND the row exists and
 * belongs to this student. A model that passed a title, a list position, or an
 * id it half-remembered gets a readable error naming the tool that produces
 * real ids, instead of a query that reaches the database and matches something
 * the student never mentioned.
 */
async function resolveRow(
  table: "calendar_events" | "readable_library_documents" | "study_cards" | "study_artifacts",
  rawId: unknown,
  hint: string,
): Promise<{ error: string } | { id: string; row: Record<string, unknown> }> {
  const id = workspaceId(rawId);
  if (!id) return { error: `That is not a valid id. ${hint}` };
  const query = supabase.from(table).select("*").eq("id", id);
  const { data, error } = await (table === "readable_library_documents"
    ? query.eq("deleted", false)
    : query).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `Nothing found with that id — it may already be gone. ${hint}` };
  return { id, row: data as Record<string, unknown> };
}

/**
 * "My Thursday lab is cancelled this week."
 *
 * A repeating class is one row, so deleting it to skip one meeting would wipe
 * the term. This is the only way an exception gets written, and it is an
 * argument on the existing update rather than a new tool: the series is edited,
 * not destroyed, and removing the date brings the meeting back. `until` is
 * untouched — the rule still runs to the end of term.
 */
async function cancelOccurrence(row: Record<string, unknown>, id: string, date: string) {
  const recurrence = parseRecurrence(row.recurrence);
  if (!recurrence) return { error: "That event does not repeat, so there is no single meeting to cancel — delete it instead." };
  const except = [...new Set([...(recurrence.except ?? []), date])].sort();
  const { error } = await supabase
    .from("calendar_events")
    .update({ recurrence: { ...recurrence, except } })
    .eq("id", id);
  if (error) return { error: error.message };
  return {
    cancelled: date,
    instruction:
      "That one meeting is now marked as not happening; the rest of the series is untouched. Do not read the calendar "
      + "back — reply with one short line.",
    title: str(row.title),
    updated: true,
  };
}

async function updateCalendarEventTool(args: Record<string, unknown>) {
  const found = await resolveRow("calendar_events", args.event_id, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  const cancelDate = str(args.cancel_date).trim();
  if (cancelDate) {
    if (!isDateKey(cancelDate)) return { error: "cancel_date must be a real calendar date in YYYY-MM-DD form." };
    return await cancelOccurrence(found.row as Record<string, unknown>, found.id, cancelDate);
  }
  // Strip the handle before building the patch: `event_id` is how we found the
  // row, not a field on it, and letting it through would make a call that
  // changes nothing look like a change. `cancel_date` goes the same way — it is
  // handled above and is not a column.
  const fields = Object.fromEntries(
    Object.entries(args).filter(([key]) => key !== "event_id" && key !== "cancel_date"),
  );
  const patch = calendarEventPatch(fields);
  if (isPatchFailure(patch)) return patch;
  const { error } = await supabase.from("calendar_events").update(patch).eq("id", found.id);
  if (error) return { error: error.message };
  return {
    changed: Object.keys(patch),
    // Same reasoning as add_calendar_event: the calendar is where they see it,
    // so do not read the event back at them.
    instruction:
      "Updated. Do not read the event back — the calendar shows it. Reply with one short line saying what changed.",
    title: str(patch.title) || str(found.row.title),
    updated: true,
  };
}

async function deleteCalendarEventTool(args: Record<string, unknown>) {
  const found = await resolveRow("calendar_events", args.event_id, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  const { error } = await supabase.from("calendar_events").delete().eq("id", found.id);
  if (error) return { error: error.message };
  return { deleted: true, title: str(found.row.title) };
}
/** The deck a name refers to, or an error the model can act on. */
async function findDeck(deckName: string) {
  const wanted = deckName.trim();
  if (!wanted) return { error: "Which deck? Use list_study_decks to see the names." };
  const { data, error } = await supabase.from("study_decks").select("id,name").limit(200);
  if (error) return { error: error.message };
  const matches = (data ?? []).filter((deck) =>
    str(deck.name).toLowerCase() === wanted.toLowerCase()
    || str(deck.name).toLowerCase().endsWith(`::${wanted.toLowerCase()}`)
  );
  const only = matches.length === 1 ? matches[0] : undefined;
  if (!only) {
    return { error: `No single Study deck matched '${wanted}'. Use the full name from list_study_decks.` };
  }
  return { id: str(only.id), name: str(only.name) };
}
/**
 * Look up what a pending delete is about to destroy, for the confirmation card.
 *
 * Best effort: a failed lookup costs the card its label, never the student their
 * confirmation. The guard still runs when they approve.
 */
async function pendingDeleteFor(name: string, args: Record<string, unknown>): Promise<PendingDelete | null> {
  const spec = destructiveSpec(name);
  if (!spec) return null;
  const handle = args[spec.handle];
  let label = spec.table === null ? str(handle) : "";
  if (spec.table !== null) {
    const id = workspaceId(handle);
    if (id) {
      const { data } = await supabase.from(spec.table).select(spec.labelColumn).eq("id", id).maybeSingle();
      label = str((data as Record<string, unknown> | null)?.[spec.labelColumn]);
    }
  }
  return {
    args,
    recoverable: spec.recoverable,
    target: describeTarget(spec.noun, label),
    tool: name,
  };
}


/* ------------------------------------------------------------------ */
/* Showing a picture from the learner's own lectures                   */
/* (owner 2026-08-31: "it should be able to pull images that it has    */
/*  stored into chat when necessary")                                  */
/* ------------------------------------------------------------------ */

/** Enough to answer with, few enough that a reply is not a gallery. */
const FIGURE_LIMIT_DEFAULT = 3;
const FIGURE_LIMIT_MAX = 6;

/** Descriptions are a paragraph of vision output; the model needs the gist, not the essay. */
const FIGURE_DESCRIPTION_CHARS = 320;

interface FigureRow {
  source_id: string;
  file_name: string;
  unit: number | null;
  description: string;
  path: string;
  width: number | null;
  height: number | null;
}

/**
 * Pictures from this student's own uploaded lectures.
 *
 * 🔴 THE `markdown` FIELD IS THE WHOLE INTERFACE, AND IT IS PRE-BUILT ON PURPOSE. Handing the model
 * a bare URL and trusting it to assemble an image link is the failure this avoids: it writes
 * `[see figure](url)` (a link, not a picture), or re-types a 300-character signed URL and corrupts
 * the signature, or describes the diagram in prose and never shows it. A finished string it is told
 * to paste verbatim has one way to go right and no interesting ways to go wrong.
 *
 * 🔴 THE SEARCH RUNS IN POSTGRES, NOT HERE. `search_figures` walks the jsonb; the alternative is
 * downloading every parsed structure the learner owns — tens to hundreds of kilobytes each — to
 * return one picture. It is SECURITY INVOKER, so row-level security scopes it to the caller and no
 * ownership check is written in this file where it could be forgotten.
 *
 * 🔴 A FAILURE TO SIGN DROPS THE ROW RATHER THAN RETURNING IT WITHOUT A PICTURE. A result that
 * carries a description and no image is exactly what makes the model promise a diagram it cannot
 * show. Better a shorter list, or an empty one the description tells it to admit to.
 */
async function findFigure(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const source = typeof args.source === "string" ? args.source.trim() : "";
  const asked = typeof args.limit === "number" && Number.isFinite(args.limit)
    ? Math.round(args.limit)
    : FIGURE_LIMIT_DEFAULT;
  const limit = Math.max(1, Math.min(asked, FIGURE_LIMIT_MAX));

  const { data, error } = await supabase.rpc("search_figures", {
    p_limit: limit,
    p_query: query,
    p_source: source,
  });
  if (error) return { error: `Could not look through your lectures: ${error.message}` };

  const rows = (data ?? []) as FigureRow[];
  const found: unknown[] = [];
  for (const row of rows) {
    const url = await figureAssetUrl(row.path);
    if (!url) continue;
    const description = clip(row.description.trim(), FIGURE_DESCRIPTION_CHARS);
    found.push({
      description,
      from: row.file_name,
      // 🔴 THE ALT TEXT IS THE DESCRIPTION, TRIMMED TO ONE LINE. A markdown image whose alt text
      // contains a newline or an unbalanced bracket stops being an image mid-render.
      markdown: `![${description.replace(/[\r\n]+/g, " ").replace(/[[\]]/g, "")}](${url})`,
      ...(row.unit !== null ? { page: row.unit + 1 } : {}),
      ...(row.width && row.height ? { size: `${row.width}x${row.height}` } : {}),
    });
  }

  if (found.length === 0) {
    return {
      figures: [],
      note: query || source
        ? "No picture in this student's own lectures matches that. Say so plainly rather than describing one from memory."
        : "This student has no stored lecture pictures yet.",
    };
  }
  return {
    figures: found,
    // Repeated at the point of use because a rule in a tool description competes with everything
    // else in the system prompt, and this one has exactly one chance to be followed.
    note: "Paste each `markdown` value verbatim on its own line, beside the point it illustrates. Do not rewrite the URL.",
  };
}

/**
 * Tools that CHANGE the student's Study page.
 *
 * These write straight to Supabase, which is correct — but the Study store
 * holds its list in memory and, unlike the Library store, keeps no live channel
 * open to hear about outside writes. Without a nudge the page shows a stale
 * list, which is how a quiz the chat genuinely saved was not on the Tests page
 * (owner 2026-08-01).
 *
 * One set in one place, checked at the dispatch site — the same reasoning as
 * the confirmation gate below. A per-handler call is one a future tool forgets,
 * and forgetting it means silently losing the student's work on screen.
 */
const STUDY_WRITING_TOOLS = new Set([
  "add_flashcards",
  "add_mindmap",
  "add_practice_test",
  "make_practice_test",
  "delete_flashcard",
  "delete_study_artifact",
  "delete_study_deck",
  "edit_flashcard",
  "move_study_artifact",
  "move_study_deck",
  "rename_study_deck",
]);

/* ------------------------------------------------------------------ */
/* The examiner pair (owner 2026-08-31: "DeepSeek should know what to  */
/* do based on the given prompts and on its given tool set")           */
/* ------------------------------------------------------------------ */

/** How many test artifacts the record reads back. Newest first; a student with
 *  forty old papers is asking about the recent ones. */
const RECORD_TESTS = 12;
/** Misses quoted per paper — enough to aim at, not a transcript. */
const RECORD_MISSES = 6;

/**
 * The student's study record, compact enough to think with.
 *
 * 🔴 THE DIAGNOSES ARE THE POINT. Scores say how it went; the student's own
 * one-tap miss labels say WHY, and that is what lets the model choose between
 * a straight re-ask and a different angle. This is read-only and cheap: the
 * whole point of giving the model this tool is that IT decides when the
 * conversation calls for looking.
 */
async function getStudyRecord(): Promise<unknown> {
  const [deckRows, cardRows, artifactResult] = await Promise.all([
    fetchAllRows((a, b) => supabase.from("study_decks").select("id,name").order("name").order("id").range(a, b)),
    fetchAllRows((a, b) => supabase.from("study_cards").select("id,deck_id,due_at,suspended").order("id").range(a, b)),
    supabase
      .from("study_artifacts")
      .select("id,title,content,updated_at")
      .eq("kind", "test")
      .order("updated_at", { ascending: false })
      .limit(RECORD_TESTS),
  ]);
  if (artifactResult.error) throw new Error(artifactResult.error.message);
  const now = Date.now();
  const decks = deckRows.map((row) => {
    const cards = cardRows.filter((card) => str(card.deck_id) === str(row.id) && card.suspended !== true);
    const due = cards.filter((card) => new Date(str(card.due_at)).getTime() <= now).length;
    return { cards: cards.length, due, name: str(row.name) };
  });
  const tests = (artifactResult.data ?? []).flatMap((row) => {
    const content = parseTestContent(row.content);
    if (!content) return [];
    const best = bestAttempt(content.attempts);
    const misses = missedFacts(content.questions, content.attempts)
      .slice(0, RECORD_MISSES)
      .map((miss) => ({
        question: miss.q.slice(0, 120),
        ...(miss.why ? { student_diagnosis: MISS_KIND_LABEL[miss.why] } : {}),
      }));
    return [
      {
        attempts: content.attempts.length,
        ...(best ? { best_score: `${best.score}/${best.total}` } : {}),
        ...(misses.length ? { latest_misses: misses } : {}),
        questions: content.questions.length,
        title: str(row.title),
      },
    ];
  });
  if (decks.length === 0 && tests.length === 0) {
    return { decks, note: "The record is empty — no decks and no tests yet. That is a fact about the account, not a failure.", tests };
  }
  return { decks, tests };
}

/** Resolve what a paper is written FROM. A deck name, a note title, or the
 *  whole workspace with earlier misses brought back — never an invented one. */
async function materialForTestSource(source: string): Promise<{ material: StudyMaterial; title: string } | { error: string }> {
  const wanted = source.trim().toLowerCase();
  const [deckRows, cardRows] = await Promise.all([
    fetchAllRows((a, b) => supabase.from("study_decks").select("id,name").order("name").order("id").range(a, b)),
    fetchAllRows((a, b) => supabase.from("study_cards").select("id,deck_id,front,back,suspended").order("id").range(a, b)),
  ]);
  const cardsOf = (deckId: string) =>
    cardRows
      .filter((card) => str(card.deck_id) === deckId && card.suspended !== true)
      .map((card) => ({ back: str(card.back), front: str(card.front) }));

  if (wanted === "everything") {
    const parts: StudyMaterial[] = deckRows
      .map((row) => ({ cards: cardsOf(str(row.id)), name: str(row.name) }))
      .filter((entry) => entry.cards.length > 0)
      .map((entry) => deckMaterial(entry.name, entry.cards));
    const { data: noteRows, error: noteError } = await supabase
      .from("readable_library_documents")
      .select("title,content")
      .eq("deleted", false)
      .limit(12);
    if (noteError) throw new Error(noteError.message);
    for (const row of noteRows ?? []) {
      const content = str(row.content);
      if (content.trim()) parts.push(noteMaterial(str(row.title), content));
    }
    if (parts.length === 0) {
      return { error: "There is nothing to build from yet — no deck has cards and no notes exist." };
    }
    const { data: testRows, error: testError } = await supabase
      .from("study_artifacts")
      .select("content")
      .eq("kind", "test")
      .order("updated_at", { ascending: false })
      .limit(RECORD_TESTS);
    if (testError) throw new Error(testError.message);
    const missed = (testRows ?? []).flatMap((row) => {
      const content = parseTestContent(row.content);
      return content ? missedFacts(content.questions, content.attempts) : [];
    });
    return { material: mixedReviewMaterial(parts, missed), title: "Mixed review — practice test" };
  }

  const deck = deckRows.find((row) => str(row.name).trim().toLowerCase() === wanted);
  if (deck) {
    const cards = cardsOf(str(deck.id));
    if (cards.length === 0) return { error: `The deck "${str(deck.name)}" has no cards to build from.` };
    return { material: deckMaterial(str(deck.name), cards), title: `${str(deck.name)} — practice test` };
  }
  const { data: noteRows, error: noteError } = await supabase
    .from("readable_library_documents")
    .select("title,content")
    .eq("deleted", false)
    .ilike("title", source.trim())
    .limit(1);
  if (noteError) throw new Error(noteError.message);
  const note = noteRows?.[0];
  if (note && str(note.content).trim()) {
    return { material: noteMaterial(str(note.title), str(note.content)), title: `${str(note.title)} — practice test` };
  }
  return { error: `Nothing is named "${source}". get_study_record lists the decks; or pass "everything".` };
}

/**
 * Write a paper and hand it to the conversation.
 *
 * 🔴 THE MODEL'S OWN `record` AIMS IT. This tool does not decide composition —
 * the examiner charter in the generation prompt does, from whatever record the
 * calling model wrote out of the conversation and get_study_record. Code here
 * only resolves the material, runs the generation, and files the artifact.
 *
 * 🔴 `produced_test` IS FOR THE CANVAS, NOT THE MODEL. The tool round carries
 * it out so the reply can grow a card the student presses to sit the paper —
 * the conversation is where results live (owner 2026-08-31, picking exactly
 * that over reviving a Tests page).
 */
async function makePracticeTest(args: Record<string, unknown>): Promise<unknown> {
  const source = str(args.source).trim();
  if (!source) return { error: 'Pass source: a deck name, a note title, or "everything".' };
  const requested = Number(args.question_count);
  const questionCount = Number.isFinite(requested) ? Math.min(Math.max(Math.round(requested), 3), 25) : 10;
  const record = typeof args.record === "string" && args.record.trim() ? args.record.trim() : undefined;

  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return { error: "The student is not signed in." };

  const resolved = await materialForTestSource(source);
  if ("error" in resolved) return resolved;

  const createArtifact = async (input: CreateArtifactInput): Promise<StudyArtifact> => {
    const { data, error } = await supabase
      .from("study_artifacts")
      .insert({
        content: input.content ?? null,
        group_name: input.groupName?.trim() ?? "",
        kind: input.kind,
        status: input.status ?? "draft",
        title: input.title,
        user_id: uid,
      })
      .select("id,kind,group_name,title,status,content,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      content: data.content ?? null,
      createdAt: str(data.created_at),
      groupName: str(data.group_name),
      id: str(data.id),
      kind: input.kind,
      status: "draft",
      title: str(data.title),
      updatedAt: str(data.updated_at),
    };
  };
  const updateArtifact = async (artifactId: string, patch: { content?: unknown; status?: "draft" | "ready" }) => {
    const { error } = await supabase
      .from("study_artifacts")
      .update({
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.status ? { status: patch.status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", artifactId);
    if (error) throw new Error(error.message);
  };
  const deleteArtifact = async (artifactId: string) => {
    await supabase.from("study_artifacts").delete().eq("id", artifactId);
  };

  const artifactId = await generateStudyArtifact({
    createArtifact,
    deleteArtifact,
    kind: "test",
    material: resolved.material,
    questionCount,
    ...(record ? { testOpts: { record } } : {}),
    title: resolved.title,
    uid,
    updateArtifact,
  });

  return {
    made: resolved.title,
    note: "The card to sit it is in this conversation — point at it in one sentence, and never read the questions out.",
    produced_test: { artifact_id: artifactId, title: resolved.title },
  };
}

/** Run one tool call; ALWAYS resolves to a JSON-stringifiable result (errors
 *  become `{error}` so the model can react instead of the turn dying). */
export async function executeAgentTool(
  call: AgentToolCall,
  /** `confirmed` is set ONLY by the student's click on the confirmation card.
   *  `sourceFolder` is set only by the turn itself, from the attachments the
   *  student actually sent. The model can send neither, which is the entire
   *  point of both: a folder it could write is a folder it could invent. */
  options: AgentToolOptions = {},
): Promise<unknown> {
  const args = parseArgs(call.arguments);
  // 🔴 INSIDE THE TRY, and that is not a formatting preference. This file's
  // contract is that a tool NEVER throws — a failure comes back as {error} so
  // the model can react, instead of the turn dying with an empty bubble. The
  // gate does a label lookup over the network, so a blip on that lookup outside
  // the try would break the contract at exactly the moment a delete was pending.
  try {
    // THE CONFIRMATION GATE — one place, not a check inside each delete
    // handler. A per-handler check is one a future tool can forget, and the cost
    // of forgetting is a delete with no confirmation at all. Adding a name to
    // DESTRUCTIVE_TOOLS is what puts it behind this line, and a shared test
    // asserts the map and the tool catalogue never drift apart.
    if (heldForConfirmation(call.name, options.confirmed === true)) {
      const pending = await pendingDeleteFor(call.name, args);
      if (pending) return pendingDeleteResult(pending);
    }
    const result = await dispatchTool(call, args, options);
    // A write the student cannot see is a write that did not happen, as far as
    // they are concerned. Only on success: a failed tool must not blank the list.
    if (STUDY_WRITING_TOOLS.has(call.name) && !isToolError(result)) refreshStudyAfterExternalWrite();
    return result;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}

function isToolError(result: unknown): boolean {
  return typeof result === "object" && result !== null && "error" in result;
}

export interface AgentToolOptions {
  /** The student clicked "yes" on a confirmation card. */
  confirmed?: boolean;
  /** The course folder the documents attached to THIS turn live in, resolved
   *  from the database before the model ran. "" when nothing was attached, the
   *  files are unplaced, or two of them disagree. */
  sourceFolder?: string;
  /** A filed document was attached this turn at all. Distinct from
   *  `sourceFolder`, which is "" both when nothing was attached and when the
   *  attachment sits unsorted in Inbox — and those two must end differently. */
  sourceAttached?: boolean;
  /** What the student TYPED this turn, attachment content stripped. A folder
   *  the model asks for is honoured only if it appears in here — that is what
   *  lets "put these in X" through and keeps an invented folder out. */
  askText?: string;
}

/** The dispatch table itself. Split out so executeAgentTool can act on the
 *  RESULT of a tool without wrapping every case in bookkeeping. */
async function dispatchTool(
  call: AgentToolCall,
  args: Record<string, unknown>,
  options: AgentToolOptions,
): Promise<unknown> {
  switch (call.name) {
    case "list_calendar_events": return await listCalendarEvents(args);
    case "find_calendar_issues": return await findCalendarIssuesTool(args);
    case "add_calendar_event": return await addCalendarEvent(args);
    case "update_calendar_event": return await updateCalendarEventTool(args);
    case "delete_calendar_event": return await deleteCalendarEventTool(args);
    case "get_study_record": return await getStudyRecord();
    case "make_practice_test": return await makePracticeTest(args);
    case "find_figure": return await findFigure(args);
    default: return { error: `Unknown tool '${call.name}'.` };
  }
}
