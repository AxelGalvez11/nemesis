import assert from "node:assert/strict";
import { test } from "node:test";

import { BotEngine } from "@/lib/bloub/engine";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import { SEQUENCE, STATE_BY_ID, type StateId } from "@/lib/bloub/states";

import { arcStops } from "./look";
import { ARC_POOL, ARC_STOPS, DOT_POOL } from "./pool";
import { speedOf, stationOf } from "./stations";

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

const read = async (path: string) =>
  (await import("node:fs/promises")).readFile(new URL(path, import.meta.url), "utf8");

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
  const source = code(await read("../../components/bloub/bloub-bot.tsx"));
  assert.match(
    source,
    /entrance = false/,
    "the entrance turn is on by default again — every appearance now starts faceless",
  );
});

test("🔴 both of the Canvas's waits move the character, not just the loud one", async () => {
  // `thinking` and `preparing` are different events with different captions, but to a
  // learner they are one experience: they asked, and it has not arrived. Wiring only one
  // leaves the character in the corner through the first and jumps it to the middle when
  // the second starts, and a jump with no nameable cause reads as a fault.
  const source = code(await read("../../components/workspace/learn/learning-canvas.tsx"));
  const call = /stateForCanvas\(\{[^}]*\}\)/g;
  const wired = source.match(call) ?? [];
  assert.ok(wired.length > 0, "the character is no longer given the Canvas's activity at all");
  // 🔴 IT CHECKS THE SIGNALS, NOT THE KEY NAMES. The first version of this asserted the
  // call contained "thinking" and "preparing" — which `preparing: false` satisfies
  // perfectly, so unwiring the second wait left the guard green. A guard that passes
  // while the thing it guards is broken is worse than no guard, because it is believed.
  //
  // 🔴 REPOINTED 2026-08-20, AND THE SIGNAL IT USED TO DEMAND IS NOW THE BUG. This required
  // `thinking: policy.thinking`. That flag is `phase !== null`, and the phases include
  // `mapping_knowledge` — background knowledge resolution measured in MINUTES — so the character
  // walked to the middle of the screen, scaled 2.1x, and STAYED there over an answer the learner
  // was reading, because something unrelated was still running behind the page. Measured on
  // production: resting position correct, transform translate(358, -412) scale(2.1) still applied
  // long after the turn ended.
  //
  // The rule this test protects is unchanged: BOTH waits move the character, and neither is
  // stubbed out with a literal. Only the signal for the first one changed, to the one the thinking
  // SCREEN already uses — the turn the learner is actually waiting on.
  assert.ok(
    wired.some((c) => /thinking:\s*turnInFlight/.test(c) && /preparing:\s*presence\s*===/.test(c)),
    `no call site passes both real signals: ${wired.join(" | ")}`,
  );
  assert.ok(
    !wired.some((c) => /thinking:\s*policy\.thinking/.test(c)),
    "the dock is back on the policy's phase flag, which stays true through minutes of background work",
  );
});

