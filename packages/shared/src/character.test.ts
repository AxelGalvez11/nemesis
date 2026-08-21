import assert from "node:assert/strict";
import { test } from "node:test";

import { BotEngine } from "./bloub/engine.ts";
import { lookTarget } from "./bloub/gaze.ts";
import { DEMI_VIEWBOX, RAYON } from "./bloub/repere.ts";
import { SEQUENCE, STATE_BY_ID, type StateId } from "./bloub/states.ts";

import { centredLook, idleAim } from "./character/gaze.ts";
import { ARC_POOL, ARC_STOPS, DOT_POOL } from "./character/pool.ts";
import { speedOf, stationOf } from "./character/stations.ts";

const ALL: StateId[] = [...SEQUENCE, "swirl"];

/**
 * Every frame the renderer can be asked to draw.
 *
 * 🔴 IT SWEEPS ORDERED PAIRS, NOT STATES. During a cross-fade the engine emits BOTH
 * states' decor at once, so the worst case never appears in any single animation — it
 * appears between two of them. Sweeping the 225 pairs is the difference between a pool
 * that holds and one that quietly drops the last two particles of an explosion.
 */
function* everyFrame() {
  for (const from of ALL) {
    for (const to of ALL) {
      const engine = new BotEngine(RAYON, from);
      engine.setState(to, 1);
      for (let i = 0; i <= 240; i += 1) yield engine.sample(i / 60);
    }
  }
}

test("🔴 the decor pool is big enough for every frame the engine can produce", () => {
  let dots = 0;
  let arcs = 0;
  for (const frame of everyFrame()) {
    dots = Math.max(dots, frame.dots.length);
    arcs = Math.max(arcs, frame.arcs.length);
  }
  // Not "the pool is some round number": the pool is sized ABOVE a measurement, and
  // this is the measurement. A new animation with more particles than the pool holds
  // renders with some of them missing and nothing else goes wrong — no error, no
  // warning, just an explosion that is quietly smaller than it was drawn to be.
  assert.ok(dots <= DOT_POOL, `${dots} dots exceeds the pool of ${DOT_POOL}`);
  assert.ok(arcs <= ARC_POOL, `${arcs} arcs exceeds the pool of ${ARC_POOL}`);
  // And the pool is not absurdly oversized either — that would be dead DOM on a
  // decorative element mounted on every canvas.
  assert.ok(DOT_POOL <= dots + 6, `the dot pool is ${DOT_POOL - dots} larger than it needs to be`);
  assert.ok(ARC_POOL <= arcs + 6, `the arc pool is ${ARC_POOL - arcs} larger than it needs to be`);
});

test("🔴 every gradient has exactly the number of stops the renderer preallocates", () => {
  // The renderer writes into three fixed <stop> nodes per arc rather than building
  // them per frame. A four-stop gradient would render with its last colour dropped,
  // which reads as a ring that fades wrong rather than as a bug.
  for (const frame of everyFrame()) {
    for (const arc of frame.arcs) {
      assert.equal(arc.grad.stops.length, ARC_STOPS, `arc ${arc.id} has ${arc.grad.stops.length} stops`);
    }
  }
});

test("🔴 nothing the engine draws leaves the viewBox", () => {
  // The viewBox is a module constant and must stay one: recomputing it per frame would
  // resize the element while it animates, which is a layout shift caused by decoration.
  // So instead the CONTENT has to stay inside it.
  let worst = 0;
  let where = "";
  for (const frame of everyFrame()) {
    for (const d of frame.dots) {
      const reach = Math.max(Math.abs(d.x) + d.r, Math.abs(d.y) + d.r);
      if (reach > worst) {
        worst = reach;
        where = `dot at ${d.x.toFixed(1)},${d.y.toFixed(1)}`;
      }
    }
  }
  assert.ok(worst <= DEMI_VIEWBOX, `${where} reaches ${worst.toFixed(1)}, past ${DEMI_VIEWBOX}`);
});

test("the character comes forward only for the states that mean the system has the floor", () => {
  // The rule is not "anything eye-catching". Coming to the middle says the learner is
  // waiting on real work, and it is worth nothing if a wink does it too.
  assert.equal(stationOf("thinking"), "centre");
  assert.equal(stationOf("orbit"), "centre");
  assert.equal(stationOf("comet"), "centre");
  for (const id of ["idle", "wink", "wide", "notify", "sleep", "egg"] as StateId[]) {
    assert.equal(stationOf(id), "corner", `${id} should not take the middle of the surface`);
  }
});

