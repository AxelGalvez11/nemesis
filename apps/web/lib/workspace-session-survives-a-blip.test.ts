import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SESSION_GRACE_MS, workspaceGate } from "./workspace-gate";

// 🔴🔴🔴 A CANVAS THAT WAS LOADED AND WORKING DROPPED BACK TO THE FRONT DOOR MID-SEND. Reproduced
// on production 2026-09-03 on build b5e099fc, signed in as the owner, on a canvas of 30 sources and
// 3,663 excerpts: it opened correctly with its full history, a message was typed and sent, and
// about thirty seconds later the screen was the blank front door, `location.href` had lost its
// `?c=`, and the database showed NO new row. The message was not saved anywhere. It was gone.
//
// The cause is one line of `app/(workspace)/layout.tsx`:
//
//     if (loading || !session) return <WorkspaceWaiting />;
//
// which swaps the entire shell — and every child under it — the instant `session` is falsy. React
// unmounts the canvas, the composer and the turn in flight together, and a turn only writes when
// its answer lands, so nothing reaches the database. The redirect beside it takes the address too.
//
// And the session really does go falsy without anybody signing out. `@supabase/auth-js` 2.107.0
// runs `_recoverAndRefresh()` on every `visibilitychange` back to visible; a refresh that fails
// non-retryably calls `_removeSession()`, which ends in `_notifyAllSubscribers('SIGNED_OUT', null)`.
// Two tabs on one account produce exactly that, routinely: refresh tokens rotate, the second tab
// spends one the first already used, the server refuses, and that tab signs itself out while the
// person is still signed in.
//
// So the gate holds for a bounded moment instead of believing it instantly.

test("🔴🔴🔴 a session that blinks does not take the workspace down with it", () => {
  const open = { hadSession: true, hasSession: true, loading: false, msSinceLost: 0 };
  assert.equal(workspaceGate(open), "open");

  // THE BUG, AS A VALUE. Session gone a moment ago, after there had been one: the workspace keeps
  // running. Before this existed the layout returned the waiting screen here and unmounted the turn.
  assert.equal(
    workspaceGate({ hadSession: true, hasSession: false, loading: false, msSinceLost: 200 }),
    "hold",
    "a two-hundred-millisecond gap in the session unmounts the workspace and loses the turn in flight",
  );
  assert.equal(
    workspaceGate({ hadSession: true, hasSession: false, loading: false, msSinceLost: SESSION_GRACE_MS - 1 }),
    "hold",
    "the grace ends early",
  );

  // 🔴 AND `loading` MUST NOT SHORT-CIRCUIT IT. `AuthProvider` sets `loading` false on every auth
  // event, the spurious sign-out included, so a gate that asked about loading first would fall
  // straight through to the redirect on the one event this exists to survive.
  assert.equal(
    workspaceGate({ hadSession: true, hasSession: false, loading: true, msSinceLost: 200 }),
    "hold",
    "the loading flag jumps the queue and the blip takes the workspace down again",
  );
});

test("🔴🔴 a session that is really gone still reaches sign-in", () => {
  assert.equal(
    workspaceGate({ hadSession: true, hasSession: false, loading: false, msSinceLost: SESSION_GRACE_MS }),
    "sign-in",
    "a workspace whose session never came back stays mounted for ever, which is the worse failure",
  );
  assert.equal(
    workspaceGate({ hadSession: true, hasSession: false, loading: false, msSinceLost: 60_000 }),
    "sign-in",
  );
  // Somebody who arrived signed out has nothing to wait for and nothing to lose: today's behaviour,
  // unchanged, and the grace must never apply to them.
  assert.equal(
    workspaceGate({ hadSession: false, hasSession: false, loading: false, msSinceLost: 0 }),
    "sign-in",
    "a signed-out visitor is held in the workspace instead of being sent to sign in",
  );
  assert.equal(
    workspaceGate({ hadSession: false, hasSession: false, loading: true, msSinceLost: 0 }),
    "waiting",
    "the first read of the session now flashes the sign-in redirect before it has settled",
  );
});

test("🔴 the grace is long enough to outlast a refresh and short enough not to be a lie", () => {
  assert.ok(SESSION_GRACE_MS >= 2_000, `${SESSION_GRACE_MS}ms will not survive one slow token refresh`);
  assert.ok(SESSION_GRACE_MS <= 10_000, `${SESSION_GRACE_MS}ms is long enough for a signed-out page to look signed in`);
});

const LAYOUT = readFileSync(new URL("../app/(workspace)/layout.tsx", import.meta.url), "utf8");
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("🔴🔴 the layout asks the gate, and holds without unmounting or redirecting", () => {
  const layout = strip(LAYOUT);
  assert.ok(layout.includes("workspaceGate({"), "the layout decides for itself again, so the truth table above guards nothing");
  // The two states with no workspace paint the waiting screen. `hold` is deliberately not one:
  // painting it would unmount the children just as surely as the old early return did.
  assert.match(
    layout,
    /gate === "waiting" \|\| gate === "sign-in"/,
    "a held session paints the waiting screen, which unmounts the turn it was meant to protect",
  );
  assert.ok(!/gate === "hold"[^\n]*WorkspaceWaiting/.test(layout), "a held session is being shown the waiting screen");
  // 🔴 AND IT MUST NOT REDIRECT WHILE HOLDING, or the address loses its `?c=` for a blink.
  const redirect = layout.slice(layout.indexOf("signInRedirect(pathname"));
  assert.ok(redirect.length > 0, "the sign-in redirect is gone — a really signed-out visitor now stays put");
  const guardBeforeRedirect = layout.slice(0, layout.indexOf("signInRedirect(pathname"));
  assert.match(
    guardBeforeRedirect.slice(guardBeforeRedirect.lastIndexOf("useEffect")),
    /gate !== "sign-in"/,
    "the redirect fires on a blip, so a healthy canvas loses its address",
  );
});

test("🔴🔴 work done while the session was away is pushed when it comes back", () => {
  const session = strip(readFileSync(new URL("../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8"));
  // Holding the workspace through a blip means `uid` is null for those seconds, and `saveCanvas`
  // takes `uid` — so every write lands in the browser only. Without this the answer stayed on
  // screen, reached nothing, and was gone on the next reload: half a fix, and the invisible half.
  assert.match(session, /const savedUnder = useRef\(uid\);/, "nothing tracks which account the canvas was last written under");
  assert.match(
    session,
    /if \(uid && !before\) void saveCanvas\(uid, latest\.current\);/,
    "a session that comes back does not push what was written while it was away",
  );
});

console.log("workspace-session-survives-a-blip.test.ts OK");
