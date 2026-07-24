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
import * as FileSystem from "expo-file-system/legacy";
import {
  decksInGroup,
  isWithinGroup,
  joinGroupPath,
  normalizeGroupPath,
  pathLeaf,
  renamedGroupPath,
  rewriteGroupPrefix,
} from "@/lib/study-tree";
import { normalizeStudyFlag } from "@/lib/study-flags";
import { supabase } from "./supabase";

/** Trim, drop blanks, lowercase, de-duplicate a card's tag list — mirrors web's
 *  normalizeStudyTags so the two surfaces store tags identically. */
function normalizeStudyTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

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
  /** Anki color flag, 0 = none, 1-7 per STUDY_FLAG_COLORS (owner 2026-07-23 Browse). */
  flag: number;
  tags: string[];
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
    flag: normalizeStudyFlag(raw.flag),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
    createdAt: text(raw.created_at),
    updatedAt: text(raw.updated_at),
  };
}

// --- disk cache ---------------------------------------------------------------
//
// WHY STUDY OPENS INSTANTLY NOW (owner 2026-07-24: "why does study page take
// long to load always"). It was fetching every deck AND every card in the
// account on each focus, and rendering nothing but skeletons until both
// queries came back — every single time, including when nothing had changed.
// A student with a semester of decks waits on the network for a list they
// already saw a minute ago.
//
// So Study caches to disk exactly the way the Library already does
// (cloudLibrary.ts's readDiskCache/writeDiskCache — same expo-file-system
// legacy API, same best-effort try/catch): the last known decks and cards
// paint immediately, and the fetch refreshes behind them. Same JSON shape as
// the fetch returns, so no translation layer.

interface StudyDiskCache {
  v: 1;
  decks: CloudStudyDeck[];
  cards: CloudStudyCard[];
}

const EMPTY_STUDY_CACHE: StudyDiskCache = { v: 1, cards: [], decks: [] };

const studyCachePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}cloud-study-cache-v1-${uid}.json`;

/** Cache-only read — never throws, never touches the network. Powers the
 *  instant paint and keeps a signed-in student's decks readable offline. */
export async function loadCachedStudy(uid: string): Promise<{ decks: CloudStudyDeck[]; cards: CloudStudyCard[] }> {
  if (!uid) return { cards: [], decks: [] };
  try {
    const path = studyCachePathFor(uid);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return { cards: [], decks: [] };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<StudyDiskCache> | null;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
      return { cards: [], decks: [] };
    }
    return { cards: parsed.cards, decks: parsed.decks };
  } catch {
    return { cards: [], decks: [] };
  }
}

async function writeStudyCache(uid: string, value: { decks: CloudStudyDeck[]; cards: CloudStudyCard[] }): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      studyCachePathFor(uid),
      JSON.stringify({ v: 1, cards: value.cards, decks: value.decks } satisfies StudyDiskCache),
    );
  } catch {
    // best-effort: worst case the next open waits on the network, as it used to
  }
}

/** Every deck + card the signed-in user owns. Throws a friendly-message Error
 *  on failure — callers (the Study screens) catch it into their own
 *  loading/error state, the same shape as the web workspace's loadStudy().
 *  Writes the disk cache on the way out, so the NEXT open paints instantly. */
export async function fetchCloudStudy(userId: string): Promise<{ decks: CloudStudyDeck[]; cards: CloudStudyCard[] }> {
  const [deckResult, cardResult] = await Promise.all([
    supabase
      .from("study_decks")
      .select("id,name,description,source_path,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("study_cards")
      .select("id,deck_id,front,back,card_type,source_path,due_at,interval_days,repetitions,lapses,suspended,flag,tags,created_at,updated_at")
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
  // Fire-and-forget: the caller already has the fresh data, and a slow write
  // must never hold up the render it was fetched for.
  void writeStudyCache(userId, { cards, decks });
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
/** The card kinds the phone can AUTHOR (owner 2026-07-24: "users should be able
 *  to select card type for adding new cards"). The review screen also renders
 *  image_occlusion cards, but those are made on the web app where there is a
 *  picture to draw boxes on. */
export type NewCardType = "basic" | "cloze";

export async function createStudyCard(
  userId: string,
  deckId: string,
  front: string,
  back: string,
  cardType: NewCardType = "basic",
): Promise<CloudStudyCard> {
  const trimmedFront = front.trim();
  const trimmedBack = back.trim();
  if (!trimmedFront) throw new Error(cardType === "cloze" ? "Add some text first." : "Add both a front and a back.");
  // A cloze card's back is Anki's "Extra" field — genuinely optional, because
  // the deletions in the FRONT are what make the card. Requiring one would make
  // every cloze card carry a duplicate of its own sentence.
  if (cardType === "basic" && !trimmedBack) throw new Error("Add both a front and a back.");
  const { data, error } = await supabase
    .from("study_cards")
    .insert({ user_id: userId, deck_id: deckId, front: trimmedFront, back: trimmedBack, card_type: cardType, source_path: null })
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

// --- rename / move / delete ------------------------------------------------
//
// Deck and folder edits (owner 2026-07-22: long-press a Study row for "rename,
// delete, or move"), ported from the web store's study-cloud-store.ts.
//
// Study has NO folder table — a deck's folder is a "::"-prefix inside its own
// name — so a folder operation is a fan-out of name rewrites across every deck
// beneath it. lib/study-tree.ts owns that (segment-aware, so "Exam 1" can never
// swallow "Exam 10"); these functions are just the writes.
//
// UNLIKE the library, a deck delete is PERMANENT: study_cards has
// `on delete cascade` on its deck foreign key (see the 20260719194556
// migration), so removing a deck destroys its cards and their review history
// along with it. The callers confirm accordingly.
//
// Like cloudLibrary's writes these are stateless: the caller passes the decks it
// already has on screen, and re-fetches afterwards.

/** Rename one deck's LEAF, leaving it in its current folder. A "::" typed into
 *  the field can't reparent the deck (renamedGroupPath keeps the parent). */
export async function renameStudyDeck(
  userId: string,
  decks: readonly CloudStudyDeck[],
  deckId: string,
  nextLeaf: string,
): Promise<void> {
  const deck = decks.find((item) => item.id === deckId);
  if (!deck) throw new Error("That deck is no longer in your account.");
  const name = renamedGroupPath(deck.name, nextLeaf);
  if (!name) throw new Error("Enter a name.");
  if (name === deck.name) return;
  if (decks.some((item) => item.id !== deckId && item.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A deck with that name already exists in this folder.");
  }
  const { error } = await supabase.from("study_decks").update({ name }).eq("id", deckId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Move one deck into `targetGroup` ("" = top level), keeping its leaf name. */
export async function moveStudyDeck(
  userId: string,
  decks: readonly CloudStudyDeck[],
  deckId: string,
  targetGroup: string,
): Promise<void> {
  const deck = decks.find((item) => item.id === deckId);
  if (!deck) throw new Error("That deck is no longer in your account.");
  const name = joinGroupPath(targetGroup, pathLeaf(deck.name));
  if (name === deck.name) return;
  if (decks.some((item) => item.id !== deckId && item.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A deck with that name already exists there.");
  }
  const { error } = await supabase.from("study_decks").update({ name }).eq("id", deckId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Delete one deck. PERMANENT — its cards cascade away with it. */
export async function deleteStudyDeck(userId: string, deckId: string): Promise<void> {
  const { error } = await supabase.from("study_decks").delete().eq("id", deckId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Rewrite a folder prefix across every deck beneath it — the shared cascade
 *  behind renaming and moving a folder. rewriteGroupPrefix returns null for a
 *  deck that wouldn't change, so those rows are never written at all. */
async function rewriteStudyGroup(
  userId: string,
  decks: readonly CloudStudyDeck[],
  source: string,
  destination: string,
): Promise<void> {
  const renamed = decksInGroup(decks, source).flatMap((deck) => {
    const name = rewriteGroupPrefix(deck.name, source, destination);
    return name ? [{ deck, name }] : [];
  });
  if (renamed.length === 0) return;
  const taken = new Set(
    decks.filter((deck) => !isWithinGroup(deck.name, source)).map((deck) => deck.name.toLowerCase()),
  );
  if (renamed.some(({ name }) => taken.has(name.toLowerCase()))) {
    throw new Error("A deck with that name already exists there.");
  }
  const results = await Promise.all(
    renamed.map(({ deck, name }) => supabase.from("study_decks").update({ name }).eq("id", deck.id).eq("user_id", userId)),
  );
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(failure.message);
}

/** Rename a folder in place — same parent, new last segment. */
export async function renameStudyGroup(
  userId: string,
  decks: readonly CloudStudyDeck[],
  group: string,
  nextLeaf: string,
): Promise<void> {
  const source = normalizeGroupPath(group);
  const destination = renamedGroupPath(source, nextLeaf);
  if (!source || !destination) throw new Error("Enter a name.");
  if (destination === source) return;
  await rewriteStudyGroup(userId, decks, source, destination);
}

/** Move a folder (and its whole subtree) into `targetGroup`; "" = top level. */
export async function moveStudyGroup(
  userId: string,
  decks: readonly CloudStudyDeck[],
  group: string,
  targetGroup: string,
): Promise<void> {
  const source = normalizeGroupPath(group);
  const target = normalizeGroupPath(targetGroup);
  if (!source) throw new Error("That folder can't be moved.");
  // Reparenting a folder under itself would orphan everything inside it.
  if (isWithinGroup(target, source)) throw new Error("A folder can't be moved inside itself.");
  const destination = joinGroupPath(target, pathLeaf(source));
  if (destination === source) return;
  await rewriteStudyGroup(userId, decks, source, destination);
}

/** Delete a folder and every deck inside it. PERMANENT — all their cards
 *  cascade away too. */
export async function deleteStudyGroup(
  userId: string,
  decks: readonly CloudStudyDeck[],
  group: string,
): Promise<void> {
  const doomed = decksInGroup(decks, group);
  if (doomed.length === 0) return;
  const { error } = await supabase
    .from("study_decks")
    .delete()
    .in("id", doomed.map((deck) => deck.id))
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// --- per-card edits (owner 2026-07-23: the Browse sheet's edit panel) --------
// Ported from web's study-cloud-store.ts updateCard/setCardFlag/setCardSuspended.
// Card-type change, image-occlusion editing, and Anki (.apkg) export are NOT
// here yet — the phone Browse covers text/flag/suspend/tags/delete; those three
// are the web panel's heavier extras, left for a follow-up.

/** Edit a card's front/back text. */
export async function updateStudyCard(userId: string, cardId: string, front: string, back: string): Promise<void> {
  const trimmedFront = front.trim();
  const trimmedBack = back.trim();
  if (!trimmedFront || !trimmedBack) throw new Error("Add both a front and a back.");
  const { error } = await supabase
    .from("study_cards")
    .update({ front: trimmedFront, back: trimmedBack })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Set (flag 1-7) or clear (flag 0) a card's Anki color flag. Writes the legacy
 *  `flagged` boolean alongside so older readers stay correct — same as web. */
export async function setStudyCardFlag(userId: string, cardId: string, flag: number): Promise<void> {
  const value = normalizeStudyFlag(flag);
  const { error } = await supabase
    .from("study_cards")
    .update({ flag: value, flagged: value > 0 })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Suspend or unsuspend a card (a suspended card never comes up for review). */
export async function setStudyCardSuspended(userId: string, cardId: string, suspended: boolean): Promise<void> {
  const { error } = await supabase
    .from("study_cards")
    .update({ suspended })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Replace a card's tag list (trimmed, lowercased, de-duplicated). */
export async function setStudyCardTags(userId: string, cardId: string, tags: readonly string[]): Promise<void> {
  const { error } = await supabase
    .from("study_cards")
    .update({ tags: normalizeStudyTags(tags) })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Delete ONE card — leaves the deck and its other cards intact (unlike
 *  deleteStudyDeck, which cascades). Permanent. */
export async function deleteStudyCard(userId: string, cardId: string): Promise<void> {
  const { error } = await supabase.from("study_cards").delete().eq("id", cardId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
