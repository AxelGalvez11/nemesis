// Review grades: the phone's only study "write" — append-only review_events
// rows the Mac ingests through the desktop's own grade path (sync spec Phase 3).
// Grades queue in a local JSON file first (offline-first: the session never
// waits on the network) and flush opportunistically; client_event_id +
// ignore-duplicates makes retries idempotent. Also keeps the per-deck
// "graded since snapshot" marks that hide already-graded cards until the Mac
// republishes a fresher deck snapshot.
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { currentUserId } from "./librarySync";
import {
  chunkEvents,
  makeClientEventId,
  pruneGradedMarks,
  type GradedMark,
  type PendingReviewEvent,
  type ReviewGrade,
} from "@/lib/study-session";

const QUEUE_PATH = `${FileSystem.documentDirectory ?? ""}review-queue-v1.json`;
const MARKS_PATH = `${FileSystem.documentDirectory ?? ""}study-marks-v1.json`;
const FLUSH_BATCH = 50;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  } catch {
    // best-effort: a failed write costs at most a re-shown card, never a crash
  }
}

// --- the offline grade queue ---------------------------------------------------

function castPendingEvent(row: unknown): PendingReviewEvent | null {
  if (!isObj(row)) return null;
  const { client_event_id, deck_path_hash, schedule_key, grade, reviewed_at } = row;
  if (typeof client_event_id !== "string" || typeof deck_path_hash !== "string") return null;
  if (typeof schedule_key !== "string" || typeof reviewed_at !== "string") return null;
  if (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") return null;
  return {
    client_event_id,
    deck_path_hash,
    schedule_key,
    grade,
    reviewed_at,
  };
}

async function loadQueue(): Promise<PendingReviewEvent[]> {
  const parsed = await readJsonFile(QUEUE_PATH);
  if (!isObj(parsed) || parsed.v !== 1 || !Array.isArray(parsed.events)) return [];
  return parsed.events.map(castPendingEvent).filter((e): e is PendingReviewEvent => e !== null);
}

async function saveQueue(events: PendingReviewEvent[]): Promise<void> {
  await writeJsonFile(QUEUE_PATH, { v: 1, events });
}

function randomUnit(): number {
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] / 0x1_0000_0000;
  }
  return Math.random();
}

/** Queue one grade locally (never blocks on the network). */
export async function enqueueGrade(input: {
  deckPathHash: string;
  scheduleKey: string;
  grade: ReviewGrade;
  reviewedAt: string;
}): Promise<void> {
  const queue = await loadQueue();
  queue.push({
    client_event_id: makeClientEventId(randomUnit),
    deck_path_hash: input.deckPathHash,
    schedule_key: input.scheduleKey,
    grade: input.grade,
    reviewed_at: input.reviewedAt,
  });
  await saveQueue(queue);
}

/** Push queued grades to review_events. Batches are idempotent
 *  (user_id + client_event_id unique, duplicates ignored); a failed batch stays
 *  queued for the next flush. Signed-out = everything stays queued. */
export async function flushReviewQueue(): Promise<{ sent: number; pending: number }> {
  const queue = await loadQueue();
  if (!queue.length) return { pending: 0, sent: 0 };
  const uid = await currentUserId();
  if (!uid) return { pending: queue.length, sent: 0 };

  let sent = 0;
  let remaining = [...queue];
  for (const batch of chunkEvents(queue, FLUSH_BATCH)) {
    const rows = batch.map((event) => ({ ...event, user_id: uid, device_id: null }));
    const { error } = await supabase
      .from("review_events")
      .upsert(rows, { ignoreDuplicates: true, onConflict: "user_id,client_event_id" });
    if (error) break;
    const flushed = new Set(batch.map((event) => event.client_event_id));
    remaining = remaining.filter((event) => !flushed.has(event.client_event_id));
    sent += batch.length;
  }
  if (sent > 0) await saveQueue(remaining);
  return { pending: remaining.length, sent };
}

/** Grades still waiting for a network flush (the review screen's honesty line). */
export async function pendingReviewCount(): Promise<number> {
  return (await loadQueue()).length;
}

// --- per-deck graded marks -------------------------------------------------------

async function loadMarksFile(): Promise<Record<string, GradedMark[]>> {
  const parsed = await readJsonFile(MARKS_PATH);
  if (!isObj(parsed) || parsed.v !== 1 || !isObj(parsed.marks)) return {};
  const out: Record<string, GradedMark[]> = {};
  for (const [deck, list] of Object.entries(parsed.marks)) {
    if (!Array.isArray(list)) continue;
    out[deck] = list.filter(
      (m): m is GradedMark => isObj(m) && typeof m.key === "string" && typeof m.at === "string",
    );
  }
  return out;
}

/** All decks' marks at once (the deck list computes adjusted due counts). */
export async function loadAllGradedMarks(): Promise<Record<string, GradedMark[]>> {
  return loadMarksFile();
}

/** Record a completed card + prune marks the snapshot has caught up with. */
export async function recordGradedMark(deckPathHash: string, mark: GradedMark, snapshotAsOf: string): Promise<void> {
  const all = await loadMarksFile();
  const pruned = pruneGradedMarks(all[deckPathHash] ?? [], snapshotAsOf);
  all[deckPathHash] = [...pruned, mark];
  await writeJsonFile(MARKS_PATH, { marks: all, v: 1 });
}
