// What a half-finished practice test consists of, and how it survives leaving
// the page.
//
// Owner 2026-08-06: "partially complete a generated test, leave, reopen —
// progress is gone." It was not a bug in saving; there was no saving. `picks`,
// `index` and `picked` were plain component state, so closing the dialog
// unmounted the sitting and every answer with it.
//
// 🔴 THE POSITION IS NOT STORED, IT IS DERIVED. `index` is exactly how many
// questions have been answered (clamped to the last one), so storing it beside
// `picks` would create two facts that can disagree — and the one that reads
// "which question am I on" would be the one that goes wrong. One value, one
// truth: see testQuestionIndex.
//
// Storage is per browser, keyed by account AND test. A bare key would restore
// one account's sitting into another's on a shared browser. The tradeoff,
// stated plainly: a sitting does not follow the student to a different browser
// or device. Putting it in the database instead is tempting because
// study_artifacts.content is jsonb and needs no migration — and it is wrong.
// That column is read by bestAttempt, by the Tests tab's Score column, and by
// the agent's read_study_artifact. A half-finished sitting living there becomes
// something the model can see and narrate about, and costs a network write per
// answer with a failure path attached.

const VERSION = 1;

export interface TestSessionState {
  /** One answered option index per question, in order. */
  readonly picks: readonly number[];
  /** The option locked on the CURRENT question, revealed but not yet advanced
   *  past — or null before one is chosen. */
  readonly picked: number | null;
}

export const EMPTY_TEST_SESSION: TestSessionState = { picked: null, picks: [] };

export function testSessionKey(uid: string | null, artifactId: string | null): string | null {
  if (!uid || !artifactId) return null;
  return `nemesis.web.test-session.${uid}.${artifactId}`;
}

/** A sitting worth restoring. An untouched one is never written at all. */
export function hasTestProgress(state: TestSessionState): boolean {
  return state.picks.length > 0 || state.picked !== null;
}

/**
 * Which question is on screen, from the answers alone.
 *
 * Mirrors the player exactly: every answer advances by one, and the last
 * question stays on screen once answered so the finished sitting can be scored
 * there. Deriving it also keeps the Explain panel honest, since that keys off
 * the same number.
 */
export function testQuestionIndex(picks: readonly number[], questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.min(picks.length, questionCount - 1);
}

/**
 * Parse a stored sitting. Everything is validated against the CURRENT test:
 * stored text is data from a previous version of the app, and the questions may
 * have been edited from the Explain panel since.
 *
 * `optionCounts` is how many options each question has, in order — the bounds
 * every stored answer has to fall inside. An answer pointing at an option that
 * no longer exists would lock a nonexistent button and make the
 * "is this the correct one" comparison meaningless.
 *
 * 🔴 A COMPLETE SITTING IS NOT RESTORABLE, IT IS FINISHED. If the stored picks
 * cover every question, the attempt was already scored and saved before the
 * student left — restoring it would make reopening the test silently record a
 * SECOND attempt, because the player writes one the moment its answer count is
 * complete. Anything at or past the end restores as empty.
 */
export function parseTestSession(raw: string | null, optionCounts: readonly number[]): TestSessionState {
  if (!raw || optionCounts.length === 0) return EMPTY_TEST_SESSION;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_TEST_SESSION;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY_TEST_SESSION;
  const record = parsed as Record<string, unknown>;
  if (record.version !== VERSION) return EMPTY_TEST_SESSION;

  const rawPicks = Array.isArray(record.picks) ? record.picks : [];
  // Any single bad answer discards the whole sitting rather than silently
  // shifting every later answer onto the wrong question.
  if (rawPicks.length >= optionCounts.length) return EMPTY_TEST_SESSION;
  const picks: number[] = [];
  for (const [position, value] of rawPicks.entries()) {
    const options = optionCounts[position] ?? 0;
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= options) return EMPTY_TEST_SESSION;
    picks.push(value as number);
  }

  // `picked` belongs to the question AFTER the answered ones, so it is bounded
  // by that question's option count — not by any other's.
  const currentOptions = optionCounts[picks.length] ?? 0;
  const rawPicked = record.picked;
  const picked = Number.isInteger(rawPicked) && (rawPicked as number) >= 0 && (rawPicked as number) < currentOptions
    ? (rawPicked as number)
    : null;

  return { picked, picks };
}

export function serializeTestSession(state: TestSessionState): string {
  return JSON.stringify({ picked: state.picked, picks: state.picks, version: VERSION });
}
