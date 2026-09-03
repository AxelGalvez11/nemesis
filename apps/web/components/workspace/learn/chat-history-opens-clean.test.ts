import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 GOING BACK INTO A PREVIOUS CHAT. Owner, 2026-09-02: *"make sure that chat, going back into
// chat history works well, because sometimes there, there was a problem with, like, going back into
// previous chats, and it was, like, glitchy, it wasn't even showing up."*
//
// Reproduced on production the same day, signed in as the owner. Opening `/learn?c=<id>` for a row
// the browser could not read painted the header as "New canvas", the body as nothing at all, and
// said NOTHING about a failure — while the address bar still named the conversation that had been
// asked for. Two mechanisms, both in `use-canvas-session.ts`'s load effect:
//
//   1. A named canvas that came back empty fell through to `newCanvas()`. `loadCanvas` ends in
//      `.maybeSingle()` under an `auth.uid() = user_id` row policy, so a row the learner OWNS comes
//      back as `{ data: null, error: null }` — the same answer as a row that does not exist — for
//      the whole of any token refresh, plus every network failure on a device that has no local
//      copy. The catch branch beside it already refused to mint in exactly this situation, in
//      writing; the empty branch ignored that and minted anyway.
//   2. A sidebar row pushes `/learn?c=<id>`, which changes only the query string, so nothing
//      remounts and every piece of this hook's state survives the switch. Three of them were fixed
//      earlier that day (`aside`, the thread, the question bubble); the rest still crossed over,
//      including the error banner from a canvas that had just failed to open.
//
// These guards are structural because the subject is a React hook that reads a database: there is
// no pure seam to call. They assert the SHAPE of the two rules rather than any wording, so a
// rewrite that keeps the rules stays green and a rewrite that drops one goes red.

const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");

/** Source with comments removed, so a guard can never be satisfied by its own explanation. */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

/** The `{ … }` that opens at `from`, matched by counting braces. */
function block(source: string, from: number): string {
  const open = source.indexOf("{", from);
  assert.ok(open >= 0, "no block opens here — the load effect has been restructured");
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail("unbalanced braces while reading the load effect");
}

/** The load effect, from its own marker to the dependency array that closes it. */
function loadEffect(): string {
  const start = SESSION.indexOf("// Load, or start fresh.");
  assert.ok(start >= 0, "the load effect lost its marker — repoint these guards at it");
  const end = SESSION.indexOf("}, [canvasId,", start);
  assert.ok(end > start, "the load effect's dependency array changed shape");
  return withoutComments(SESSION.slice(start, end));
}

test("🔴🔴🔴 a chat named in the address is never replaced by a blank canvas", () => {
  const effect = loadEffect();
  // The read happens inside the async body; the branch that runs when a canvas WAS named is the
  // one that must not be able to fall out of the bottom into `newCanvas()`.
  const asyncBody = effect.indexOf("void (async");
  assert.ok(asyncBody >= 0, "the load no longer runs in an async body");
  const namedBranch = effect.indexOf("if (canvasId)", asyncBody);
  assert.ok(namedBranch >= 0, "the load effect no longer branches on having been given an id");
  const named = block(effect, namedBranch);

  // 🔴 THE INVARIANT, AND IT IS ABOUT FALLING THROUGH RATHER THAN ABOUT ANY PARTICULAR WORDING.
  // Every way out of this branch has to be a `return`: one for the canvas that loaded, one for the
  // read that threw, one for the read that came back with nothing. Reaching the bottom of the
  // branch means reaching `newCanvas()`, which is a blank page standing where a conversation was.
  const statements = named
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(
    statements.at(-1),
    "return;",
    "the branch for a named canvas can fall through to newCanvas() — a chat that failed to load opens as a new, empty one",
  );

  // 🔴 AND THE LEARNER IS TOLD. A silent refusal to mint is the 2026-08-23 defect (a holding screen
  // that never settles) rather than this one; the branch has to leave a sentence behind it.
  assert.ok(
    named.includes("setError(CANVAS_DID_NOT_OPEN)"),
    "a canvas that did not open says nothing, so the learner reads a blank screen either way",
  );
  // Both failures say the same thing, because the read cannot tell them apart.
  assert.equal(
    named.match(/setError\(CANVAS_DID_NOT_OPEN\)/g)?.length,
    2,
    "the read that threw and the read that came back empty no longer say the same thing",
  );
  // 🔴 `newCanvas()` STAYS, for the front door — it is only unreachable with an id in hand.
  assert.ok(effect.includes("newCanvas()"), "the front door lost its way to mint a canvas");
});

