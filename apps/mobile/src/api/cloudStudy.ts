// Cloud Study (cloud-first phone, build spec §8): decks + cards read straight
// from study_decks/study_cards — the SAME tables the web workspace uses (see
// apps/web/lib/workspace/study-cloud-store.ts + study-scheduler.ts). There is
// no Mac precompute anymore: due-ness, the New/Learn/Due counts, and the
// scheduling math below are a deliberate faithful copy of the web logic, kept
// dependency-free (no React) so both Study screens can share it. Keep this
// file in sync with the web original if the scheduler or count rules change.
//
// Grading calls the shared server RPC (grade_study_card — see
// supabase/migrations/20260719194556_web_library_study.sql) so the phone
// bills/schedules exactly like the web app. This is ONLINE-REQUIRED: the old
// Mac offline grade-queue (review_events + local JSON queue) is retired for
// cloud Study — a network failure returns a friendly blocking message instead
// of silently queuing (see gradeStudyCard below).
import { supabase } from "./supabase";

export interface CloudStudyDeck {
  id: string;
  name: string;
  description: string;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudyCardType = "basic" | "reversed" | "cloze" | "image_occlusion";

export interface CloudStudyCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  cardType: StudyCardType;
  sourcePath: string | null;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StudyGrade = "again" | "hard" | "good" | "easy";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cardTypeOf(value: unknown): StudyCardType {
  return value === "reversed" || value === "cloze" || value === "image_occlusion" ? value : "basic";
}

function toDeck(raw: unknown): CloudStudyDeck | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    description: text(raw.description),
    sourcePath: typeof raw.source_path === "string" ? raw.source_path : null,
    createdAt: text(raw.created_at),
    updatedAt: text(raw.updated_at),
  };
}

function toCard(raw: unknown): CloudStudyCard | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.deck_id !== "string") return null;
  return {
    id: raw.id,
    deckId: raw.deck_id,
    front: text(raw.front),
    back: text(raw.back),
    cardType: cardTypeOf(raw.card_type),
    sourcePath: typeof raw.source_path === "string" ? raw.source_path : null,
    dueAt: text(raw.due_at),
    intervalDays: numberField(raw.interval_days),
    repetitions: numberField(raw.repetitions),
    lapses: numberField(raw.lapses),
    suspended: raw.suspended === true,
    createdAt: text(raw.created_at),
    updatedAt: text(raw.updated_at),
  };
}

/** Every deck + card the signed-in user owns. Throws a friendly-message Error
 *  on failure — callers (the Study screens) catch it into their own
 *  loading/error state, the same shape as the web workspace's loadStudy(). */