test("swirl plays slower than it was measured, and nothing else is retimed", () => {
  // Owner 2026-08-20. The dial lives outside the vendored table so re-vendoring stays a
  // plain copy; this asserts the dial is actually reaching the state it names.
  assert.ok(speedOf("swirl") < 1, "swirl is back at full speed");
  for (const id of ALL) {
    if (id === "swirl") continue;
    assert.equal(speedOf(id), 1, `${id} was retimed without being asked for`);
  }
});

// ── the resting gaze ────────────────────────────────────────────────────────
//
// Owner 2026-08-20: "the mascot should be looking around not just staring away to the
// right." These measure the fix rather than assert that the code that produces it
// exists, because a look-around is a claim about a distance travelled on screen — and
// the broken version was not still, it was drifting ±7° and looked stuck anyway.

/**
 * Which gaze cone the engine is driven through for one measurement.
 *
 * 🔴 THE SUITE USED TO MEASURE A PATH THE APP DOES NOT TAKE (owner 2026-08-21). This function
 * drove the vendored `lookTarget` — the OLD left-biased cone, `-TURN + nx * YAW_MAX`, which spans
 * -42° to -10° and is never positive — while `character/gaze.ts` documented an envelope measured
 * on `centredLook`, which is what `BloubBot.tsx` actually calls. Every test below was green and
 * every number in that header was a claim about code no test touched. Nothing was broken; the
 * suite was simply pointed one file to the left. It now drives `"centred"`.
 *
 * `"vendored"` is KEPT rather than deleted, because the header's "markedly SAFER than the old
 * ones" is a comparison, and a comparison with nothing to compare against is a slogan. It is the
 * only reason this file still imports `lookTarget`, and `BloubBot.tsx` is guarded against
 * importing it at all — see the source guards at the foot of the file.
 */
type Cone = "still" | "centred" | "vendored";

/**
 * Where the inner eye sits, over a minute of scene clock.
 *
 * 🔴 A MINUTE FROM COLD, WHICH IS NOT THE WINDOW THE HEADER'S ENVELOPE USES, AND THE DIFFERENCE
 * IS NOT COSMETIC. `character/gaze.ts` quotes thirty minutes with the first two seconds thrown
 * away, because `BotEngine.setLook` eases toward a new target over `LOOK_MORPH` from wherever the
 * look is — and at t=0 that is `NO_LOOK`, so the resting pose still commands and the head is
 * swinging in from `REST_GAZE`. That opening swing is REAL — it is what a learner sees on the
 * first second of every mount — so this function keeps it, and the numbers below are therefore
 * larger than the header's. Thirty minutes of scene clock is minutes of wall clock in a test
 * suite, which is why the header carries the steady state and this carries what a suite can pay
 * for. Both are stated with their window; neither is quoted as the other.
 */
function eyeTravel(cone: Cone): { x: number; y: number; hidden: number; limb: number } {
  const engine = new BotEngine(RAYON, "idle");
  let xLo = Infinity, xHi = -Infinity, yLo = Infinity, yHi = -Infinity, hidden = 0, limb = 1;
  for (let i = 0; i < 60 * 60; i += 1) {
    const t = i / 60;
    if (cone !== "still") {
      const { nx, ny } = idleAim(t);
      const aim = { nx, ny, tour: 1, pointer: false };
      engine.setLook(cone === "centred" ? centredLook(aim) : lookTarget(aim), t);
    }
    const frame = engine.sample(t);
    for (let e = 0; e < 2; e += 1) {
      const eye = frame.eyes[e];
      if (!eye) {
        hidden += 1;
        continue;
      }
      // matrix(a,b,c,d,e,f) — e and f are the eye's centre in viewBox units. parseFloat, not
      // Number: `f` still carries the closing paren, and Number("12)") is NaN, which would
      // pass through Math.min and fail this as "came within NaN of the limb".
      const parts = eye.matrix.split("(")[1]!.split(",");
      const x = parseFloat(parts[4]!);
      const y = parseFloat(parts[5]!);
      // How near the eye's centre is to the sphere's edge, in radius units. 0 is the limb.
      limb = Math.min(limb, Math.sqrt(Math.max(0, 1 - (x / RAYON) ** 2 - (y / RAYON) ** 2)));
      // 🔴 TRAVEL IS MEASURED ON ONE EYE, NOT BOTH. Taking the extremes across the pair folds
      // in the ~31° separation between them, which is a constant: it inflated the resting
      // baseline from 17px to 58px and nearly hid the difference this test exists to see.
      if (e !== 0) continue;
      xLo = Math.min(xLo, x); xHi = Math.max(xHi, x);
      yLo = Math.min(yLo, y); yHi = Math.max(yHi, y);
    }
  }
  return { x: xHi - xLo, y: yHi - yLo, hidden, limb };
}

