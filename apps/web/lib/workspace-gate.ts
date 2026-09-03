// What the workspace does when the sign-in session is not there.
//
// 🔴🔴🔴 A SESSION THAT BLINKS IS NOT A SIGN-OUT, AND TREATING IT AS ONE DESTROYED WORK. Owner,
// 2026-09-02/03, three reports in one family: *"going back into previous chats... it was glitchy,
// it wasn't even showing up"*, and — the sharpest — a canvas that was fully loaded and working
// dropped back to the front door in the middle of an ordinary send. The message was gone, the
// address had lost its `?c=`, and the database showed no new row: nothing was written anywhere.
//
// The mechanism is one line of the workspace layout: `if (loading || !session) return
// <WorkspaceWaiting />`. That swaps the entire shell — and every child under it — for a holding
// screen the instant `session` is falsy. React unmounts the canvas, the composer, the turn in
// flight and every promise's setState target with it. A blink of a few hundred milliseconds and
// the learner's question is gone, with nothing saved, because a turn only writes when its answer
// lands. The redirect fired beside it takes the address away too.
//
// 🔴 AND THE SESSION REALLY DOES BLINK, BY THE AUTH LIBRARY'S OWN DESIGN. `@supabase/auth-js`
// 2.107.0 runs `_recoverAndRefresh()` on every `visibilitychange` back to visible — every time you
// leave the tab and come back. If the refresh returns a non-retryable error it calls
// `_removeSession()`, which ends in `_notifyAllSubscribers('SIGNED_OUT', null)`: a sign-out event
// nobody asked for, with a null session, in a browser where the person is still signed in. The
// commonest way to get one is two tabs open on the app, which is how this owner works: refresh
// tokens rotate, the second tab presents one the first has already spent, the server says no, and
// that tab signs itself out. `AuthProvider` forwards whatever the event carries, so the layout sees
// `session: null` and takes the whole workspace down.
//
// 🔴 THE FIX IS TO WAIT, NOT TO TRUST. A gate that stopped believing a null session would be a
// security hole; a gate that believes it instantly is this bug. So the gate holds — keeps the
// workspace mounted and running, redirects nothing — for a bounded moment, and then gives up and
// sends the person to sign in exactly as before. A blink is survived; a real sign-out costs a few
// seconds on a screen that cannot reach the database anyway, because every read is row-policied on
// the token that just went away.
//
// 🔴 AND ONLY FOR SOMEBODY WHO HAD A SESSION. A visitor who arrives signed out has nothing to lose
// and nothing to wait for: they are sent to sign in on the first render, which is today's behaviour
// and stays it.
//
// PURE. No React, no I/O, no storage. What the gate DOES is decided here; when it re-decides is the
// layout's.

/**
 * How long the workspace keeps running after its session disappears.
 *
 * 🔴 LONG ENOUGH TO OUTLAST A REFRESH, SHORT ENOUGH TO NOT BE A LIE. A token refresh against
 * Supabase is one HTTPS round trip; four seconds covers a slow one twice over and a retry, and is
 * far below the point at which somebody staring at a working page would call it stuck. Nothing in
 * the workspace can reach the database during it, so the cost of the wait is only the wait.
 */
export const SESSION_GRACE_MS = 4_000;

export type WorkspaceGate =
  /** No session yet and none ever seen: the first read is still settling. Hold the arrival screen. */
  | "waiting"
  /**
   * There was a session a moment ago and there is not one now.
   *
   * 🔴 THE WORKSPACE STAYS MOUNTED AND NOTHING IS REDIRECTED. This is the whole point: an answer
   * being written, a file being read, a document being built are all still running, and the
   * overwhelmingly likely truth is that a token is being refreshed. Taking the page down here is
   * what lost the owner's message.
   */
  | "hold"
  /** The session is gone and did not come back. Send them to sign in, keeping where they were. */
  | "sign-in"
  /** Signed in. */
  | "open";

export function workspaceGate(input: {
  /** The auth provider has not finished its first read. */
  loading: boolean;
  /** There is a session right now. */
  hasSession: boolean;
  /** There was a session at some point in this page's life. */
  hadSession: boolean;
  /** How long ago the session went away. Meaningless unless `hadSession` and not `hasSession`. */
  msSinceLost: number;
  graceMs?: number;
}): WorkspaceGate {
  const { graceMs = SESSION_GRACE_MS, hadSession, hasSession, loading, msSinceLost } = input;
  if (hasSession) return "open";
  // 🔴 THE GRACE OUTRANKS `loading`, AND THAT ORDER IS THE FIX. `AuthProvider` sets `loading` false
  // on every auth event including the spurious sign-out, so a gate that asked about loading first
  // would fall straight through to the redirect on exactly the event this exists to survive.
  if (hadSession && msSinceLost < graceMs) return "hold";
  if (hadSession) return "sign-in";
  return loading ? "waiting" : "sign-in";
}