test("🔴 only ONE thing on the canvas draws a character", async () => {
  // 🔴 THE PREVIOUS GUARD WAS HOLLOW AND THIS IS WHY. It asserted one RENDERER — that only one
  // file constructs a BotEngine — and it passed while the owner was looking at six dots. The
  // defect was never two renderers: `CanvasThinkingPreview` and `BloubDock` each MOUNTED the one
  // renderer, both centred, both playing `thinking`, so two sets of three dots stacked up.
  //
  // A guard on the wrong noun is worse than no guard, because it is believed.
  //
  // 🔴🔴 AND THE RULE IS NOT "THE DOCK OWNS THE CHARACTER" — IT IS "EXACTLY ONE OF THEM DRAWS".
  // The first wording was the fix for the six dots and it read as a law, so when the owner asked
  // for something the dock cannot express (2026-08-21: *"the mascot should be on top of the three
  // dots"* — the `thinking` pose turns the BODY into the middle dot) the guard would have refused
  // a correct design. `CanvasThinkingPreview` draws its own figure now and the canvas hides the
  // dock for the whole of that wait, which satisfies what this test was always protecting.
  //
  // `canvas-home.tsx` is exempt because it IS a different route — the landing surface and a
  // session cannot be on screen together.
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = "components/workspace/learn/";
  const root = new URL("../../", import.meta.url);
  const canvas = await readFile(new URL(`${dir}learning-canvas.tsx`, root), "utf8");
  const offenders: string[] = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    if (entry.name === "canvas-home.tsx") continue;
    const source = await readFile(new URL(`${dir}${entry.name}`, root), "utf8");
    if (!source.includes("<BloubBot")) continue;
    // 🔴 DRAWING ONE IS ONLY ALLOWED WITH THE DOCK EXPLICITLY SWITCHED OFF. A `hidden` prop that
    // exists but is never passed is the six-dot defect with an extra prop on it.
    if (!/hidden=\{/.test(canvas)) offenders.push(entry.name);
  }
  assert.deepEqual(
    offenders,
    [],
    `these draw a second character while the dock is still mounted — the learner sees two: ${offenders.join(", ")}`,
  );
  // And the dock can actually be switched off, rather than the canvas passing a prop into a void.
  const dock = await readFile(new URL("components/bloub/bloub-dock.tsx", root), "utf8");
  assert.match(dock, /if \(hidden\) return null;/, "`hidden` no longer takes the character away");
});

test("the character rests as a circle, and its colour is the app's accent", async () => {
  // Owner 2026-08-20: "can we just keep the circle blob shape?" and "the color affects the accent
  // of the sand button and also the blob". Two controls that both changed "the colour" could
  // disagree; one silhouette per device meant the product had no character of its own.
  const { CHARACTER_SHAPE, inkFor } = await import("./look");
  const { ACCENT_COLORS } = await import("../accent");
  // Against the vendored constant, not a literal: bloub samples at 64 and my own earlier engine
  // sampled at 48, so a hardcoded number here would encode which engine I was thinking about
  // rather than which one is running.
  const { PROFILE_SAMPLES } = await import("../bloub/profiles");
  assert.equal(CHARACTER_SHAPE.length, PROFILE_SAMPLES, "the resting silhouette is not a full profile");
  assert.ok(CHARACTER_SHAPE.every((r) => Math.abs(r - CHARACTER_SHAPE[0]!) < 1e-9), "not a circle");
  assert.equal(inkFor("blue", "light"), ACCENT_COLORS.blue, "the character ignores the accent");
  // Default REMOVES the override everywhere else, so the character must not invent a colour.
  assert.equal(inkFor("default", "light"), "#0a0a0c");
  assert.equal(inkFor("default", "dark"), "#f2f2f4");
});

test("🔴 there is exactly ONE thing that turns the engine into pixels", async () => {
  // 🔴 THIS GUARD EXISTS BECAUSE I BUILT A SECOND ONE. PR #700 had already vendored this engine
  // and shipped a React renderer at components/workspace/learn/bloub.tsx; PR #708 added another
  // at components/bloub/bloub-bot.tsx without checking. Both then rendered on the same screen —
  // one from the busy state, one from the dock — and the owner saw two overlapping mascots and
  // an animation nobody had chosen. Nothing failed. Two renderers is not a conflict, it is just
  // two renderers.
  //
  // The rule: constructing a BotEngine is what makes something a renderer, so only the renderer
  // and the pure Nemesis layer may do it.
  const { readdir, readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const allowed = [
    "components/bloub/bloub-bot.tsx",
    "lib/character/character.test.ts",
    "scripts/bloub-board.mts",
    "components/dev/bloub-lab/lab.tsx",
  ];

  const offenders: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "bloub") continue;
        await walk(`${rel}/`);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
      const source = await readFile(new URL(rel, root), "utf8");
      if (source.includes("new BotEngine(") && !allowed.includes(rel)) offenders.push(rel);
    }
  };
  for (const dir of ["components/", "lib/", "app/", "scripts/"]) await walk(dir);

  assert.deepEqual(
    offenders,
    [],
    `a second renderer exists — two characters will end up on one screen: ${offenders.join(", ")}`,
  );
});