test("🔴 the resting character looks AROUND, not off to one side", () => {
  // The engine's resting pose is `REST_GAZE = { yaw: 28.49, pitch: 28.62 }` — up and to
  // the right — and the drift on top of it is deliberately small ("assez retenu"). The
  // phone rendered exactly that for a year of idle seconds because its loop never entered
  // the engine's look mode at all, and the owner's word for the result was "staring".
  //
  // Measured, one minute of scene clock from cold, on the cone the phone actually uses: the
  // inner eye covers 81.1px horizontally and 56.6px vertically against the drift's 17.0px and
  // 14.3px. The multiples below are floors well under those, so an amplitude nudged down a
  // little does not fail this — what fails it is the gaze being switched off again.
  const still = eyeTravel("still");
  const alive = eyeTravel("centred");
  assert.ok(
    alive.x > still.x * 4,
    `the idle gaze covers ${alive.x.toFixed(0)}px against the drift's ${still.x.toFixed(0)}px — that is not looking around`,
  );
  assert.ok(alive.y > still.y * 2, `the gaze barely changes height: ${alive.y.toFixed(0)}px`);
});

test("🔴 looking around never sends an eye behind the sphere", () => {
  // The eyes live on a sphere and the engine DROPS one past the limb — correct for the
  // orbit, which is a deliberate journey, and a face that flickers half away for a
  // resting character. `idleAim`'s amplitudes are chosen to stay inside the cone; this is
  // the check that says so, since nothing about the arithmetic makes it obvious.
  const alive = eyeTravel("centred");
  assert.equal(alive.hidden, 0, "an eye crossed the limb and vanished while the character rested");
  assert.ok(alive.limb > 0.25, `an eye came within ${alive.limb.toFixed(2)} of the limb`);

  // 🔴 AND THE HEADER'S "MARKEDLY SAFER THAN THE OLD ONES" IS MEASURED HERE RATHER THAN ASSERTED
  // THERE (owner 2026-08-21). `character/gaze.ts` claims the re-centred cone's worst case is an
  // eye centre 41.2° off the front against the vendored cone's 62.1°, where 90° is where the
  // engine drops the eye from the frame — a counter-intuitive claim, because the new cone is the
  // one that LOOKS wider. Nothing checked it, and it is the sort of claim that survives its own
  // code being reverted. `limb` is the cosine of that angle, so a bigger number is further from
  // the edge: 0.544 against 0.469 over this minute from cold, and 0.753 against 0.469 in the
  // header's thirty-minute steady state, where the opening swing from `REST_GAZE` is not folded
  // in. Compared rather than pinned to a constant, so a future re-tuning of the amplitudes has to
  // stay better than the bearing it replaced instead of merely staying above a number.
  const vendored = eyeTravel("vendored");
  assert.ok(
    alive.limb > vendored.limb,
    `the re-centred cone parks an eye NEARER the limb (${alive.limb.toFixed(3)}) than the vendored one it replaced (${vendored.limb.toFixed(3)}) — the header claims the opposite`,
  );
});

test("🔴 the idle target never reaches the edge of the cone", () => {
  // `lookTarget` takes a value the caller has clamped to ±1, so noise that overshoots does
  // not look wider — it flattens against the clamp, and a flat stretch of gaze IS the
  // stare being fixed. Raising the amplitudes in `character/gaze.ts` is the way to break
  // this, and it is meant to be broken loudly rather than to quietly stop moving.
  let worst = 0;
  for (let i = 0; i < 60 * 600; i += 1) {
    const { nx, ny } = idleAim(i / 60);
    worst = Math.max(worst, Math.abs(nx), Math.abs(ny));
  }
  assert.ok(worst < 0.98, `the idle gaze target reaches ${worst.toFixed(3)} and is clipping`);
});

test("every animation the lab lists is a real one", () => {
  // A typo in the lab's list renders an empty cell rather than failing, and an empty
  // cell looks like an animation that has not been built yet.
  for (const id of ALL) assert.ok(STATE_BY_ID.get(id), `${id} is not in the catalogue`);
});

