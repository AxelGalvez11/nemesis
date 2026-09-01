import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasPresentation } from "./canvas-presence";

// 🔴🔴🔴 NOTHING TOLD THE LEARNER THEIR MESSAGE HAD BEEN SENT.
//
// Owner, 2026-08-20, twice in the same sitting: *"when user enters a prompt and sends i would like
// a micro animation where the chat composer moves to the bottom position, since user prompts aren't
// supposed to show up as a chat"* and *"since user chat prompts will not show up, when user sends
// chat could we have a thinking screen or loading screen"*.
//
// Both are one defect. The Canvas deliberately never renders the learner's own words, so between
// pressing send and the answer arriving — measured at seconds for a reply and MINUTES for a lesson
// — the surface was identical to the surface before pressing it. There was no way to tell a sent
// message from a swallowed one.
//
// Two answers, one for each end of that gap: the composer travels to where it is about to be, and
// the thinking state takes the surface until the answer lands.

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
const PREVIEW = readFileSync(new URL("./canvas-thinking-preview.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvasCode = code(CANVAS);
const homeCode = code(HOME);
const previewCode = code(PREVIEW);

const TEACHING = { blocks: 0, canvasState: "learn", policyPresenting: true, working: false } as const;

// ── The thinking state takes the surface ────────────────────────────────────

test("🔴🔴🔴 a turn in flight KEEPS what was on screen", () => {
  // 🔴 THIS ASSERTED THE OPPOSITE UNTIL 2026-08-22, on the owner's earlier call ("Replaces it while
  // thinking"). They reversed it after using it: *"canvas should have one persistent screen not a
  // swapping one."*
  //
  // The cost of replacing was measurable. `presence` was the first element of `surfaceKey`, so a
  // mode change rebuilt the entire surface through `CanvasFade` — 160ms out, 220ms in — and one
  // answer crossed that twice. ~760ms per turn spent dissolving the page away and back.
  const { presence, working } = canvasPresentation({ ...TEACHING, turnInFlight: true });
  assert.equal(presence, "task", "a turn in flight took the lesson off the screen again");
  // The send still has to be reported — just not by evicting content.
  assert.equal(working, true, "nothing tells the surface a step is running");
});

test("🔴🔴🔴 but with NOTHING to keep, the thinking state still owns the surface", () => {
  // The safety half, and the reason `canvas-presence.ts` exists at all: a canvas that paints
  // nothing and says nothing was the original defect. Content outranking thinking must not
  // reintroduce it — when there is no content, `preparing` is still what the learner gets.
  //
  // Calibration: delete the `turnInFlight ||` from the `preparing` arm and this reddens while the
  // test above stays green. That asymmetry is the whole safety argument.
  const { presence } = canvasPresentation({
    blocks: 0,
    canvasState: "learn",
    policyPresenting: false,
    turnInFlight: true,
    working: false,
  });
  assert.equal(presence, "preparing");
});

test("🔴🔴🔴 BACKGROUND work does NOT replace a lesson someone is reading", () => {
  // THE dangerous half. `working` is also true for knowledge resolution, which this session
  // measured running for MINUTES on a topic-only canvas. Keyed on that, a learner reading a
  // teaching screen would have it taken away for minutes with no way back — #690's blank screen
  // with a drawing painted over it.
  //
  // Calibration: change the ladder's condition from `turnInFlight` to `working` and this reddens
  // alone, while the test above stays green. That asymmetry is the entire safety argument.
  const { presence } = canvasPresentation({ ...TEACHING, turnInFlight: false, working: true });
  assert.equal(presence, "task", "a lesson was taken off screen by ambient work");
});

test("🔴 the canvas keys the thinking screen on the SESSION's busy, not the policy's flags", () => {
  // `busy` is set by `converse`, `command` and `attachFiles` — things the learner just did. The
  // three policy flags in `working` are background. Naming the derivation here rather than its
  // shape, so a future edit that widens it has to walk past this.
  // 🔴 REPOINTED 2026-08-27. The property this guards is unchanged and is the one in the comment
  // above: the thinking screen keys on the SESSION's busy, never on the policy's background flags.
  // What was added is the one busy kind that is not a turn — reading attached material — because
  // treating a file drop as a turn walked the character to the middle and blanked the page. Owner:
  // *"attaching a document mid chat should not immediately make the chat go into processing mode."*
  assert.match(canvasCode, /const turnInFlight = busy\.kind !== null && !readingMaterial;/);
  assert.match(canvasCode, /const readingMaterial = busy\.kind === "source";/, "attaching material is a turn again");
  assert.ok(
    !/const turnInFlight = working/.test(canvasCode),
    "the thinking screen is keyed on background work and will blank a lesson mid-read",
  );
});

test("🔴🔴🔴 and the content regions no longer stand down while a step runs", () => {
  // 🔴 THE INVERSE OF WHAT THIS ASSERTED. It required `presence !== "preparing"` on all three
  // content regions — the gate that took the lesson away mid-turn. With the ladder reversed the
  // regions paint whenever `composeSurface` says they may, and re-adding any of those gates brings
  // the blanking back one region at a time.
  for (const region of ["policy", "reply", "document"]) {
    const at = canvasCode.indexOf(`{regions.${region} &&`);
    assert.notEqual(at, -1, `the ${region} region is gone`);
    assert.ok(
      !/presence !== "preparing"/.test(canvasCode.slice(at, at + 120)),
      `the ${region} region is blanked while a step runs again`,
    );
  }
});

test("🔴🔴🔴 and the surface is not rebuilt just because the mode changed", () => {
  // The other half of "one persistent screen". `surfaceKey` drives `CanvasFade`; while `presence`
  // was part of it, going busy and coming back counted as new content and cost a full crossfade
  // each way. What survives is what the surface is SHOWING — which question, and what Nemesis last
  // said — because those genuinely are new content.
  //
  // Calibration: put `presence` back into the key and this reddens.
  const at = canvasCode.indexOf("const surfaceKey = [");
  assert.notEqual(at, -1, "the surface key is gone");
  const key = canvasCode.slice(at, canvasCode.indexOf("].join(", at));
  assert.ok(!/^\s*presence,\s*$/m.test(key), "the mode is back in the surface key");
  assert.match(key, /screenKey\(policy\)/, "a new question no longer refreshes the surface");
});

test("🔴🔴 there is no skeleton loader on either wait, and the caption is a line in the conversation", () => {
  // 🔴 THIS TEST HAS BEEN REVERSED, AND THE REVERSAL IS AN OWNER DECISION RATHER THAN A REGRESSION.
  //
  // It used to assert the forming lines SURVIVED — three staggered bars occupying the shape a
  // question occupies, so the first question landed where the placeholder already was. That
  // argument was good and is why they lasted this long.
  //
  // Owner, 2026-08-20: *"i dont want skeleton loader, also when nemesis is thinking or loading, the
  // mascot three dot should have the thinking preview to the right of it."* A skeleton is a guess
  // about what is coming drawn as though it were already there — three grey bars promising a
  // paragraph that may turn out to be a molecule, a plot, or one sentence.
  assert.ok(!/canvas-forming/.test(previewCode), "the skeleton bars are back");
  assert.ok(!/LINES\.map/.test(previewCode), "something is still drawing placeholder bars");

  // 🔴🔴 AND THIS HALF HAS BEEN REVERSED AGAIN, FOR THE REASON THE FIRST VERSION COULD NOT SEE.
  //
  // It used to assert BOTH waits laid the caption out as a row, which was the mechanism chosen to
  // put it beside the character. A row is the right shape and it was still the wrong mechanism:
  // the mascot's position is a live transform (it walks, and it scales 2.1x to come forward), so
  // no static box on the page can be beside it. The `justify-end` that had meant "push to the
  // bottom" as a column silently became "push to the right" as a row, and the caption ended up
  // against the right edge of the window — owner, 2026-08-21: *"why is the 'thinking' so far
  // off"*, with a screenshot of the word alone in the far corner.
  //
  // So the caption moved onto the dock, as a sibling of its own transform, where being beside the
  // character is structural rather than a coincidence of two layouts agreeing.
  //
  // 🔴 REVERSED A THIRD TIME, 2026-08-25: the preview became a screen-reader announcement and the
  // dock owned character AND caption in every wait.
  //
  // 🔴🔴 AND A FOURTH TIME, 2026-08-31, WHICH IS THE ONE THAT RESOLVES THE WHOLE SEQUENCE. Owner:
  // *"inside a canvas, when it's in chat mode, the thinking preview is at the bottom next to the
  // mascot, and it should be above, where it usually is with ChatGPT."*
  //
  // Every earlier round argued about HOW to put the caption beside the character. None of them
  // questioned that it belonged there, and that premise expired when the canvas became a chat: the
  // character no longer stands in the centre of an empty screen, it stands on the composer at the
  // bottom, so "beside the character" resolves to the bottom left corner — underneath the very
  // conversation the words are about. The reference puts the running step in the thread, where the
  // answer is about to appear, and that is a position no transform can wander away from.
  //
  // So the caption is a LINE IN THE FLOW now, drawn under the learner's own message. What survives
  // from every previous round: no skeleton, no second mascot, and no row layout whose `justify-end`
  // can silently mean "the right edge of the window".
  assert.equal((previewCode.match(/flex-row items-center/g) ?? []).length, 0, "the preview is laying out a visible wait again");
  assert.ok(!/justify-end/.test(previewCode), "justify-end is back — in a row that means the right edge, not the foot");
  assert.match(previewCode, /data-canvas-thinking-line/, "the line lost the handle its placement is measured by");
  assert.match(previewCode, /className="sr-only"/, "the announcement-only export lost its announcement");
  // 🔴🔴 SCOPED TO CHAT VIEW ON 2026-08-31, SECOND PASS, AND THE TWO INSTRUCTIONS DO NOT CONFLICT.
  // This pinned `caption={null}` outright, from the morning's *"in chat mode... it should be above,
  // where it usually is with ChatGPT."* That afternoon: *"it should only be like that when it's in
  // chat mode, not when it's in Canvas mode. Canvas mode should just have the thinking below the
  // mascot."* The first sentence only ever spoke about chat; an unconditional null was reading it
  // as a rule about both views.
  //
  // What the guard protects is unchanged and is why it stays: in CHAT the caption must not ride the
  // character, because there it resolves to the bottom left corner underneath the conversation the
  // words are about. In CANVAS there is no conversation on screen and the character is at the
  // centre station, where the dock draws the caption UNDER it — which is the arrangement asked for.
  assert.match(
    canvasCode,
    /caption=\{threadOpen \? null : preparingLabel\}/,
    "the character carries the caption in chat view again — there it reads as the bottom left corner",
  );
  // 🔴 AND THE LINE IN THE FLOW IS THE OTHER HALF OF THE SAME SPLIT: exactly one of the two draws
  // the step at a time, or a canvas gets two "Thinking"s on one screen.
  assert.match(
    canvasCode,
    /\{threadOpen && \(turnInFlight \|\| presence === "preparing"\) && !replyText\.trim\(\) && \(/,
    "the thread's caption is no longer scoped to chat view — canvas view draws two of them",
  );
  // 🔴 AND THE PREVIEW STILL DOES NOT DRAW ITS OWN MASCOT. Two mounts of one renderer put two sets
  // of three dots on one screen; the dock owns the character, this owns the caption.
  assert.ok(!/<Bloub /.test(previewCode), "the preview is drawing its own mascot again");
  // …and the caption's PLACE depends on the station: beside the character in the corner, UNDER
  // it at the centre (owner 2026-08-25: "the mascot on top of the thinking preview lines").
  const dockSource = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(dockSource, /station === "centre" \? " left-1\/2 top-full" : " left-full top-1\/2"/);
});

// ── The composer travels to where it is about to be ─────────────────────────

test("🔴🔴 the distance is MEASURED, never a constant", () => {
  // The front door centres its block with `my-auto`, so the composer's position depends on the
  // greeting's height, the window's height and the length of the Library list below it. A
  // hard-coded translate would be correct at exactly one window size.
  assert.match(homeCode, /getBoundingClientRect\(\)/);
  // 🔴 AGAINST THE SURFACE, NOT THE WINDOW, AND THAT CHANGE IS THE POINT RATHER THAN AN EDIT TO IT.
  // The height is still read rather than assumed; what moved is WHICH box it is read from. The
  // canvas's `CharacterDock` measures its `offsetParent` — the surface in the shell's second grid
  // column — so a target computed from `window` disagreed with the arrival point by the nav rail's
  // width on every send. Same rule, one shared rectangle.
  assert.match(homeCode, /surface\.bottom - canvasComposerInset\(\) - rect\.height/);
});

test("🔴🔴 the clearance under the canvas composer is READ, not typed", () => {
  // It is `pb-4` — one rem — and the root font size is the learner's SCALING setting. A literal
  // here is right at exactly one setting, and the literal that was here (16) was right at none:
  // the app's root is 112.5%, so `pb-4` is 18px and the composer landed 2px high.
  //
  // Calibration: put any number back in place of the read and this reddens.
  assert.match(homeCode, /getComputedStyle\(document\.documentElement\)\.fontSize/);
  assert.ok(
    !/const CANVAS_COMPOSER_INSET = \d/.test(homeCode),
    "the clearance is a literal again, so it is wrong at every scale but one",
  );
});

test("🔴🔴 the navigation waits for the move, or the move plays against a dead page", () => {
  // The canvas mounts with its composer already docked. If this one has not arrived by then the
  // two do not line up and the swap is visible, which is the opposite of the point.
  assert.match(homeCode, /window\.setTimeout\(\(\) => router\.push\(href\), DOCK_MS\)/);
});

test("🔴🔴 reduced motion skips the TRAVEL, not the send", () => {
  // The failure to avoid is a slower version of the same animation for someone who asked for none.
  // Calibration: delete the `still` branch and this reddens.
  assert.match(homeCode, /prefers-reduced-motion: reduce/);
  const at = homeCode.indexOf("prefers-reduced-motion: reduce");
  assert.match(homeCode.slice(at, at + 200), /router\.push\(href\);/, "reduced motion does not still send");
});

test("🔴 it moves with a transform, so nothing under it reflows", () => {
  // Animating a layout property would reflow the Library list on every frame of the move.
  assert.match(homeCode, /transform: departing \? `translate3d\(\$\{travel\.x\}px, \$\{travel\.y\}px, 0\)`/);
  assert.ok(!/marginTop: departing/.test(homeCode), "the move animates layout instead of a transform");
});

test("🔴🔴 the composer lands where the canvas's composer BEGINS, not where it ends up", () => {
  // 🔴🔴 THIS TEST USED TO PIN THE OPPOSITE, AND THE OPPOSITE WAS AIMING AT THE RIGHT PLACE AT THE
  // WRONG TIME. The canvas is immersive — it takes the nav rail away — so this page's composer,
  // centred inside a railed column, sits 26px right of where the canvas's composer eventually
  // settles. The old `x` term therefore travelled 26px LEFT on the way down, to land on that
  // eventual position, and this test pinned that term against `window.innerWidth`.
  //
  // "Eventually" is not "on arrival". The rail is not taken away until `CanvasSurface` mounts and
  // claims the immersive surface in an EFFECT — a frame after the route swap — and the column then
  // animates 52px→0 over 240ms. So at the instant of the swap the canvas's own composer was still
  // centred in a railed column at +26, while this one had just finished travelling to 0: the
  // learner saw it arrive, jump 26px right as the page changed, then slide 26px left again as the
  // chrome caught up. Two corrections for an offset that was never wrong.
  //
  // Both ends now measure the SAME rectangle, so the composer lands exactly where the canvas's
  // composer begins and the swap shows nothing; the rail then carries both away together.
  //
  // Calibration: point either target back at `window` and the numbers disagree by the rail again.
  assert.match(homeCode, /const surface = scroller\.current\?\.getBoundingClientRect\(\)/);
  assert.match(homeCode, /x: Math\.round\(surface\.left \+ surface\.width \/ 2 - \(rect\.left \+ rect\.width \/ 2\)\)/);
  assert.equal(
    /window\.innerWidth \/ 2 - \(rect\.left/.test(homeCode),
    false,
    "the composer is aiming at the viewport again, which is not the box it lands in",
  );
});

// ── And the character travels with it ───────────────────────────────────────

test("🔴🔴🔴 the character walks to the exact spot the canvas will stand it on", () => {
  // Owner 2026-08-21: "the mascot should move toward the center smoothly not jaggedly".
  //
  // These are two components on two surfaces — this greeter unmounts and `CharacterDock` mounts —
  // so the hand-off is invisible only while the two agree about the point and the size. It was
  // not agreeing about either: the greeter held its place while the dock mounted in the
  // lower-left corner and crawled to the middle, which the learner reads as two characters.
  assert.match(homeCode, /const \[handoff, setHandoff\]/);
  assert.match(homeCode, /transform: `translate3d\(\$\{handoff\.dx\}px, \$\{handoff\.dy\}px, 0\) scale\(\$\{handoff\.k\}\)`/);
});

test("🔴🔴 and it takes those numbers FROM the dock, so they cannot drift apart", () => {
  // A copied `0.42`, a copied `2.1` and a copied `52` would all look right the day they were
  // typed and come apart on the first retune of the middle station — as a hand-off that is
  // subtly wrong, which is harder to see than one that is obviously wrong.
  //
  // Calibration: inline any of the three as a literal and this reddens.
  assert.match(homeCode, /from "@\/components\/character\/character-dock"/);
  for (const name of ["centreStation", "DOCK_SIZE", "DOCK_CENTRE_SCALE"]) {
    assert.match(homeCode, new RegExp(name), `${name} is not read from the dock`);
  }
});

test("🔴🔴 and the dock does not walk in from a corner it was never standing in", () => {
  // The other half of the same hand-off. A canvas opened from the front door mounts ALREADY
  // busy, so its dock's first placement is the middle — and animating into it would replay,
  // from the corner, a journey the learner just watched the greeter make.
  //
  // Calibration: make the first placement use the journey duration and this reddens.
  // 🔴 TIGHTENED 2026-08-25: "placed" itself now waits for the ANCHOR. The station used to
  // place instantly against the default corner (left 22, bottom 24) before the composer had
  // been measured, and the correction then eased in as a diagonal drift from the lower-left —
  // the owner's "it was already on the bottom left side, moving upward", seen on production.
  //
  // 🔴 THE SAME RULE, NOW WITH A THIRD CASE BETWEEN THE TWO IT USED TO HAVE. The expression this
  // pinned — `was.placed && anchoredRef.current ? null : 0` — could only ever say "be there
  // already" (0) or "take the stylesheet's 680ms walk" (null). There was no way to say "the
  // surface moved a few pixels under you, keep up", so every micro-correction — the composer
  // growing a line, the nav rail collapsing, a resize — eased over two thirds of a second and read
  // as the character lagging its anchor. `character.css` had documented ~140ms for exactly this
  // since the override was added, and nothing had ever passed it.
  //
  // The first placement is still instant, which is what this test is actually about.
  //
  // 🔴 REPOINTED 2026-08-26, AND THE CLAUSE ADDED IS WHY THE SENTENCE ABOVE WAS ONLY HALF TRUE.
  // `!placed || !anchoredRef.current` returns 0 for the first move, as it always has — and the
  // browser never painted that style. `measure()` runs twice inside one commit (the placement
  // effect's `setInset` forces a synchronous re-render before paint), so the second run saw
  // `placed === true` and wrote the 140ms duration over the 0ms one. Measured across the route
  // swap in real Chrome: frame 0 was `matrix(1,0,0,1,0,0)` easing over 140ms — the character
  // appearing at rest size and swooping into a middle the greeter had just finished flying to.
  // `paintedRef` is set by the browser's own clock rather than React's, so it cannot be beaten
  // by a re-render. Full workings in `handoff-and-mascot.test.ts`.
  const dock = code(readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8"));
  assert.match(dock, /if \(!paintedRef\.current \|\| !placed \|\| !anchoredRef\.current\) return 0;/);
  assert.match(dock, /return from === null \|\| from === station \? FOLLOW_MS : null;/);
  assert.match(dock, /visibility: travel\.placed \? undefined : "hidden"/);
});

test("🔴🔴 the WALK is one eased property, and layout never eases", () => {
  // The judder had a mechanism: two properties moving on two clocks. The journey between
  // stations is an eased transform — one property, one easing — while the corner the composer
  // drags around is layout written with NO transition at all, so it can never fight the walk
  // mid-flight. The fight comes back the day either side crosses over: a transition on
  // `left`/`bottom`, or a station journey written as layout.
  //
  // Calibration: add left or bottom to the stylesheet's transition, or write setOffset inside
  // the station effect, and this reddens.
  const dockRaw = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  const cssRaw = readFileSync(new URL("../../character/character.css", import.meta.url), "utf8");
  assert.match(cssRaw, /transition: transform var\(--character-travel-ms, var\(--character-travel\)\)/);
  assert.ok(!/transition:[^;]*(left|bottom|all)/.test(cssRaw), "layout properties have gained a transition");
  const stationEffect = dockRaw.slice(dockRaw.indexOf("Where it stands"), dockRaw.indexOf("What it is looking at"));
  assert.ok(stationEffect.includes("setTravel"), "the walk no longer goes through the transform");
  assert.ok(!/setOffset|setInset/.test(stationEffect), "the walk writes layout properties");
});

// ── What is vendored, and the notice that has to travel with it ─────────────

test("🔴🔴 the traced silhouettes keep the licence that lets us use them", () => {
  // 🔴 THE PRODUCT USED TO VENDOR A WHOLE ENGINE; NOW IT VENDORS THREE TABLES. Until
  // 2026-08-25 there were two engines — one copied verbatim from jeremy-prt/bloub (MIT, which
  // permits the copy and requires the notice) and one written from a reading of
  // smontlouis/bible-strong-avatar-lab (AGPL, which does not permit a copy at all). They are
  // one engine now, and it is ours.
  //
  // 🔴 WHAT SURVIVES IS THE MEASUREMENTS, AND TAKING THEM WAS THE RIGHT CALL. The egg and the
  // hexagon were traced off a video at the pixel; the first attempt at this modelled them
  // instead, with a taper and a polygon generator, and the owner saw the difference on sight
  // — *"they dont perfectly match, did you even check the bloub github? its MIT license"*.
  // The licence is the reason that is a fair question, and this is the obligation it carries.
  const licence = readFileSync(new URL("../../../lib/avatar/vendor/LICENSE.bloub", import.meta.url), "utf8");
  assert.match(licence, /MIT License/);
  assert.match(licence, /Jérémy Perret/);
  const vendored = readFileSync(new URL("../../../lib/avatar/vendor/silhouettes.ts", import.meta.url), "utf8");
  assert.match(vendored, /jeremy-prt\/bloub/, "the tables no longer say where they came from");
  assert.match(vendored, /LICENSE\.bloub/, "the tables no longer point at their notice");
});

// ── Attachments: dropped anywhere, carried inside the composer ────────────────────────────────

test("🔴🔴 a file dropped anywhere on the canvas is attached", () => {
  // 🔴 REPORTED 2026-08-20: *"the composer doesnt allow me to drop in multiple attachments before
  // sending."* There was no drop handler on the canvas AT ALL. The front door has had one since it
  // was built; the canvas never did, so the browser took the drop, navigated away from the session
  // and opened the PDF in the tab.
  //
  // Calibration: remove `onDropFiles` from the CanvasSurface mount and this reddens.
  const surface = readFileSync(new URL("./canvas-surface.tsx", import.meta.url), "utf8");
  assert.match(surface, /onDrop=\{/, "the canvas surface does not accept a drop");
  // 🔴 THE DRAGOVER IS THE LOAD-BEARING HALF: without preventDefault there the drop event never
  // fires, because the browser's navigate-to-file default wins. A guard that only checked onDrop
  // would pass against a handler that can never run.
  // 🔴 THE WINDOW IS 600, NOT 120, AND THAT IS A FIX TO THE GUARD RATHER THAN TO THE CODE. The
  // handler grew a `types.includes("Files")` check and the reasoning for it, and a character budget
  // measured off whatever the handler happened to look like the day it was written reddens on a
  // comment. What this line cares about is that dragover IS cancelled somewhere inside the handler.
  assert.match(surface, /onDragOver=\{[\s\S]{0,600}?preventDefault/, "dragover is not cancelled, so onDrop can never fire");
  // 🔴 AND THE CANVAS NOW SAYS SO WHILE THE FILE IS STILL IN THE AIR. It accepted drops silently
  // from 2026-08-20 until 2026-08-25: correct, and indistinguishable from inert. A target nobody
  // can see is a feature nobody finds.
  assert.match(surface, /<FileDropOverlay /, "the canvas gives no sign it accepts the drop");
  assert.match(surface, /setDraggingOver\(true\)/, "nothing raises the overlay");
  assert.match(surface, /setDraggingOver\(false\)/, "the overlay never comes down");
  // 🔴 REPOINTED 2026-08-31: a dropped file now goes to `attachWithChips`, which STAGES it in the
  // composer — a card the learner watches being read and can remove — and SEND commits it (owner:
  // "the attachments attach to composer before sending… and can remove attachment if necessary").
  // The property this line defends is unchanged and is still exactly what is pinned: the canvas
  // hands a dropped file to the code that ingests it, rather than dropping it on the floor.
  assert.match(canvasCode, /onDropFiles=\{attachWithChips\}/, "the canvas does not hand dropped files to the session");
});

test("🔴 the loading branch does NOT accept drops, because there is nothing to attach to", () => {
  // `session.attachFiles` needs a canvas. Accepting a file a beat before one exists is a silent
  // discard, which is worse than the browser's own refusal.
  const loading = canvasCode.slice(canvasCode.indexOf("if (!session.ready)"), canvasCode.indexOf("if (!session.ready)") + 900);
  assert.ok(!/onDropFiles/.test(loading), "the not-ready branch accepts drops it cannot honour");
});

// 🔴🔴 THIS TEST USED TO ASSERT THE CHIPS WERE INSIDE THE COMPOSER. It read: *"attachment chips are
// INSIDE the composer, not stacked above it"*, from owner 2026-08-20, *"i dont want the attachments
// to be above the chat composer at all."* Moving them inside was the wrong reading of that.
//
// Owner, 2026-08-21: *"sources are still appearing on the chat composer which i dont want. the
// sources should appear in the sources."* They are gone from the composer entirely now, so the
// assertion is inverted rather than deleted: what has to hold is that no future edit puts them
// back, above OR inside. `answer-is-not-a-start.test.ts` carries the rest — that the composer is
// not even GIVEN the list, and that the Sources panel still draws it.
// 🔴 SHARPENED AGAIN, 2026-08-23. The owner, pointing at ChatGPT's composer with two PDFs chipped
// on it: *"nemesis should also be able to attach attachments to the chat composer like in this
// image before sending."* Read beside 2026-08-21, the rule was never "no chips"; it was "no chips
// for things the learner did not attach" — the deleted row chipped machine-grounded pages because
// it was fed `canvas.sources`. So the guard now bans the DATA SOURCE, not the pixels: chips may
// draw only from `recentAttachments` (names captured at the picker), and the canvas's source list
// must never reach the composer as a list again.
test("🔴🔴 the composer chips only what the learner picked, never the canvas's sources", () => {
  const composer = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
  assert.ok(!/\{chipsInside && \(/.test(composer), "the chips are back inside the composer box");
  assert.ok(!/faviconUrl/.test(composer), "the composer is drawing source favicons again");
  assert.ok(!/pendingSources/.test(composer), "the source-list prop is back on the composer");
  assert.ok(/recentAttachments\.map/.test(composer), "the picked-file chips are gone");
  // The box itself is still a column, because the textarea grows inside it.
  //
  // 🔴 THE FILL IS A TOKEN OF ITS OWN NOW, AND THIS ASSERTION MOVED WITH IT (2026-08-26). It read
  // `bg-(--ui-bg-elevated)`, which computes to #fdfdfd — one unit off the page against the
  // reference's three. `--composer-fill` is #ffffff in light and #212121 in dark, both measured.
  // What this line is actually guarding is the `flex flex-col`; the fill just happens to sit in the
  // same string, so it has to be kept in step. See `answer-matches-reference.test.ts`, which owns
  // the fill and the edge.
  // 🔴 `relative` JOINED THE STRING 2026-08-31: the voice session's glow (VoiceSessionGlow) is an
  // inset layer inside the capsule, and a layer needs its parent positioned. The column is still
  // the thing this line guards.
  assert.ok(composer.includes('"relative flex flex-col bg-(--composer-fill)"'), "the composer stopped being a column");
});

test("🔴🔴 the canvas scrolls past the composer, which floats over it", () => {
  // Owner, 2026-08-20: *"also i cant scroll all the way down."* The scroller had top padding to
  // clear the header and NOTHING for the composer — which is absolutely positioned at bottom-0, so
  // it occupies no space in the scroll flow and the end of every answer sat permanently beneath it.
  // There was nothing below to scroll to.
  //
  // Calibration: drop the pb and this reddens.
  assert.match(canvasCode, /overflow-y-auto pb-\[160px\] pt-\[64px\]/, "the scroller does not clear the floating composer");
});

// ── Arriving at the canvas ───────────────────────────────────────────────────────────────────

test("🔴🔴 the canvas's own half of the transition exists at all", () => {
  // Owner, 2026-08-20: *"the transition from landing page to canvas needs to be smoother ... the
  // upper header controls need to appear as a fade in."*
  //
  // The FRONT DOOR half was already built — the composer travels down, the greeting fades — and
  // then the route changed and the canvas simply WAS there, header and all, hard-cut. Half a
  // transition reads worse than none: the eye is following a moving composer and the destination
  // arrives fully formed around it.
  const surface = readFileSync(new URL("./canvas-surface.tsx", import.meta.url), "utf8");
  assert.match(surface, /className="canvas-chrome-in /, "the header controls appear with no entrance");

  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes canvas-chrome-in/, "the animation is named but not defined");
  // 🔴 DELAYED, so the controls start after the composer has finished travelling and the two read
  // as one movement in sequence rather than two things at once.
  assert.match(css, /\.canvas-chrome-in \{ animation: canvas-chrome-in \d+ms \d+ms/, "the entrance has no delay, so it races the composer");
  // 🔴 AND SILENCED UNDER REDUCED MOTION, because the front door's own travel already is. Someone
  // who asked the system to stop moving must not get half of it anyway.
  // 🔴 THE LAST BLOCK, NOT THE FIRST. globals.css has five separate `prefers-reduced-motion`
  // blocks; `indexOf` finds one 49,000 characters away from the canvas rules, and slicing forward
  // from it reads a completely unrelated stylesheet.
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {\n  .canvas-swap,"));
  assert.ok(reduced.length > 0, "the canvas reduced-motion block moved");
  assert.match(reduced.slice(0, 400), /\.canvas-chrome-in,/, "the entrance ignores reduced motion");
});

test("🔴 the composer's drop is longer than it was, and lands softer", () => {
  // At 260ms the composer covered most of a screen height in a quarter of a second, which reads as
  // a jump with a blur rather than as a thing travelling.
  const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
  const dock = /const DOCK_MS = (\d+);/.exec(home);
  assert.ok(dock && Number(dock[1]) >= 300, `the drop is back to ${dock?.[1]}ms`);
  assert.match(home, /cubic-bezier\(0\.32, 0\.72, 0, 1\)/, "the drop is back on the brisker curve");
});

test("🔴🔴🔴 the character wears no punctuation, anywhere", () => {
  // 🔴 THIS GUARD IS REVERSED, AND THE REVERSAL IS THE POINT. It used to assert the mark EXISTED.
  //
  // The history, because a future reader will otherwise re-add this in good faith:
  //   · 2026-08-20 the owner asked for it in as many words — *"the mascot should have an
  //     exclamation mark or question mark appear above its head for those kinds of things"* — and
  //     chose it over `exclaim`/`alert`, the engine poses that deform the character into a glyph.
  //   · 2026-08-21 (twice) *"a random question mark"* / *"the mascot randomly gets a question mark
  //     on its head"*. Narrowed twice: not through Nemesis's own thinking, and not while the
  //     question it referred to was off screen (`regions.policy`, not just the policy's belief).
  //   · 2026-08-24 *"I didn't want a circle around the exclamation mark or the question mark"* and
  //     *"it's supposed to be an animation"*. The coin went; a pop-and-bob arrived.
  //   · 2026-08-26 *"remove the random question mark, exclamation mark above the mascot"*.
  //
  // Four narrowings, each true, none of them the reason. The mark was never carrying a fact: the
  // question is printed in full, in words, in the middle of the same page, and a failure already
  // renders its own banner. A glyph that restates what is already on screen reads as noise no
  // matter how precisely it is timed, which is why a fifth condition was not the answer.
  //
  // Calibration: restore any ONE of the four pieces below and this reddens.
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  const cssRaw = readFileSync(new URL("../../character/character.css", import.meta.url), "utf8");

  // 1. The dock cannot be handed one.
  assert.ok(!/\bmarker\?:/.test(dock), "the dock takes a marker prop again");
  assert.ok(!/\{marker && \(/.test(dock), "the dock draws a marker again");
  // 2. Nothing wears the animation class.
  assert.ok(!/className="character-mark/.test(dock), "the mark's span is back on the dock");
  // 3. The animation itself is gone, not merely unused — a live keyframe is an invitation.
  assert.ok(!cssRaw.includes("@keyframes character-mark-in"), "the mark's pop-in is back in the stylesheet");
  assert.ok(!cssRaw.includes("@keyframes character-mark-bob"), "the mark's bob is back in the stylesheet");
  // 4. And the canvas does not try to pass one.
  assert.ok(!/\bmarker=\{/.test(canvasCode), "the canvas is wiring a marker into the dock again");
  // The removal is recorded where the prop used to be declared, so the next person to want this
  // reads the four reports before re-adding it rather than after.
  assert.match(dock, /2026-08-26/, "the dock no longer records why the mark went");
});

test("🔴🔴 the mascot comes forward for a TURN, never for background work", () => {
  // 🔴 REPORTED AS THE MASCOT PAINTING OVER ANSWERS, AND MEASURED ON PRODUCTION. The dock's resting
  // position was correct — bottom 84px, left 336px, right at the composer — and a transform was
  // lifting it 412px and scaling it 2.1x, the deliberate "come forward to think" station, still
  // applied minutes after the answer had landed.
  //
  // The cause is what `policy.thinking` MEANS: `phase !== null`, and the phases include
  // `mapping_knowledge`, which is background knowledge resolution measured in MINUTES. A learner
  // reading a finished answer had a character standing over it at double size because something
  // unrelated was still running behind the page.
  //
  // 🔴 THE THINKING SCREEN ALREADY LEARNED THIS. `use-canvas-session` records the same distinction
  // in as many words — key on the turn, never on `working`, which includes knowledge resolution.
  // The dock was wired to the other signal and nobody had looked. Calibration: put
  // `policy.thinking` back and this reddens.
  assert.match(canvasCode, /stateForCanvas\(\{ thinking: turnInFlight, preparing: presence === "preparing" \}\)/);
  assert.ok(
    !/stateForCanvas\(\{ thinking: policy\.thinking/.test(canvasCode),
    "the dock is back on the policy's phase flag, which stays true through background work",
  );
});

test("🔴🔴🔴 every hook runs before the not-ready gate, so a loading canvas cannot change the hook order", () => {
  // React identifies hooks by call ORDER. The `!session.ready` return used to sit mid-component
  // with `useCanvasVoice`, the history rail's state and three more hooks below it, so the render
  // after the canvas's one database read called MORE hooks than the render before it. React
  // throws for exactly this, and in production the crash landed on the entry paths that start
  // unready — a deep link, a hard refresh, going back into an old canvas — and took the exit
  // button down with it.
  //
  // Calibration: move the gate back above `useCanvasVoice` and this reddens.
  const source = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  const gate = source.indexOf("if (!session.ready)");
  assert.ok(gate > 0, "the not-ready gate is gone entirely");
  const hooks = [...source.matchAll(/\buse[A-Z][A-Za-z]*\(/g)];
  const lastHook = hooks[hooks.length - 1]!;
  assert.ok(
    lastHook.index! < gate,
    `a hook call (${lastHook[0]}…) sits below the not-ready gate again`,
  );
});

test("🔴 a fresh reply sends the eyes to the words, and lets them go again", () => {
  // Owner 2026-08-24: when it is reading off the output, "look at the words that are on
  // screen". The release matters as much as the look: without lookAt(null) the character
  // would stare at where text used to be for the rest of the session.
  const lc = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(lc, /lookAt\(replyRegionRef\.current\)/, "the reply no longer draws the eyes");
  assert.match(lc, /lookAt\(null\)/, "the eyes are never released");
  assert.match(lc, /ref=\{replyRegionRef\}/, "the reply region lost its ref");
});

test("working is never just standing: the middle station sways, and reduced motion stands still", () => {
  // Owner 2026-08-25: "when it's thinking… not just staring — have some movements as well."
  // The sway is a state, not an event: it lives on the hop wrapper only while the station is
  // the centre, and prefers-reduced-motion removes it along with the other gestures.
  const css = readFileSync(new URL("../../character/character.css", import.meta.url), "utf8");
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  assert.ok(css.includes("@keyframes character-ponder"), "the sway is named but never defined");
  assert.match(css, /\.character-ponder,\s*\n\s*\.character-jump/, "reduced motion no longer switches the sway off");
  assert.match(dock, /station === "centre" \? "character-ponder"/, "the sway is not gated on holding the middle");
});

test("the character never vanishes while Nemesis works, and the words sit under it", () => {
  // Owner 2026-08-25, on production: "I'll send a prompt. It won't show the mascot… it would
  // just disappear" / "I want the mascot to be on top of the thinking preview lines."
  const canvas = code(CANVAS);
  assert.ok(!/hidden=\{presence/.test(canvas), "the dock is switched off for the preview again — that is the vanish");
  const preview = readFileSync(new URL("./canvas-thinking-preview.tsx", import.meta.url), "utf8");
  assert.ok(preview.includes("sr-only"), "the preview lost its screen-reader announcement");
  assert.ok(!preview.includes("min-h-[70vh]"), "the preview paints a visible wait again — two owners of one moment");
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /station === "centre" \? " left-1\/2 top-full"/, "the centred caption moved back beside the character");
});

test("the first placement waits for the composer's measurements", () => {
  // Owner 2026-08-25: the character "was already on the bottom left side, moving upward" — the
  // station placed instantly against the DEFAULT corner, then the real measurements animated
  // the correction as a diagonal drift. No placement counts until the anchor has measured.
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  assert.ok(dock.includes("anchoredRef"), "the anchored gate is gone");
  const gated = dock.match(/placed: anchoredRef\.current/g) ?? [];
  assert.equal(gated.length, 2, "both stations must refuse to count a placement before the anchor measures");
});

test("the open composer menu counts as composer: the dock floats clear of the popover", () => {
  // The contract with canvas-composer.tsx (PR #760): the + menu's popover carries
  // data-canvas-composer-popover precisely so this measurement can see it. Renaming either
  // side re-creates the owner's "the mascot clashes with the menu" silently.
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  assert.ok(dock.includes('querySelector("[data-canvas-composer-popover]")'), "the dock no longer measures the open menu");
  assert.match(dock, /Math\.min\(r\.top, popover\.getBoundingClientRect\(\)\.top\)/, "the union lost the higher edge");
  const composer = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
  assert.ok(composer.includes("data-canvas-composer-popover"), "the composer stopped stamping the popover — the dock is blind to it");
});

test("a new send fades the old answer while the character takes the centre", () => {
  // Owner 2026-08-25: "the current output did not disappear… to have the mascot in the middle."
  assert.match(CANVAS, /turnInFlight \? " canvas-preview-out" : ""/, "the previous reply no longer eases out under a new turn");
});

test("a PowerPoint ask in chat becomes a deck, not a lesson about decks", () => {
  // Owner 2026-08-25. The route sits BEFORE the policy turn in converse, is narrow by the
  // detector's own tests, and busies the surface with an honest label while it builds.
  const hook = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
  const route = hook.indexOf("readDeliverableAsk(said)");
  const policyCall = hook.indexOf("askCanvasChat(id");
  assert.ok(route > -1, "the chat ask is no longer read");
  assert.ok(policyCall > -1);
  assert.ok(route < policyCall, "the ask routes AFTER the policy turn — the turn steals it back");
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  // 🔴🔴 THE "MAKE SLIDES" BUTTON IS GONE ON PURPOSE — owner, 2026-08-24: "remove the make flash
  // cards, make slide, make summary note from the output section." The outputs tab LISTS what a
  // canvas has produced; asking is done in words, which is exactly what the first half of this test
  // checks and what §38 already required of every other learning request. So the assertion worth
  // keeping is the opposite one: no Make button came back.
  assert.ok(!controls.includes("Make slides"), "a Make button returned to the outputs tab");
  // 2026-08-24 REVERSAL (separate, same day): this used to demand `downloadDeck` here. The owner
  // moved the deck into the app ("HTML is the deck, .pptx is an export"), so the row now OPENS it
  // and the download lives inside the deck view. The invariant is unchanged and survives both
  // changes — a slides output must still be REACHABLE from the outputs tab, just not makeable there.
  // 2026-08-25 (third turn on this line, same invariant): the row now opens the SIDE PANEL rather
  // than carrying the href itself, and the panel links out to the full deck. A slides output must
  // still be reachable from the outputs shelf; where it goes has changed twice and may again.
  assert.match(controls, /output\.kind === "slides" && output\.deck/, "a slides output can no longer be opened");
  const library = readFileSync(new URL("../library/library-outputs.tsx", import.meta.url), "utf8");
  assert.match(library, /generated_slides/, "the Library no longer lists slide decks");
});

test("a deck's design is the learner's to choose, in both places it lives", () => {
  // Owner 2026-08-25: "I need twenty themes", then — when twenty gradients arrived — "those
  // themes are terrible… like slides and PowerPoint have the designers feature". A picker the
  // learner cannot reach is not a choice, so both surfaces that hand over a .pptx carry it,
  // and both pass the chosen id through to the builder rather than downloading the house
  // design regardless.
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /DeckDesignPicker/, "the canvas outputs panel lost its design picker");
  // 🔴 2026-09-01: THE LIBRARY IS NO LONGER ONE OF THOSE PLACES, and that is the owner's own call
  // — his screenshot ringed the Library's whole trailing column, design chip included: *"the
  // documents in library have these options that i dont want."* It was the weaker of the two
  // doors anyway: a named chip beside a table row asks you to choose a look you cannot see. The
  // invariant this test exists for is unchanged — the picker must live wherever a learner can
  // reach a deck — so it is now checked in the two surfaces that SHOW the slides.
  const library = readFileSync(new URL("../library/library-outputs.tsx", import.meta.url), "utf8");
  assert.ok(!/DeckDesignPicker/.test(library), "the design chip came back to a Library row that cannot show what it changes");
  // 2026-08-24 REVERSAL: the download used to happen from these rows, so the guard checked that
  // the chosen design was passed to downloadDeck here. Both rows now open /deck, which carries
  // the picker AND the export; the design still reaches the builder, one surface further in.
  const deck = readFileSync(new URL("../../../app/(workspace)/deck/page.tsx", import.meta.url), "utf8");
  assert.match(deck, /<DeckDesignPicker\b/, "the deck view lost the picker the Library handed it");
  assert.match(deck, /downloadDeck\(plan, output\.title, designId\)/, "the deck view exports without the chosen design");
});

test("🔴 the character wears no costume, and its sway does not lift it off the line", () => {
  // Owner 2026-08-26, on production after adding documents: *"the mascot still has 'glasses' which
  // is not what we worked on. and the mascot moves up and down which i dont want."*
  //
  // 🔴 THE GLASSES WERE TRUE AND STILL WRONG. They went on only while material was being taken in,
  // which is the one moment "reading" is literal. A prop appearing on the character is still a
  // second thing happening on a screen where something is already happening, and the ingestion
  // already says so in words. `lib/avatar/features.ts` keeps the face so the character studio can
  // draw it; the app does not hand it one.
  //
  // 🔴 AND THE SWAY LEANS RATHER THAN RISING. The 50% frame carried `translateY(-4px)` beside the
  // rotation, so every crossing lifted the whole body. A repeating vertical move on a page of text
  // reads as something bobbing for attention, which is the opposite of a state. The lean stays —
  // the owner asked for movement while it thinks on 2026-08-25 — and nothing rises.
  const canvas = code(CANVAS);
  assert.ok(!/face=\{busy/.test(canvas), "the reading glasses are back on the canvas's character");
  const css = readFileSync(new URL("../../character/character.css", import.meta.url), "utf8");
  const ponder = css.slice(css.indexOf("@keyframes character-ponder"));
  const body = ponder.slice(0, ponder.indexOf("}\n}") + 3);
  assert.ok(!/translateY/.test(body), "the sway lifts the character off its line again");
  assert.match(body, /rotate\(-?1\.7deg\)/, "the sway lost the lean that replaced the lift");
});

test("🔴 the character's two surfaces grow together", () => {
  // Owner 2026-08-26: "make the mascot bigger in the app." 60 -> 76 at the composer, 64 -> 80 on
  // the front door. They are different components and the hand-off between them is only invisible
  // while the ratio holds; growing one alone makes the character change size mid-flight.
  const dock = readFileSync(new URL("../../character/character-dock.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
  const dockSize = Number(/export const DOCK_SIZE = (\d+)/.exec(dock)?.[1]);
  const greeter = Number(/const GREETER_SIZE = (\d+)/.exec(home)?.[1]);
  assert.ok(dockSize >= 76, `the character shrank at the composer (${dockSize})`);
  assert.ok(Math.abs(greeter / dockSize - 64 / 60) < 0.06, `the two surfaces drifted apart (${greeter} vs ${dockSize})`);
});