test("🔴 the old raster logo is not drawn anywhere", async () => {
  // 🔴 THE OWNER FOUND THESE, TWICE. The mark moved to the flat three-bead form on the marketing
  // site, and this app kept serving `/nemesis/logo.png` — a raster of the older glossy-bead
  // logo — from the auth header, the auth card and the account portal. A PNG cannot be wrong at
  // compile time, so nothing said a word; it just looked like a different product on the page
  // where people sign in.
  //
  // The files stay in public/ (other things may still link them); what is guarded is that no
  // component DRAWS one. `components/nemesis-mark.tsx` is the single source, and it shares its
  // geometry with app/icon.svg and app/apple-icon.tsx.
  const { readdir, readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const offenders: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        await walk(`${rel}/`);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = await readFile(new URL(rel, root), "utf8");
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      if (/nemesis\/logo(-white)?\.png/.test(code)) offenders.push(rel);
    }
  };
  for (const dir of ["components/", "app/"]) await walk(dir);

  assert.deepEqual(
    offenders,
    [],
    `these still draw the old mark: ${offenders.join(", ")}`,
  );
});

test("🔴 the character looks straight ahead when the pointer is centred", async () => {
  // 🔴 IT STARED LEFT FOR HOURS AND NOTHING SAID SO. bloub's own `lookTarget` is
  // `yaw: -TURN + nx * YAW_MAX` with TURN = 26, because upstream the character sits beside a
  // settings panel and should face it. Ported unchanged, that meant a resting yaw of -26° with
  // ±16° of tracking on top — the pointer could never bring it back past -10°, so it read as
  // stuck facing the wall. Owner: "he seems stuck staring to the left".
  const { aimFor, PITCH_REST } = await import("./look");
  const centre = aimFor(0, 0, true);
  assert.equal(centre.yaw, 0, `resting gaze is ${centre.yaw}° off centre`);
  assert.equal(centre.pitch, PITCH_REST);
  // And it still reaches both sides symmetrically.
  assert.ok(aimFor(-1, 0, true).yaw < 0 && aimFor(1, 0, true).yaw > 0, "tracking is not symmetric");
  assert.equal(aimFor(-1, 0, true).yaw, -aimFor(1, 0, true).yaw, "one side reaches further");
  // No pointer: the head keeps drifting rather than freezing on a dead point.
  assert.equal(aimFor(0, 0, false).wander, 1);
});

test("🔴 a click reaches the character", async () => {
  // The pokeable rule lived ABOVE `.bloub` with the same specificity, so `pointer-events: none`
  // won by source order and every click passed straight through. Nothing failed; the character
  // was simply inert. Owner: "clicking on the mascot doesn't do anything".
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../../components/bloub/bloub.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.bloub\.bloub-pokeable\s*\{[^}]*pointer-events:\s*auto/,
    "the pokeable rule no longer outranks .bloub, so clicks are being swallowed again",
  );
  const { readFile: rf } = await import("node:fs/promises");
  const poke = await rf(new URL("../../components/bloub/use-poke.ts", import.meta.url), "utf8");
  // 🔴🔴 THIS GUARD USED TO ENFORCE THE SPIN, AND THE OWNER REVERSED THAT THE SAME DAY. It read
  // `assert.match(poke, /REACTIONS[^=]*=\s*\[\s*"swirl"/)` — written for "it should have a
  // little animation, like a spin" (2026-08-20) and left standing after "remove the current one
  // where it enlarges eyes, turns into exclamation mark, turns into triangle, remove the swirls"
  // (2026-08-20, later). So the suite was actively holding four unwanted animations in place, and
  // production kept drawing them until the owner reported it again on 2026-08-21.
  //
  // It now guards the rule that replaced it. Calibration: put any of the four back in REACTIONS
  // and this reddens.
  for (const gone of ["swirl", "wide", "exclaim", "play"]) {
    assert.ok(
      !new RegExp(`state:\\s*"${gone}"`).test(poke),
      `a poke draws "${gone}" again — the owner removed it`,
    );
  }
  assert.match(poke, /motion: "jump"/, "a poke no longer leads with the hop");
});