test("🔴🔴 opening another chat puts the last one down first", () => {
  const effect = loadEffect();
  const asyncBody = effect.indexOf("void (async");
  // Everything before the read is what the learner is looking at while it runs.
  const beforeTheRead = effect.slice(0, asyncBody);
  assert.ok(
    /setReady\(false\)/.test(beforeTheRead),
    "the outgoing conversation stays painted under the incoming chat's address for the length of the read",
  );
  assert.ok(
    /forgetPreviousCanvas\(\)/.test(beforeTheRead),
    "the previous chat's thinking caption, research plan, document card and error banner cross into the new chat",
  );
  // 🔴 AND ONLY WHEN A DIFFERENT CANVAS IS BEING OPENED. The URL learning our own id after the first
  // save re-runs this effect mid-conversation; resetting there would blank a live turn.
  const guard = effect.indexOf("canvasId === latest.current.id");
  assert.ok(guard >= 0 && guard < effect.indexOf("setReady(false)"), "the self-address guard no longer runs first");
});

test("🔴🔴 every piece of per-canvas state is put down, or excused by name", () => {
  const start = SESSION.indexOf("export function useCanvasSession(");
  assert.ok(start >= 0, "the hook was renamed — repoint this guard");
  const hook = withoutComments(SESSION.slice(start));
  const declared = hook.indexOf("const forgetPreviousCanvas = useCallback(");
  assert.ok(
    declared >= 0,
    "nothing puts the previous chat's state down, so opening another conversation shows pieces of the last one",
  );
  const forget = block(hook, declared);

  /**
   * State that describes the app rather than the canvas on screen, so it survives a switch.
   *
   * 🔴 NAMED, NOT INFERRED. Adding a field here is a decision someone has to write down; leaving
   * one out by accident is how the three fields fixed on 2026-09-02 got left behind in the first
   * place, and the failure is invisible until a learner switches chats.
   */
  const carriesOver = new Map([
    ["setCanvas", "the load effect owns it — it decides between holding the arrival screen and putting the loaded canvas up"],
    ["setReady", "the same decision, and splitting it across two functions is how they start disagreeing"],
  ]);

  const setters = [...hook.matchAll(/const \[\s*\w+\s*,\s*(set\w+)\s*\]\s*=\s*useState/g)]
    .map((m) => m[1])
    .filter((name): name is string => Boolean(name));
  assert.ok(setters.length > 20, `only ${setters.length} pieces of state found — the match no longer reads this hook`);

  for (const setter of setters) {
    if (carriesOver.has(setter)) {
      assert.ok(
        !forget.includes(`${setter}(`),
        `${setter} is listed as carrying over AND reset — decide which, and say why in the map above`,
      );
      continue;
    }
    assert.ok(
      forget.includes(`${setter}(`),
      `${setter} survives a chat switch: opening another conversation would show it. Reset it in forgetPreviousCanvas, or add it to carriesOver with a reason.`,
    );
  }
});

test("🔴 starting over is a canvas change too", () => {
  const reset = block(withoutComments(SESSION), withoutComments(SESSION).indexOf("const reset = useCallback("));
  assert.ok(
    reset.includes("forgetPreviousCanvas()"),
    "a fresh canvas inherits the previous one's caption, plan, card and error banner",
  );
});

test("🔴🔴 the sentence is somewhere a learner can read it", () => {
  // 🔴 FOUND ON SCREEN, NOT IN REVIEW. The arrival screen's holding branch draws the character at
  // `station="centre"`, and this paragraph was an ordinary flex child of the same centred box — so
  // the words ran straight through the mascot's face. It went unnoticed for as long as this branch
  // was only reachable by a read that THREW; a chat that will not open lands here now, which makes
  // it the ordinary failure screen. `CanvasThinking` is the only other thing that renders in this
  // slot and it sits at the foot of the page, so the two share one offset.
  const canvas = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  const branch = canvas.slice(canvas.indexOf("if (!session.ready) {"));
  const shown = branch.slice(0, branch.indexOf("</CanvasSurface>"));
  const paragraph = shown.slice(shown.indexOf("session.error"));
  assert.ok(
    /absolute[^"]*bottom-\[104px\]/.test(paragraph),
    "the failure sentence is centred again, which is exactly where the character stands",
  );
  assert.ok(
    /bottom-\[104px\]/.test(readFileSync(new URL("./canvas-thinking.tsx", import.meta.url), "utf8")),
    "the thinking caption moved, so the failure sentence beside it is now at a different height for no reason",
  );
});

test("🔴 the sentence a learner reads has no em dash (owner 2026-08-25)", () => {
  const message = SESSION.match(/const CANVAS_DID_NOT_OPEN = "([^"]+)"/);
  assert.ok(message, "CANVAS_DID_NOT_OPEN is gone — the two failure paths have nothing to share");
  assert.ok(!(message[1] ?? "").includes("—"), "an em dash reached a product-facing string");
});

console.log("chat-history-opens-clean.test.ts OK");