// ── source guards ───────────────────────────────────────────────────────────
//
// Same technique `canvas-motion.test.ts` uses, and for the same reason: these are facts
// about wiring, and wiring has no return value to inspect. Comments are stripped first —
// a file that explains why something is wrong necessarily contains the wrong thing.

// 🔴 THE GUARDS REACH ACROSS THE MONOREPO, BECAUSE THIS FILE NO LONGER LIVES IN THE APP
// THEY GUARD. It was `apps/web/lib/character/character.test.ts`; it moved here with the
// engine so that the phone renderer is held to the same facts. So every path below is
// repo-relative, resolved from this file's own URL — `packages/shared/src/` is three
// levels under the root — rather than "up two, into components".
//
// 🔴 AND THE FILENAME IS FLAT ON PURPOSE. `packages/shared/scripts/run-tests.mjs`
// discovers tests with `readdirSync("src")`, which is NOT recursive. Filed as
// `src/character/character.test.ts` — next to the code it tests, which is what one would
// reach for — it would simply never run, and its own header says a test nothing runs is
// worse than no test because it reads as coverage.
const REPO = new URL("../../../", import.meta.url);

const read = async (path: string) =>
  (await import("node:fs/promises")).readFile(new URL(path, REPO), "utf8");

const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

test("🔴 the character has a face the instant it appears", async () => {
  // The gaze can open with a full turn around the sphere, during which there are no eyes
  // at all — they really are behind the body. Upstream spends that once, entering a
  // settings view. As a DEFAULT it would be spent on every appearance, and on a
  // throttled tab the scene clock barely advances, so the turn never finishes and the
  // face never arrives. Measured on a hidden preview pane: 6 frames and 77ms of scene
  // clock across roughly 40 seconds of real time.
  //
  // 🔴 BOTH RENDERERS, because the phone has the same default and a worse version of the
  // same failure: a backgrounded tab throttles rAF, and a backgrounded APP stops it dead.
  for (const renderer of [
    "apps/web/components/bloub/bloub-bot.tsx",
    "apps/mobile/src/components/bloub/BloubBot.tsx",
  ]) {
    assert.match(
      code(await read(renderer)),
      /entrance = false/,
      `${renderer}: the entrance turn is on by default again — every appearance now starts faceless`,
    );
  }
});

