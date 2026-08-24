// What is actually waiting for this learner right now.
//
// Owner's build order, workstream D, 2026-08-24: *"Opening Nemesis shows the state of your
// studying: forty cards due, a canvas you left half finished, an exam in nine days. One tap
// into any of it."* The gap it closes is the one a chatbot does not have and a learning app
// dies without — a reason to come back tomorrow.
//
// 🔴🔴 IT REPORTS, IT NEVER RECOMMENDS. Every row here is a COUNT or a FACT the learner could
// have worked out themselves: cards whose due date has passed, canvases they left mid-lesson,
// dates they told us about. Nothing ranks them, nothing says which to do first, and nothing
// here may ever grow a "start here" — that is the teaching policy's job (§18, §26), and a
// front-door widget quietly steering the session would be the mode selector §38 bans with a
// dashboard's face on it.
//
// 🔴🔴 SILENT WHEN THERE IS NOTHING. `isQuiet` exists so the surface can render NOTHING rather
// than an empty dashboard with three zeroes in it. §19 asks for an interface that almost
// disappears; a panel that says "0 cards due" every morning is the opposite, and it also trains
// the learner to stop looking at exactly the surface that is supposed to bring them back.
//
// 🔴 EVERY QUERY IS BEST-EFFORT AND INDEPENDENT. Three reads, three catches: deadlines live
// behind a migration the owner applies, and a front door that fails to render because a table
// is missing is a worse outcome than a front door with one section absent.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). Nothing here knows what any field of study
// is — the same three rows are built for a law student and a mechanical engineering student.

import { supabase } from "@/lib/supabase";

import { loadMemory } from "./learner-memory";

/** A canvas the learner started teaching and did not finish. */
export interface UnfinishedCanvas {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

/** Something with a date, as the learner said it. */
export interface UpcomingDate {
  readonly id: string;
  readonly statement: string;
  /** Days from today. Negative never appears — `loadMemory` drops expired rows. */
  readonly inDays: number | null;
}

export interface Today {
  /** Cards whose due date has passed. Capped at COUNT_CAP for display honesty. */
  readonly cardsDue: number;
  readonly unfinished: readonly UnfinishedCanvas[];
  readonly dates: readonly UpcomingDate[];
}

export const EMPTY_TODAY: Today = { cardsDue: 0, dates: [], unfinished: [] };

/**
 * The most of each thing worth putting on a front door.
 *
 * 🔴 THREE, BECAUSE A LIST IS NOT A HOME PAGE. Ten unfinished canvases is a Library query; the
 * front door's job is "here is what is waiting", and past about three rows a learner stops
 * reading and starts scrolling.
 */
export const TODAY_ROWS = 3;

/** Beyond this the exact number stops mattering and starts being discouraging. */
export const COUNT_CAP = 999;

/**
 * The canvas states that mean "started teaching and stopped".
 *
 * 🔴 `empty` AND `sources_attached` ARE NOT UNFINISHED, THEY ARE UNSTARTED. A canvas someone
 * opened and abandoned before a single lesson has nothing to return TO, and listing it would
 * fill the front door with the learner's own false starts — which is the fastest way to make
 * this panel feel like clutter rather than like a reminder.
 */
const UNFINISHED_STATES = ["orient", "learn", "recall", "test", "diagnose", "targeted_relearn"];

function daysUntil(iso: string, now: Date): number | null {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return null;
  // Whole days, floored from the start of today, so "tomorrow" never reads as "in 0 days"
  // because of the hour someone happens to be studying at.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((then.getTime() - startOfToday) / 86_400_000);
}

/** True when there is genuinely nothing waiting, so the surface can draw nothing at all. */
export function isQuiet(today: Today): boolean {
  return today.cardsDue === 0 && today.unfinished.length === 0 && today.dates.length === 0;
}

async function countCardsDue(uid: string, nowIso: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("study_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("suspended", false)
      .lte("due_at", nowIso);
    if (error || typeof count !== "number") return 0;
    return Math.min(count, COUNT_CAP);
  } catch {
    return 0;
  }
}

async function loadUnfinished(uid: string): Promise<readonly UnfinishedCanvas[]> {
  try {
    const { data, error } = await supabase
      .from("learning_canvases")
      .select("id,title,updated_at")
      .eq("user_id", uid)
      .eq("deleted", false)
      .in("state", UNFINISHED_STATES)
      .order("updated_at", { ascending: false })
      .limit(TODAY_ROWS);
    if (error || !data) return [];
    return (data as { id: string; title: string; updated_at: string }[]).map((row) => ({
      id: row.id,
      title: row.title?.trim() || "Untitled canvas",
      updatedAt: row.updated_at,
    }));
  } catch {
    return [];
  }
}

async function loadDates(uid: string, now: Date): Promise<readonly UpcomingDate[]> {
  const lines = await loadMemory(uid);
  return lines
    .filter((line) => line.kind === "deadline")
    .map((line) => ({
      id: line.id,
      inDays: line.expiresAt ? daysUntil(line.expiresAt, now) : null,
      statement: line.statement,
    }))
    // 🔴 SOONEST FIRST, AND UNDATED LAST. A deadline the learner mentioned without a date is
    // still worth showing; it just cannot claim to be more urgent than one that has a date.
    .sort((a, b) => (a.inDays ?? Number.MAX_SAFE_INTEGER) - (b.inDays ?? Number.MAX_SAFE_INTEGER))
    .slice(0, TODAY_ROWS);
}

/**
 * Everything waiting, read in parallel.
 *
 * 🔴 `now` IS PASSED IN RATHER THAN READ HERE, so the day boundary is decided once by the caller
 * and the whole result is consistent with itself — and so a test can state what day it is.
 */
export async function loadToday(uid: string | null, now: Date = new Date()): Promise<Today> {
  if (!uid) return EMPTY_TODAY;
  const nowIso = now.toISOString();
  const [cardsDue, unfinished, dates] = await Promise.all([
    countCardsDue(uid, nowIso),
    loadUnfinished(uid),
    loadDates(uid, now),
  ]);
  return { cardsDue, dates, unfinished };
}

/**
 * How a date is said out loud.
 *
 * 🔴 NO EM DASHES AND NO CLEVERNESS — this is learner-facing copy and
 * `canvas-learner-copy.test.ts` bans the former. "Today" and "tomorrow" are worth special-casing
 * because "in 0 days" is how software talks, not how people do.
 */
export function whenPhrase(inDays: number | null): string {
  if (inDays === null) return "";
  if (inDays <= 0) return "today";
  if (inDays === 1) return "tomorrow";
  return `in ${inDays} days`;
}