export async function fetchCloudStudy(userId: string): Promise<{ decks: CloudStudyDeck[]; cards: CloudStudyCard[] }> {
  const [deckResult, cardResult] = await Promise.all([
    supabase
      .from("study_decks")
      .select("id,name,description,source_path,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("study_cards")
      .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,created_at,updated_at")
      .eq("user_id", userId)
      .order("due_at", { ascending: true }),
  ]);
  if (deckResult.error) throw new Error(deckResult.error.message);
  if (cardResult.error) throw new Error(cardResult.error.message);

  const decks = (deckResult.data ?? []).flatMap((row) => {
    const deck = toDeck(row);
    return deck ? [deck] : [];
  });
  const cards = (cardResult.data ?? []).flatMap((row) => {
    const card = toCard(row);
    return card ? [card] : [];
  });
  return { decks, cards };
}

/** A card is due for review right now. New cards (repetitions === 0) default
 *  `due_at` to their creation time, so they surface immediately alongside
 *  genuinely-due reviews — mirrors study-cloud-store.ts's isCardDue exactly. */
export function isCardDue(card: Pick<CloudStudyCard, "dueAt" | "suspended">, at: Date = new Date()): boolean {
  return !card.suspended && new Date(card.dueAt).getTime() <= at.getTime();
}

/** Anki's threshold between a "young" card still bedding in and a "mature"
 *  one. Shared so the deck list and the review screen draw the Learn/Due line
 *  in the same place. */
export const MATURE_INTERVAL_DAYS = 21;

export interface DeckCounts {
  newCount: number;
  learnCount: number;
  dueCount: number;
}

/** New / Learn / Due tallies for a set of cards — ported verbatim from the web
 *  workspace's cards-tab.tsx (countsForCards). "Learn" cards are still young
 *  but NOT currently due, so they never appear in a review queue — the number
 *  is a leading indicator only, shown on the deck list, not during an active
 *  review session. (review.tsx splits its own queue differently for exactly
 *  this reason: everything in a queue is due by definition.) */
export function countsForCards(
  cards: readonly Pick<CloudStudyCard, "repetitions" | "intervalDays" | "dueAt" | "suspended">[],
): DeckCounts {
  return {
    newCount: cards.filter((card) => card.repetitions === 0).length,
    learnCount: cards.filter(
      (card) => card.repetitions > 0 && card.intervalDays < MATURE_INTERVAL_DAYS && !isCardDue(card),
    ).length,
    dueCount: cards.filter((card) => card.repetitions > 0 && isCardDue(card)).length,
  };
}

export interface DeckGroupInfo {
  /** "" when the deck has no "::" prefix — renders ungrouped/loose. */
  group: string;
  leaf: string;
}

/** Splits a deck's `Group::Subgroup::Leaf` name into "everything before the
 *  last ::" and the leaf — replaces the old Mac `snapshot.course` folder key.
 *
 *  `group` is the deck's whole parent path as ONE string ("Pharm::Cardio"),
 *  which is what callers that just need "where does this deck live" want
 *  (StudyAddSheet's group picker, the Study screen's leaf label). It is NOT a
 *  folder label — rendering it as one is the bug fixed on 2026-07-22. The
 *  Study screen builds its real nested tree from raw deck names via
 *  lib/deck-tree.ts; use that whenever you need per-level folders. */
export function deckGroupInfo(name: string): DeckGroupInfo {
  const parts = name.split("::").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return { group: "", leaf: parts[0] ?? name };
  const leaf = parts.pop() as string;
  return { group: parts.join("::"), leaf };
}

const OFFLINE_MESSAGE = "You're offline — grading needs a connection. Reconnect to save your progress.";

function isNetworkish(message: string): boolean {
  return /network|fetch|offline|connection/i.test(message);
}

export interface GradeSuccess {
  ok: true;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}
export interface GradeFailure {
  ok: false;
  message: string;
}
export type GradeResult = GradeSuccess | GradeFailure;

/** Creates a new, empty deck named EXACTLY what the caller passes — Study has
 *  no separate "group" entity server-side (see deckGroupInfo above): a
 *  "Group::Subgroup::Leaf" name is the only thing that makes a deck render
 *  under a folder. Mirrors the web workspace's createDeck insert shape
 *  (lib/workspace/study-cloud-store.ts) with description/source_path left
 *  blank — the mobile "New group" flow only ever collects a name. */
export async function createStudyDeck(userId: string, name: string): Promise<CloudStudyDeck> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name.");
  const { data, error } = await supabase
    .from("study_decks")
    .insert({ user_id: userId, name: trimmed, description: "", source_path: null })
    .select("id,name,description,source_path,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  const deck = toDeck(data);
  if (!deck) throw new Error("The group was saved but returned an invalid response.");
  return deck;
}

/** Adds one basic front/back card to an existing deck. Mirrors the web
 *  workspace's createCard insert shape (lib/workspace/study-cloud-store.ts)
 *  — card_type is always "basic" here; the mobile "New cards" flow doesn't
 *  offer the reversed/cloze/image-occlusion types web's dialog does. */
export async function createStudyCard(userId: string, deckId: string, front: string, back: string): Promise<CloudStudyCard> {
  const trimmedFront = front.trim();
  const trimmedBack = back.trim();
  if (!trimmedFront || !trimmedBack) throw new Error("Add both a front and a back.");
  const { data, error } = await supabase
    .from("study_cards")
    .insert({ user_id: userId, deck_id: deckId, front: trimmedFront, back: trimmedBack, card_type: "basic", source_path: null })
    .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  const card = toCard(data);
  if (!card) throw new Error("The card was saved but returned an invalid response.");
  return card;
}

/** Grades one card via the shared server RPC (server computes the next
 *  interval and writes study_review_logs atomically). Never throws — the
 *  caller (review.tsx) must NOT advance its session on `ok: false`, so the
 *  card stays put and the user can retry once back online. */
export async function gradeStudyCard(cardId: string, grade: StudyGrade): Promise<GradeResult> {
  try {
    const { data, error } = await supabase.rpc("grade_study_card", { p_card_id: cardId, p_grade: grade });
    if (error) {
      if (isNetworkish(error.message)) return { ok: false, message: OFFLINE_MESSAGE };
      if (/not found/i.test(error.message)) return { ok: false, message: "That card is no longer available." };
      return { ok: false, message: "Couldn't save that review. Try again." };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!isObject(row) || typeof row.next_due !== "string") {
      return { ok: false, message: "The review didn't save. Try again." };
    }
    return {
      ok: true,
      dueAt: row.next_due,
      intervalDays: numberField(row.interval_days),
      repetitions: numberField(row.repetitions),
      lapses: numberField(row.lapses),
    };
  } catch {
    return { ok: false, message: OFFLINE_MESSAGE };
  }
}