test("🔴 pressing Speak twice actually speaks twice", async () => {
  // 🔴 I SHIPPED THIS BUG INSIDE THE FEATURE THAT FIXES IT. `useCanvasSpeech.speak` keeps a set
  // of utterance keys and returns SILENTLY on a repeat — correct for the routed lane, where a
  // question must not be read (or paid for) twice because a render ran again. The on-demand
  // control first derived its key from the text, so the second press of a repeat button hit that
  // guard and did nothing: exactly the silent no-op the owner reported, rebuilt one layer down.
  //
  // Source-read, because this is a wiring fact with no return value to inspect.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../components/workspace/learn/use-canvas-voice.ts", import.meta.url),
    "utf8",
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const call = /speech\.speak\(\s*`aloud:([^`]*)`/.exec(code);
  assert.ok(call, "the on-demand speak call is gone or renamed");
  assert.ok(
    !call[1]!.includes("text"),
    `the utterance key is derived from the text (\`aloud:${call[1]}\`), so a second press is deduped into silence`,
  );
  assert.match(code, /aloudPress\.current \+= 1/, "nothing advances the per-press counter");
});

// ── colour: one meaning, one place ───────────────────────────────────────────
//
// 🔴 THESE GUARD A PRODUCT DECISION AGAINST A VENDORED DEFAULT, which is the fragile kind. The
// hue wheel is still sitting in `lib/bloub/decor.ts` and every arc still arrives carrying one; what
// keeps it off the screen is one line in the renderer choosing not to use it. A refactor that
// "simplifies" that line back to `arc.grad.stops[s]` restores the rainbow and breaks nothing else.

test("🔴 an orbit arc is drawn in ink, never in the seed's hue", () => {
  const stops = arcStops("#0a0a0c", "#f9f9f9", ARC_STOPS);
  for (const stop of stops) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(stop.slice(i, i + 2), 16));
    // A shade of one ink is grey when the ink is grey: the channels stay together. Any hue at all
    // would spread them, which is exactly what the wheel does.
    const spread = Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
    assert.ok(spread <= 4, `${stop} carries a hue — the wheel is back on the arcs`);
  }
});

// 🔴 THE FADE IS NOT DECORATION AND MUST SURVIVE THE DE-COLOURING. An orbit is a stroke passing
// behind the body and out in front; ends that dissolve read as going ROUND something, and a flat
// band reads as a hoop laid on top. Removing the hue while flattening the gradient would have
// traded one wrong picture for another.
test("🔴 the arc still fades at its ends", () => {
  const [start, middle, end] = arcStops("#0a0a0c", "#f9f9f9", 3);
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16);
  assert.ok(lum(start!) > lum(middle!), "the arc no longer fades in");
  assert.ok(lum(end!) > lum(middle!), "the arc no longer fades out");
});

test("🔴🔴 the canvas can no longer schedule ANY of the vendored gestures", async () => {
  // Owner 2026-08-23: "I don't want any rainbow swirls or animations from the GitHub that we
  // used." The poke list was cleaned on 2026-08-22 — but three survivors kept playing from the
  // ACTIVITY side: listening scheduled `wide` (the big eyes, removed by name), and the loading
  // states scheduled `comet` and `burst`, with `notify` bolting a badge onto the body. This
  // pins the whole schedule: every activity resolves to a pose that is the creature being a
  // creature, never a borrowed effect.
  //
  // Calibration: point any ACTIVITY_STATE row back at "wide" and this reddens.
  const { ACTIVITY_STATE } = await import("./stations");
  const banned = new Set(["swirl", "wide", "exclaim", "play", "comet", "burst", "notify", "orbit"]);
  for (const [activity, pose] of Object.entries(ACTIVITY_STATE)) {
    assert.ok(!banned.has(pose), `${activity} still schedules the vendored "${pose}"`);
  }
});
