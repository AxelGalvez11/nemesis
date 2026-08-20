import assert from "node:assert/strict";
import { test } from "node:test";

import { BotEngine } from "@/lib/bloub/engine";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import { SEQUENCE, STATE_BY_ID, type StateId } from "@/lib/bloub/states";

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
  assert.ok(
    wired.some((c) => /thinking:\s*policy\.thinking/.test(c) && /preparing:\s*presence\s*===/.test(c)),
    `no call site passes both real signals: ${wired.join(" | ")}`,
  );
});

test("🔴 only ONE thing on the canvas draws a character", async () => {
  // 🔴 THE PREVIOUS GUARD WAS HOLLOW AND THIS IS WHY. It asserted one RENDERER — that only one
  // file constructs a BotEngine — and it passed while the owner was looking at six dots. The
  // defect was never two renderers: `CanvasThinkingPreview` and `BloubDock` each MOUNTED the one
  // renderer, both centred, both playing `thinking`, so two sets of three dots stacked up.
  //
  // A guard on the wrong noun is worse than no guard, because it is believed. The rule that
  // actually holds: on the canvas, the dock owns the character. Nothing else there draws one.
  // `canvas-home.tsx` is exempt because it IS a different route — the landing surface and a
  // session cannot be on screen together.
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = "components/workspace/learn/";
  const root = new URL("../../", import.meta.url);
  const offenders: string[] = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    if (entry.name === "canvas-home.tsx") continue;
    const source = await readFile(new URL(`${dir}${entry.name}`, root), "utf8");
    if (source.includes("<BloubBot")) offenders.push(entry.name);
  }
  assert.deepEqual(
    offenders,
    [],
    `these draw a second character beside the dock — the learner sees two: ${offenders.join(", ")}`,
  );
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
