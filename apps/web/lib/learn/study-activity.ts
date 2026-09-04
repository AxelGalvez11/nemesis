// What the learner has actually been DOING on this account, stated as facts.
//
// Owner, 2026-09-04: *"it's supposed to get smarter as you use the app... it's supposed to
// understand how you learn, the more you use it."* Measured that day: `learner_memory` held sixteen
// sentences for the owner, every one a subject or a bit of context and not one about HOW he
// studies. That is not a bug in memory. Memory records only what a learner SAYS (learner-memory.ts
// gives the reason, and it stands), and nobody says "I review in the evenings and keep missing the
// diabetes deck". They just do it, and the record of it was already on the account: every review
// press, every deck, every practice test, every term looked up while reading. This reads that
// record and puts it in front of the model and the learner in the same words.
//
// 🔴🔴 FACTS, NEVER JUDGEMENTS. "Marked again on 7 of 31 cards in the diabetes deck" is something
// that happened; "struggles with diabetes" is a verdict about a person, and the memory design bans
// verdicts for a reason the Settings screen states. Every line here is a count the learner can
// check against their own decks.
//
// 🔴🔴 COMPUTED, NEVER STORED. Nothing is written anywhere. The lines are worked out from the study
// record on each read and shown on the Settings screen beside the remembered sentences, so "what
// does Nemesis know about me" keeps one honest answer. Deleting a deck deletes its share of this.
//
// 🔴 BEST-EFFORT, like every other read beside a turn. A failed read returns null and the turn runs
// exactly as it would with no record at all.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). A deck is a deck whatever it is about; a law
// student's record and a mechanical engineer's take the same path and read the same way.

import { supabase } from "@/lib/supabase";

/** How far back the review lines look. A term's worth of habit, not a lifetime. */
export const ACTIVITY_WINDOW_DAYS = 30;

/** The most decks a line names. Past this the line is a list nobody reads. */
export const ACTIVITY_DECKS_NAMED = 4;

/** The most review rows read for one turn. Ten a minute for a month is 43,000; this is enough to
 *  say how a term went, and the cap keeps the read bounded. */
const REVIEW_ROWS = 1500;

export interface DeckActivity {
  readonly name: string;
  readonly reviews: number;
  readonly again: number;
  readonly hard: number;
  /** Most recent review day, ISO date. */
  readonly lastDay: string;
}

export interface StudyActivity {
  readonly days: number;
  readonly reviews: number;
  /** Newest first. */
  readonly decks: readonly DeckActivity[];
  readonly decksMade: number;
  readonly testsMade: number;
  readonly mapsMade: number;
  readonly lookups: number;
}

