import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANIMATIONS,
  ANIMATION_BY_ID,
  DEFAULT_AVATAR,
  TRACK_PITCH,
  TRACK_YAW,
  VIEW_SIZE,
  animationDuration,
  avatarFrameAt,
} from "@/lib/avatar";

import { ACTIVITY_STATE, speedOf, stationOf } from "./stations";

const ALL: string[] = ANIMATIONS.map((a) => a.id);

/**
 * Every frame the character can be asked to draw.
 *
 * 🔴 IT WALKS THE WHOLE CATALOGUE, NOT A SAMPLE. Six of the forty-nine change the body —
 * shrink it to a dot, stretch it into a bar, take it apart — and the frames that leave the
 * picture are the ones nobody thought to look at.
 */
function* everyFrame() {
  for (const a of ANIMATIONS) {
    const total = animationDuration(a);
    for (let i = 0; i <= 24; i += 1) {
      const frame = avatarFrameAt(a.id, (total * i) / 24, DEFAULT_AVATAR);
      if (frame) yield { id: a.id, frame };
    }
  }
}

/** Every coordinate pair in a path, for the reach checks below. */
function points(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

test("🔴 nothing the character draws leaves the viewBox", () => {
  // The viewBox is a module constant and must stay one: recomputing it per frame would
  // resize the element while it animates, which is a layout shift caused by decoration. So
  // instead the CONTENT has to stay inside it. The decor is the part that reaches — a
  // scatter's sparks start well outside the body it came from.
  const edge = VIEW_SIZE / 2;
  let worst = 0;
  let where = "";
  for (const { id, frame } of everyFrame()) {
    for (const d of [frame.body, frame.dots, frame.dotsBehind, frame.left, frame.right]) {
      for (const n of points(d)) {
        if (Math.abs(n) > worst) {
          worst = Math.abs(n);
          where = id;
        }
      }
    }
  }
  assert.ok(worst <= edge, `${where} reaches ${worst.toFixed(1)}, past the frame's ${edge}`);
});

test("the character comes forward only for the animation that means the system has the floor", () => {
  // The rule is not "anything eye-catching". Coming to the middle says the learner is
  // waiting on real work, and it is worth nothing if a wink does it too.
  assert.equal(stationOf("thinking"), "centre");
  for (const id of ["idle", "wink", "wide", "notify", "sleep", "egg", "happy", "neutral"]) {
    assert.equal(stationOf(id), "corner", `${id} should not take the middle of the surface`);
  }
});

test("nothing is retimed behind the catalogue's back", () => {
  // The dial exists so a taste decision about pace never has to be an edit to a measured
  // timing. It is empty today — the one animation it ever slowed was cut — and an entry
  // appearing here without a reason is a measurement being quietly overruled.
  for (const id of ALL) assert.equal(speedOf(id), 1, `${id} was retimed without being asked for`);
});

test("every animation this product names is a real one", () => {
  // A typo renders an empty character rather than failing, and an empty character looks
  // like an animation that has not been built yet.
  for (const id of ALL) assert.ok(ANIMATION_BY_ID.get(id), `${id} is not in the catalogue`);
  for (const [activity, id] of Object.entries(ACTIVITY_STATE)) {
    assert.ok(ANIMATION_BY_ID.get(id), `${activity} schedules "${id}", which does not exist`);
  }
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
  const source = code(await read("../../components/avatar/nemesis-avatar.tsx"));
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
  // defect was never two renderers: `CanvasThinkingPreview` and `CharacterDock` each MOUNTED the one
  // renderer, both centred, both playing `thinking`, so two sets of three dots stacked up.
  //
  // A guard on the wrong noun is worse than no guard, because it is believed.
  //
  // 🔴🔴 AND THE RULE IS NOT "THE DOCK OWNS THE CHARACTER" — IT IS "EXACTLY ONE OF THEM DRAWS".
  // The first wording was the fix for the six dots and it read as a law, so when the owner asked
  // for something the dock cannot express (2026-08-21: *"the mascot should be on top of the three
  // dots"* — the `thinking` pose turns the BODY into the middle dot) the guard would have refused
  // a correct design. (History: the preview then drew its own figure and the canvas hid the
  // dock for that wait. On 2026-08-25 that flipped back — the preview became announcement-only
  // after its hidden-switch left NO character during "preparing" on production — so today the
  // dock is the one owner again and nothing else in learn/ mounts a bot. The rule this test
  // states survives both designs: whoever draws, exactly one of them does.)
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
    if (!source.includes("<NemesisAvatar")) continue;
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
  const dock = await readFile(new URL("components/character/character-dock.tsx", root), "utf8");
  assert.match(dock, /if \(hidden\) return null;/, "`hidden` no longer takes the character away");
});

test("the character rests as a ball, and its colour is the app's accent", async () => {
  // Owner 2026-08-20: "can we just keep the circle blob shape?" and "the color affects the
  // accent of the send button and also the blob". Two controls that both changed "the colour"
  // could disagree; one silhouette per device meant the product had no character of its own.
  const { characterInk, ACCENT_COLORS } = await import("../accent");
  const rest = DEFAULT_AVATAR.surface;
  assert.equal(rest.type, "sphere", "the resting body is no longer a ball");
  assert.ok(Math.abs(rest.width - rest.height) < 1, "the resting body is no longer round");
  assert.equal(characterInk("blue", false), ACCENT_COLORS.blue, "the character ignores the accent");
  // Default REMOVES the override everywhere else, so the character must not invent a colour.
  assert.equal(characterInk("default", false), "#0a0a0c");
  assert.equal(characterInk("default", true), "#f2f2f4");
});

test("🔴 there is exactly ONE thing that turns the engine into pixels", async () => {
  // 🔴 THIS GUARD EXISTS BECAUSE I BUILT A SECOND ONE. PR #700 vendored an engine and shipped a
  // React renderer for it; PR #708 added another without checking. Both then rendered on the
  // same screen — one from the busy state, one from the dock — and the owner saw two
  // overlapping mascots and an animation nobody had chosen. Nothing failed. Two renderers is
  // not a conflict, it is just two renderers.
  //
  // 🔴 AND THE NOUN IS `drawFace`, WHICH IS THE THING THAT MAKES SOMETHING A RENDERER. The
  // engine is pure arithmetic; a script or a test may ask it for a frame. Turning that frame
  // into DOM is what may only happen once.
  const { readdir, readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const allowed = [
    "components/avatar/nemesis-avatar.tsx",
    "lib/avatar/index.ts",
    "lib/avatar/render.ts",
    "lib/avatar/avatar.test.ts",
    "scripts/avatar-sheet.mts",
    "scripts/character-faces.mts",
  ];

  const offenders: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      const rel = `${dir}${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        await walk(`${rel}/`);
        continue;
      }
      if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
      const source = await readFile(new URL(rel, root), "utf8");
      if (/\bdrawFace\(/.test(source) && !allowed.includes(rel)) offenders.push(rel);
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
  // 🔴 IT STARED LEFT FOR HOURS AND NOTHING SAID SO. The reference's own look rule is
  // `yaw: -TURN + nx * YAW_MAX` with TURN = 26, because there the character sits beside a
  // settings panel and should face it. Ported unchanged, that meant a resting yaw of -26° with
  // ±16° of tracking on top — the pointer could never bring it back past -10°, so it read as
  // stuck facing the wall. Owner: "he seems stuck staring to the left".
  //
  // The rule is now a plain multiplication with no resting offset, so this reads the renderer
  // rather than a helper: the head turns by the pointer's own displacement and nothing else.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../components/avatar/nemesis-avatar.tsx", import.meta.url), "utf8");
  assert.match(source, /wantY = looking \? a\.x \* TRACK_YAW : 0/, "the yaw rule has grown a resting offset");
  assert.match(source, /wantX = looking \? a\.y \* TRACK_PITCH : 0/, "the pitch rule has grown a resting offset");
  // Small, and smaller vertically: the character sits beside dense reading material, and a
  // head that swings the engine's whole range reads as a toy watching you.
  assert.ok(TRACK_YAW > 0 && TRACK_YAW <= 30, `a yaw range of ${TRACK_YAW}° is not attention, it is a swivel`);
  assert.ok(TRACK_PITCH > 0 && TRACK_PITCH < TRACK_YAW, "the head nods as far as it turns");
});

test("🔴 a click reaches the character", async () => {
  // The pokeable rule lived ABOVE `.nemesis-avatar` with the same specificity, so `pointer-events: none`
  // won by source order and every click passed straight through. Nothing failed; the character
  // was simply inert. Owner: "clicking on the mascot doesn't do anything".
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../../components/character/character.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.nemesis-avatar\.nemesis-avatar-pokeable\s*\{[^}]*pointer-events:\s*auto/,
    "the pokeable rule no longer outranks .nemesis-avatar, so clicks are being swallowed again",
  );
  const { readFile: rf } = await import("node:fs/promises");
  const poke = await rf(new URL("../../components/character/use-poke.ts", import.meta.url), "utf8");
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

test("🔴🔴 the product schedules the reference's vocabulary, never our own gestures", async () => {
  // Owner, 2026-08-26: *"i said to put in the original animations and expressions NOT the custom
  // built ones like the spin, waggle, sigma, nod, double-take, slow blink, etc."*
  //
  // 🔴 THE RULE IS ABOUT PROVENANCE, SO THE GUARD ASKS ABOUT PROVENANCE. The obvious version
  // lists the six names the owner happened to say — and this very file records what that costs:
  // a guard written as a literal list held four unwanted animations in place for a day, and
  // production kept drawing them until the owner reported it a second time. `GESTURE_IDS` is the
  // set of things WE built, so a gesture added next month is covered by a test written today.
  //
  // Calibration: point any ACTIVITY_STATE row, or any poke, at "nod" and this reddens.
  const { GESTURE_IDS } = await import("@/lib/avatar");
  const { ACTIVITY_STATE } = await import("./stations");

  for (const [activity, id] of Object.entries(ACTIVITY_STATE)) {
    assert.ok(
      !GESTURE_IDS.includes(id),
      `${activity} schedules "${id}", which is one of ours and not the reference's`,
    );
  }

  const poke = await read("../../components/character/use-poke.ts");
  const from = poke.indexOf("const REACTIONS");
  const list = poke.slice(from, poke.indexOf("];", from));
  for (const match of list.matchAll(/state:\s*"([^"]+)"/g)) {
    const id = match[1]!;
    assert.ok(!GESTURE_IDS.includes(id), `a poke draws "${id}", which is one of ours`);
  }
  // The sigma face is ours too, and it is a `face:` rather than a `state:`.
  assert.ok(!/face:\s*"sigma"/.test(list), 'a poke wears the sigma face, which the owner named');
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
