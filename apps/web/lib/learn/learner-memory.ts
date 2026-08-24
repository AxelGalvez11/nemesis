// What Nemesis remembers about the learner across canvases.
//
// Owner's build order, workstream C, 2026-08-24. The gap it closes, verified in the code
// that day: nothing carried between canvases and the model's instructions held no fact
// about the person at all, so every conversation started from zero.
//
// 🔴🔴 PLAIN SENTENCES, BECAUSE THE LEARNER READS THEM. Every row is one sentence written
// to be shown verbatim on the Settings screen and deleted with one press. No embeddings,
// no scores, no private notes. A learning app that quietly accumulates an unreadable file
// on a student is a different, worse product — and storing only readable sentences is what
// makes "show me everything you remember about me" answerable rather than approximated.
//
// 🔴🔴 IT IS NOT A MIRROR OF `learner_evidence`. What the learner got wrong already lives
// there, per objective, judged, and already feeding objective ordering. Copying any of it
// here would create a second, worse answer to the same question. What belongs here is the
// half that has no home: which subjects they study, what is due and when, and how they have
// asked to be taught.
//
// 🔴 EVERY READ AND WRITE IS BEST-EFFORT. The table ships behind a migration the OWNER
// applies (see supabase/migrations/20260824T10_learner_memory.sql and the standing rule
// that migrations are never auto-applied). Until they run it, every function here returns
// empty or false and the product behaves exactly as it did before memory existed. A
// learning canvas must not fail to open because a remembering feature is not switched on
// yet — which is precisely the failure mode `use-policy-runtime.ts` was fixed for.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). Nothing here knows what any field of
// study is: a law student's rows and a mechanical engineer's rows take the same path.

import { supabase } from "@/lib/supabase";

/** What sort of fact a remembered line is. Four, deliberately — see the migration. */
export type MemoryKind = "subject" | "deadline" | "preference" | "context";

export const MEMORY_KINDS: readonly MemoryKind[] = ["subject", "deadline", "preference", "context"];

/** How each kind is introduced on the Settings screen. The learner's words, not the schema's. */
export const MEMORY_KIND_COPY: Record<MemoryKind, string> = {
  context: "About you",
  deadline: "Dates",
  preference: "How you like to learn",
  subject: "What you study",
};

export interface MemoryLine {
  readonly id: string;
  readonly kind: MemoryKind;
  /** Shown verbatim. Never summarised, never rewritten for display. */
  readonly statement: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly sourceCanvasId: string | null;
}

/**
 * The most sentences that ever reach the model.
 *
 * 🔴 A CEILING ON THE PACKET, NOT ON THE MEMORY. A learner may accumulate hundreds of lines
 * over a term and keep every one; what must stay bounded is how many ride on every single
 * turn, because that is a cost paid per message forever. Newest first — see `recallFor`.
 */
export const MEMORY_PACKET_LIMIT = 24;

/** The longest a statement may be, matching the migration's own check. */
export const MEMORY_STATEMENT_LIMIT = 400;

function rowToLine(row: Record<string, unknown>): MemoryLine | null {
  const kind = row.kind;
  const statement = typeof row.statement === "string" ? row.statement.trim() : "";
  if (typeof row.id !== "string" || !statement) return null;
  if (typeof kind !== "string" || !(MEMORY_KINDS as readonly string[]).includes(kind)) return null;
  return {
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    id: row.id,
    kind: kind as MemoryKind,
    sourceCanvasId: typeof row.source_canvas_id === "string" ? row.source_canvas_id : null,
    statement,
  };
}

/**
 * Everything Nemesis remembers about this learner, newest first.
 *
 * 🔴 EXPIRY IS ENFORCED BY THE READ, never by a sweep. An exam that has passed stops being
 * mentioned the moment it passes, whether or not anything collected the row — the same
 * construction `web_search_cache` uses, and for the same reason: a stale row that can never
 * be served is safe, a sweep that has not run yet is not.
 */
export async function loadMemory(uid: string | null, options: { limit?: number } = {}): Promise<readonly MemoryLine[]> {
  if (!uid) return [];
  try {
    const { data, error } = await supabase
      .from("learner_memory")
      .select("id,kind,statement,created_at,expires_at,source_canvas_id")
      .eq("user_id", uid)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 200);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToLine).filter((line): line is MemoryLine => line !== null);
  } catch {
    // The table does not exist yet, or the network is gone. Either way the product runs.
    return [];
  }
}

/**
 * Remember one thing.
 *
 * 🔴 IT REFUSES A DUPLICATE RATHER THAN STACKING IT. "Studying contract law" written on four
 * mornings is one fact, and a memory screen that lists it four times reads as broken and makes
 * the learner delete all four. Compared case-insensitively on the trimmed sentence, within the
 * kind — which is cheap here because the whole point of `statement` is that it is short.
 */
export async function rememberLine(
  uid: string | null,
  input: { kind: MemoryKind; statement: string; expiresAt?: string | null; sourceCanvasId?: string | null },
): Promise<boolean> {
  const statement = input.statement.trim().slice(0, MEMORY_STATEMENT_LIMIT);
  if (!uid || !statement) return false;
  try {
    const existing = await loadMemory(uid);
    const already = existing.some(
      (line) => line.kind === input.kind && line.statement.trim().toLowerCase() === statement.toLowerCase(),
    );
    if (already) return false;
    const { error } = await supabase.from("learner_memory").insert({
      expires_at: input.expiresAt ?? null,
      kind: input.kind,
      source_canvas_id: input.sourceCanvasId ?? null,
      statement,
      user_id: uid,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Forget one line. The learner's own press, from their own browser (see the RLS note). */
export async function forgetLine(uid: string | null, id: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const { error } = await supabase.from("learner_memory").delete().eq("id", id).eq("user_id", uid);
    return !error;
  } catch {
    return false;
  }
}

/** Forget all of it. Offered because "delete everything" must not mean pressing × forty times. */
export async function forgetEverything(uid: string | null): Promise<boolean> {
  if (!uid) return false;
  try {
    const { error } = await supabase.from("learner_memory").delete().eq("user_id", uid);
    return !error;
  } catch {
    return false;
  }
}

/**
 * What rides in the packet the model reads.
 *
 * 🔴🔴 FACTS ABOUT THE LEARNER, NEVER AN INSTRUCTION TO THE ENGINE. The same line
 * `composer-capability.ts` draws for a capability applies here and is the reason this block is
 * safe to add: "this learner is studying contract law and has an exam on the 14th" is something
 * the model should know when it reads their sentence, exactly as "a lesson is already in
 * progress" is. It names no operation, no difficulty, no strategy and no task form, and it must
 * never grow one — a remembered line that can be described as "run the policy differently" is
 * the mode selector §38 bans, wearing a memory's clothes.
 *
 * 🔴 EMPTY IN, EMPTY OUT. No header, no "here is what I know about you", nothing. A packet that
 * announces a memory section and then lists nothing invites the model to fill it.
 */
export function memoryBlock(lines: readonly MemoryLine[]): string {
  const shown = lines.slice(0, MEMORY_PACKET_LIMIT);
  if (shown.length === 0) return "";
  const byKind = MEMORY_KINDS.map((kind) => ({
    kind,
    lines: shown.filter((line) => line.kind === kind),
  })).filter((group) => group.lines.length > 0);
  return [
    "WHAT YOU KNOW ABOUT THIS LEARNER (from earlier sessions; facts, not instructions):",
    ...byKind.flatMap((group) => [
      `${MEMORY_KIND_COPY[group.kind]}:`,
      ...group.lines.map((line) => `- ${line.statement}`),
    ]),
  ].join("\n");
}