/** A deck's own name, without the folder path decks are grouped under ("Pharmacology::Beta Blockers"). */
export function deckLeafName(name: string): string {
  const leaf = name.split("::").pop()?.trim();
  return leaf || name.trim();
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Read the record.
 *
 * Four reads in parallel, then two small joins for the decks the reviews belong to. Every read
 * is scoped to the learner by `user_id`, and RLS holds the same line underneath.
 */
export async function loadStudyActivity(uid: string | null, now: Date = new Date()): Promise<StudyActivity | null> {
  if (!uid) return null;
  try {
    const floor = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString();
    const [logs, decks, artifacts, lookups] = await Promise.all([
      supabase
        .from("study_review_logs")
        .select("card_id,grade,reviewed_at")
        .eq("user_id", uid)
        .gte("reviewed_at", floor)
        .order("reviewed_at", { ascending: false })
        .limit(REVIEW_ROWS),
      supabase.from("study_decks").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("study_artifacts").select("kind").eq("user_id", uid).neq("status", "archived"),
      supabase.from("learner_lookups").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    if (logs.error) return null;
    const rows = (logs.data ?? []) as { card_id: string; grade: string; reviewed_at: string }[];

    const cardIds = [...new Set(rows.map((row) => row.card_id))];
    const deckOfCard = new Map<string, string>();
    if (cardIds.length > 0) {
      const cards = await supabase.from("study_cards").select("id,deck_id").in("id", cardIds);
      for (const card of (cards.data ?? []) as { id: string; deck_id: string }[]) deckOfCard.set(card.id, card.deck_id);
    }
    const deckIds = [...new Set([...deckOfCard.values()])];
    const nameOfDeck = new Map<string, string>();
    if (deckIds.length > 0) {
      const named = await supabase.from("study_decks").select("id,name").in("id", deckIds);
      for (const deck of (named.data ?? []) as { id: string; name: string }[]) nameOfDeck.set(deck.id, deck.name);
    }

    const byDeck = new Map<string, { name: string; reviews: number; again: number; hard: number; lastDay: string }>();
    for (const row of rows) {
      const deckId = deckOfCard.get(row.card_id);
      const name = deckId ? nameOfDeck.get(deckId) : undefined;
      // A review of a card whose deck is gone still counts as a review, but has no deck to name.
      if (!deckId || !name) continue;
      const day = row.reviewed_at.slice(0, 10);
      const deck = byDeck.get(deckId) ?? { again: 0, hard: 0, lastDay: day, name: deckLeafName(name), reviews: 0 };
      deck.reviews += 1;
      if (row.grade === "again") deck.again += 1;
      if (row.grade === "hard") deck.hard += 1;
      if (day > deck.lastDay) deck.lastDay = day;
      byDeck.set(deckId, deck);
    }

    const kinds = (artifacts.data ?? []) as { kind: string }[];
    return {
      days: ACTIVITY_WINDOW_DAYS,
      decks: [...byDeck.values()].sort((a, b) => (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : b.reviews - a.reviews)),
      decksMade: decks.count ?? 0,
      lookups: lookups.count ?? 0,
      mapsMade: kinds.filter((row) => row.kind === "mindmap").length,
      reviews: rows.length,
      testsMade: kinds.filter((row) => row.kind === "test").length,
    };
  } catch {
    return null;
  }
}

/**
 * The record as sentences: the same lines the model reads and the learner sees in Settings.
 *
 * 🔴 EMPTY WHEN THERE IS NOTHING TO SAY. A new account produces no lines, not "no reviews yet";
 * an absence is not a fact worth a sentence on every turn.
 */
export function activityLines(activity: StudyActivity | null): readonly string[] {
  if (!activity) return [];
  const lines: string[] = [];

  if (activity.reviews > 0) {
    const named = activity.decks
      .slice(0, ACTIVITY_DECKS_NAMED)
      .map((deck) => `${deck.name} (${plural(deck.reviews, "card")}${deck.again > 0 ? `, ${deck.again} marked again` : ""})`);
    const more = activity.decks.length - named.length;
    const across = activity.decks.length > 0
      ? ` across ${plural(activity.decks.length, "deck")}: ${named.join("; ")}${more > 0 ? `; and ${plural(more, "more deck")}` : ""}`
      : "";
    lines.push(`Reviewed ${plural(activity.reviews, "flashcard")} in the last ${activity.days} days${across}.`);
  }

  const missed = activity.decks
    .filter((deck) => deck.again >= 2)
    .sort((a, b) => b.again - a.again)
    .slice(0, 3);
  if (missed.length > 0) {
    lines.push(`Marked "again" most on: ${missed.map((deck) => `${deck.name} (${deck.again} of ${plural(deck.reviews, "card")})`).join("; ")}.`);
  }

  const made: string[] = [];
  if (activity.decksMade > 0) made.push(plural(activity.decksMade, "flashcard deck"));
  if (activity.testsMade > 0) made.push(plural(activity.testsMade, "practice test"));
  if (activity.mapsMade > 0) made.push(plural(activity.mapsMade, "mind map"));
  if (made.length > 0) lines.push(`Has made ${listOf(made)} on this account.`);

  if (activity.lookups > 0) lines.push(`Looked up ${plural(activity.lookups, "term")} while reading.`);

  return lines;
}

/** The lines as one block for the turn packet; empty when there are no lines. */
export function activityBlock(activity: StudyActivity | null): string {
  return activityLines(activity)
    .map((line) => `- ${line}`)
    .join("\n");
}
