"use client";

// Every recording this account is still waiting on, in one place that no page
// owns.
//
// This is a module-level store on purpose. The chat screen, the Library, and the
// little "1 item processing" pill in the shell all need the same answer, and if
// any one of them owned the watch then leaving that screen would stop it — which
// is the entire class of bug the durable pipeline exists to remove. The shell
// starts it once, and it keeps running across every route change for as long as
// the tab is open.
//
// It is a WATCHER, never a driver. Nothing here advances a job, and closing the
// tab changes nothing about whether a recording finishes: the worker owns that.
// The one call that reaches out (`kick`) only asks the server to look sooner
// than the cron would, and a failed kick is not an error.

import { supabase } from "@/lib/supabase";
import { RECORDING_JOB_COLUMNS, toRecordingJob, type RecordingJob } from "@/lib/workspace/recording-job";

/** How often to re-read while something is actually running. Fast enough that a
 *  stage change feels live, slow enough to be a rounding error against one
 *  student's usage — the query is a partial-index lookup over their own rows. */
const ACTIVE_POLL_MS = 2_000;
/** When the only unfinished jobs are FAILED ones, there is nothing to watch
 *  change; the row stays on screen so the retry button does, and it is re-read
 *  rarely in case another device retried it. */
const IDLE_POLL_MS = 20_000;
/** A failed job is worth showing for a while, not forever. Past this it stops
 *  being fetched, so an old failure the student never dealt with does not sit in
 *  the processing indicator for the rest of the semester. */
const FAILURE_SHELF_LIFE_MS = 24 * 60 * 60 * 1_000;
/** No student has hundreds of recordings in flight; this only stops one broken
 *  account from making every poll expensive. */
const MAX_WATCHED = 20;

type Listener = () => void;

export interface RecordingJobsState {
  jobs: RecordingJob[];
  /**
   * Whether this account's jobs have been read at least once.
   *
   * 🔴 LOAD-BEARING, not a spinner flag. A chat message carries `polish:
   * "pending"` — a claim about how things were when it was written — and the
   * card has to decide whether to still believe it. Before the first read,
   * believing it is all we can do. AFTER it, the jobs are the truth: a message
   * that says pending with no job behind it is a recording nobody is working on,
   * and treating that as "still writing" leaves a card pulsing and unclickable
   * forever.
   */
  loaded: boolean;
}

const listeners = new Set<Listener>();
let state: RecordingJobsState = { jobs: [], loaded: false };
let userId: string | null = null;
let timer: number | null = null;
let inFlight = false;

function emit(): void {
  for (const listener of listeners) listener();
}

/** The snapshot React reads. Reference-stable between real changes, because
 *  useSyncExternalStore re-renders on every new reference and this store polls. */
export function recordingJobsSnapshot(): RecordingJobsState {
  return state;
}

export function subscribeRecordingJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameJobs(a: readonly RecordingJob[], b: readonly RecordingJob[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((job, index) => {
    const other = b[index]!;
    return job.id === other.id && job.updatedAt === other.updatedAt && job.status === other.status;
  });
}

function replace(next: RecordingJob[], loaded: boolean): void {
  if (state.loaded === loaded && sameJobs(state.jobs, next)) return;
  state = { jobs: next, loaded };
  emit();
}

/**
 * Read this account's jobs NOW rather than on the next scheduled poll.
 *
 * Called the moment a recording is handed over, because the idle poll can be
 * twenty seconds away and "did that work?" for twenty seconds after stopping a
 * lecture is the exact gap this whole feature exists to close.
 */
export function refreshRecordingJobs(): void {
  schedule(0);
}

async function refresh(): Promise<void> {
  if (!userId || inFlight) return;
  inFlight = true;
  try {
    const since = new Date(Date.now() - FAILURE_SHELF_LIFE_MS).toISOString();
    const { data } = await supabase
      .from("recording_jobs")
      .select(RECORDING_JOB_COLUMNS)
      // Everything unfinished. Failures are included deliberately: requirement
      // is that a failure PERSISTS and can be retried, so it has to survive a
      // refresh rather than vanishing with the page that saw it.
      .neq("status", "ready")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_WATCHED);
    replace((data ?? []).flatMap((row) => {
      const job = toRecordingJob(row);
      return job ? [job] : [];
    }), true);
  } catch {
    // A failed read is a network blip, not a state change. Keeping the last
    // snapshot means a flaky connection does not make a running job disappear
    // from the screen and then come back.
  } finally {
    inFlight = false;
    schedule(state.jobs.some((job) => job.status === "processing") ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }
}

function schedule(delay: number): void {
  if (!userId) return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void refresh(); }, delay);
}

/**
 * Begin watching this account's recordings. Idempotent, and switching accounts
 * clears the previous one's jobs rather than leaving them on screen.
 */
export function startRecordingJobsWatch(nextUserId: string | null): void {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  // `loaded: false` again on every account switch: until the new account's jobs
  // have been read, a card must fall back to what its message claims rather than
  // to the previous account's (empty) answer.
  replace([], false);
  if (userId) schedule(0);
}

/**
 * Ask the server to look at a job now.
 *
 * Only an accelerant — the cron gets there on its own within a minute. Used
 * after a retry, and by a watcher that has seen a job sit still long enough to
 * suspect its original kick was lost.
 */
export async function kickRecordingJob(id: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`/api/recordings/jobs/${encodeURIComponent(id)}/kick`, {
      headers: { Authorization: `Bearer ${token}` },
      method: "POST",
    });
  } catch {
    /* the cron is the guarantee; this was the shortcut */
  } finally {
    schedule(0);
  }
}

/**
 * Retry a failed job FROM THE STAGE THAT FAILED.
 *
 * The RPC re-checks ownership itself and resets the row; the kick just means the
 * student does not wait for the next cron tick to see it move.
 */
export async function retryRecordingJob(id: string): Promise<void> {
  const { error } = await supabase.rpc("retry_recording_job", { p_job_id: id });
  if (error) throw new Error(error.message);
  await kickRecordingJob(id);
}