test("🔴 the phone's resting character is actually given somewhere to look", async () => {
  // The measurements above prove `idleAim` produces a look-around. This proves the phone
  // renderer USES it — which is the half that was missing, and the half no unit test can
  // see: its loop said `if (aimAt) aim(aimAt); else release()`, nothing on the phone
  // passes `aimAt`, so the engine's look mode was never entered and the head sat on the
  // resting bearing. The web renderer is not held to this: it has a real pointer to
  // follow, so it enters look mode on its own.
  const source = code(await read("apps/mobile/src/components/bloub/BloubBot.tsx"));
  assert.match(
    source,
    /idleAim\(/,
    "the phone renderer no longer drives an idle gaze — the character is back to staring on its resting bearing",
  );
  // 🔴 AND IT MUST NOT CLAIM A POINTER. `lookTarget` answers `pointer: true` with
  // `wander: 0` — it silences the engine's resting drift so a followed target is HELD
  // rather than hunted. There is no pointer on a phone, and saying there is one strips
  // the drift back out of a gaze that was only just given movement.
  assert.match(
    source,
    /steer\(nx,\s*ny,\s*false\)/,
    "the idle gaze claims a pointer, which turns the engine's resting drift off underneath it",
  );
  // 🔴 AND IT MUST GO THROUGH `centredLook`, NOT THE VENDORED CONE (owner 2026-08-21). This is the
  // guard whose absence let the measurements above be taken on the wrong path for a fortnight:
  // `lookTarget` spans -42° to -10° of yaw and is NEVER positive, because upstream's bot turns
  // toward a settings side panel this app does not have, and no `nx` centres it — that needs
  // 1.625 and both renderers clamp to ±1. A revert to it is one import away, it fails nothing on
  // its own, and what it looks like is the owner's original complaint coming back: "the mascot
  // should be looking around not just staring away to the right." So both halves are checked —
  // that the re-centred cone is called, and that the vendored one is not reachable from this file
  // at all, since importing it and calling it under another name is the same revert.
  assert.match(
    source,
    /centredLook\(/,
    "the phone renderer no longer re-centres the look cone — the character is back to looking left at nothing",
  );
  assert.doesNotMatch(
    source,
    /\blookTarget\b/,
    "the phone renderer reaches the vendored `lookTarget` again: its cone is -42° to -10° of yaw and never positive, so the character stares off to one side and `character/gaze.ts`'s measured envelope stops describing it",
  );
});

test("🔴 both of the Canvas's waits move the character, not just the loud one", async () => {
  // `thinking` and `preparing` are different events with different captions, but to a
  // learner they are one experience: they asked, and it has not arrived. Wiring only one
  // leaves the character in the corner through the first and jumps it to the middle when
  // the second starts, and a jump with no nameable cause reads as a fault.
  const source = code(await read("apps/web/components/workspace/learn/learning-canvas.tsx"));
  const call = /stateForCanvas\(\{[^}]*\}\)/g;
  const wired = source.match(call) ?? [];
  assert.ok(wired.length > 0, "the character is no longer given the Canvas's activity at all");
  // 🔴 IT CHECKS THE SIGNALS, NOT THE KEY NAMES. The first version of this asserted the
  // call contained "thinking" and "preparing" — which `preparing: false` satisfies
  // perfectly, so unwiring the second wait left the guard green. A guard that passes
  // while the thing it guards is broken is worse than no guard, because it is believed.
  assert.ok(
    wired.some((c) => /thinking:\s*policy\.thinking/.test(c) && /preparing:\s*presence\s*===/.test(c)),
    `no call site passes both real signals: ${wired.join(" | ")}`,
  );
});

test("🔴 there is exactly ONE thing PER APP that turns the engine into pixels", async () => {
  // 🔴 THIS GUARD EXISTS BECAUSE I BUILT A SECOND ONE. PR #700 had already vendored this engine
  // and shipped a React renderer at components/workspace/learn/bloub.tsx; PR #708 added another
  // at components/bloub/bloub-bot.tsx without checking. Both then rendered on the same screen —
  // one from the busy state, one from the dock — and the owner saw two overlapping mascots and
  // an animation nobody had chosen. Nothing failed. Two renderers is not a conflict, it is just
  // two renderers.
  //
  // The rule: constructing a BotEngine is what makes something a renderer, so only the renderer
  // and the pure Nemesis layer may do it.
  //
  // 🔴 WIDENED TO BOTH APPS WHEN THE PHONE GOT A CHARACTER. It used to walk `apps/web` only,
  // with a web-relative allowlist, so `apps/mobile` could have grown three renderers under it
  // and the guard would still have been green — and a guard that passes while the thing it
  // guards is broken is worse than no guard, because it is believed. A DOM renderer and a
  // react-native-svg renderer are legitimately two files: they draw onto two different kinds of
  // node. What is not legitimate is a second one inside EITHER app, which is why the allowlist
  // below has exactly one renderer entry per app and the test fails if either goes missing —
  // a renamed renderer must break this, not silently empty it.
  const { readdir, readFile } = await import("node:fs/promises");

  /** One renderer per app, named. Renaming one without editing this line fails below. */
  const RENDERERS = [
    "apps/web/components/bloub/bloub-bot.tsx",
    "apps/mobile/src/components/bloub/BloubBot.tsx",
  ];
  /** Not renderers: a still-board script and the dev lab, which drive the engine to inspect it. */
  const TOOLS = ["apps/web/scripts/bloub-board.mts", "apps/web/components/dev/bloub-lab/lab.tsx"];
  const allowed = new Set([...RENDERERS, ...TOOLS]);

  const found: string[] = [];
  const offenders: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(new URL(dir, REPO), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".expo") continue;
        await walk(`${rel}/`);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
      const source = await readFile(new URL(rel, REPO), "utf8");
      if (!source.includes("new BotEngine(")) continue;
      found.push(rel);
      if (!allowed.has(rel)) offenders.push(rel);
    }
  };
  for (const dir of [
    "apps/web/components/",
    "apps/web/lib/",
    "apps/web/app/",
    "apps/web/scripts/",
    "apps/mobile/src/",
  ]) {
    await walk(dir);
  }

  assert.deepEqual(
    offenders,
    [],
    `a second renderer exists — two characters will end up on one screen: ${offenders.join(", ")}`,
  );
  for (const renderer of RENDERERS) {
    assert.ok(
      found.includes(renderer),
      `${renderer} no longer constructs a BotEngine — either it was renamed (say so here) or an app lost its character, and this guard just stopped guarding that app`,
    );
  }
});
