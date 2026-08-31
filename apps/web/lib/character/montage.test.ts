// The faces the character wears while nothing is happening.
//
// Owner, 2026-08-27: *"it still does not do expressions after a while of following the mouse"*, and
// then, plainly: *"it essentially needs to follow mouse but also do montage of expressions"*.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ANIMATION_BY_ID, animationDuration, FACE_BY_ID, RADIUS } from "@/lib/avatar";
import { ANIMATIONS as GAZE_ANIMATIONS } from "@/lib/avatar/animations";
import { EXPRESSION_IDS } from "@/lib/avatar/expressions";

import { attentionAt, FOLLOW_MS } from "./attention";
import { holdFor, MONTAGE, MONTAGE_CHOICES, MONTAGE_HOLD_MS, MONTAGE_LEFT_OUT, resolveMontage } from "./montage";

// 🔴 THE WALK MOVED TO `attention.ts`, SO THESE ASK IT. This file used to own both the catalogue
// and the clock that walked it, and owning both is what let a SECOND clock decide the cursor
// independently — see the note at the top of `attention.ts`. The assertions below are unchanged in
// what they claim; they now put the question to the clock that answers it. Every entry is preceded
// by its own stretch of watching, which is the one thing that shifts.
const worn = (ms: number, chosen?: readonly string[]) => {
  const at = attentionAt({ ms, chosen });
  return at.kind === "absorbed" ? at.entry : null;
};
/** When entry `i` of `list` starts, counting the watching stretch before each. */
const startOf = (i: number, list: readonly string[]) =>
  (i + 1) * FOLLOW_MS + list.slice(0, i).reduce((sum, id) => sum + holdFor(id), 0);

test("🔴 everything the montage can play is a real animation", () => {
  // 🔴 REPOINTED 2026-08-27. This used to assert every entry was one of the SIXTEEN FEELINGS, and
  // that assertion was the bug wearing a green tick: the twenty-three gaze loops were in the
  // catalogue the whole time, `resolveMontage` silently dropped them, and a test said that was
  // correct. The invariant that actually matters has not changed — the montage names things the
  // engine can play — so it is asked of ANIMATIONS rather than of one hand-picked subset.
  for (const id of [...MONTAGE, ...MONTAGE_LEFT_OUT]) {
    assert.ok(ANIMATION_BY_ID.has(id), `${id} is not a playable animation`);
  }
  const both = MONTAGE.length + MONTAGE_LEFT_OUT.length;
  assert.equal(both, MONTAGE_CHOICES.length, "the choices are not all accounted for");
  assert.equal(both, GAZE_ANIMATIONS.length + EXPRESSION_IDS.length, "the 23 loops and 16 feelings are not all offered");
});

test("🔴🔴 the loops are offered, and they are the half that moves", () => {
  // Owner 2026-08-27: *"there are still some expressions missing, check the github, because the
  // website doesnt just show them forward facing but also moving around"*. Measured on a 76px
  // character, a loop travels 13-30px over its cycle and a held feeling travels under a pixel, so
  // a picker with only the feelings on it offers no movement at all.
  const loops = MONTAGE_CHOICES.filter((c) => c.kind === "loop");
  assert.equal(loops.length, GAZE_ANIMATIONS.length, "the picker does not offer every gaze loop");
  for (const loop of loops) {
    const a = ANIMATION_BY_ID.get(loop.id)!;
    assert.ok(a.steps.length >= 1, `${loop.id} has no steps`);
  }
  // A loop is a PLAYLIST: all but the one-step `gaze-waking` change face on their own.
  const many = loops.filter((l) => (ANIMATION_BY_ID.get(l.id)?.steps.length ?? 0) > 1);
  assert.ok(many.length >= 20, `only ${many.length} of the offered loops cycle more than one pose`);
  // And every one of them is in the montage's own vocabulary, not a second mechanism.
  assert.ok(MONTAGE.some((id) => id.startsWith("gaze-")), "the default set plays no loops at all");
  assert.deepEqual(resolveMontage(["gaze-searching"]), ["gaze-searching"], "a chosen loop is dropped on the floor");
});

test("🔴🔴 a loop gets its whole cycle, not the held-face floor", () => {
  // 🔴 A FIXED FIVE SECONDS IS THE FEATURE NOT HAPPENING. `gaze-searching` is six poses over 16.8s;
  // five seconds of it is two poses and a cut, which on screen is the held face this replaces.
  const searching = animationDuration(ANIMATION_BY_ID.get("gaze-searching")!);
  assert.ok(searching > MONTAGE_HOLD_MS, "the fixture is no longer longer than the floor");
  assert.equal(holdFor("gaze-searching"), searching, "a loop is cut off before it finishes");
  assert.equal(holdFor("neutral"), MONTAGE_HOLD_MS, "a held face lost its floor");
  assert.equal(holdFor("not-a-thing"), MONTAGE_HOLD_MS, "an id the catalogue lost should fall back, not throw");
  // Walked end to end, every entry is reached and each one lasts exactly its own hold.
  const one = ["gaze-searching", "neutral"];
  const at = (ms: number) => worn(ms, one);
  assert.equal(at(startOf(0, one)), "gaze-searching");
  assert.equal(at(startOf(0, one) + searching - 1), "gaze-searching", "the loop was cut short");
  assert.equal(at(startOf(1, one)), "neutral", "the montage never moves off the loop");
  assert.equal(at(startOf(1, one) + MONTAGE_HOLD_MS - 1), "neutral");
  assert.equal(at(startOf(1, one) + MONTAGE_HOLD_MS + FOLLOW_MS), "gaze-searching", "the round does not come back to the start");
});

test("🔴🔴 what is left out is named rather than quietly dropped", () => {
  // 🔴 REPOINTED 2026-08-27, AND THE HISTORY IS THE POINT. This used to assert the left-out set was
  // exactly `["angry", "scared"]`, under rule three — *a feeling points at itself, never at the
  // learner* — because at rest there is nothing else for a face to be about. The owner then ticked
  // both, from a model sheet that showed all thirty-nine running and named every one. An informed
  // choice by the person whose product it is beats a rule I wrote, so the assertion moves to the
  // invariant underneath: the two lists partition the choices, and neither is silently short.
  assert.ok(MONTAGE.includes("angry") && MONTAGE.includes("scared"), "the owner's own picks were dropped");
  for (const id of MONTAGE_LEFT_OUT) assert.ok(!MONTAGE.includes(id), `${id} is both in and out`);
  const all = new Set([...MONTAGE, ...MONTAGE_LEFT_OUT]);
  assert.equal(all.size, MONTAGE_CHOICES.length, "a choice is neither in nor out");
  // Rule three still governs the SCHEDULE, which is the half that makes a claim about the work.
  assert.ok(MONTAGE.length >= 20, "the default set shrank back to a handful");
});

test("🔴🔴 it runs ONLY at rest, and never over something the character is doing", () => {
  // 🔴 THE GATE MOVED INTO THE HOOK WITH THE CLOCK, and it has to be asserted somewhere or a
  // montage face paints over a character that is working. `attentionAt` is deliberately ignorant
  // of activity — it answers for a rest — so `useMontage` is where the two are joined.
  const hook = readFileSync(new URL("../../components/character/use-montage.ts", import.meta.url), "utf8");
  assert.match(hook, /!atRest \|\| busy \|\| since === 0\s*\?\s*null/, "a montage face is painted over a working character or a poke");
  assert.notEqual(worn(FOLLOW_MS + 10), null, "the montage never runs at all");
});

test("it moves on at its own schedule and comes back round", () => {
  // 🔴 REPOINTED 2026-08-27 FROM A FIXED HOLD. Every entry used to last exactly `MONTAGE_HOLD_MS`,
  // so the old assertions could name that number directly. They now ask each entry for its own
  // hold, which is the same question against the shape the montage actually has.
  const first = holdFor(MONTAGE[0]!);
  const round = MONTAGE.length * FOLLOW_MS + MONTAGE.reduce((sum, id) => sum + holdFor(id), 0);
  const open = startOf(0, MONTAGE);
  assert.equal(worn(open), MONTAGE[0], "it does not start at the start");
  assert.equal(worn(open + first - 1), MONTAGE[0], "an entry was cut short inside its own hold");
  assert.equal(worn(open + first), null, "it does not go back to watching between entries");
  assert.equal(worn(startOf(1, MONTAGE)), MONTAGE[1], "it moved on to something that is not the next entry");
  assert.equal(worn(open + round), MONTAGE[0], "the round does not return to where it started");
  assert.equal(worn(open + round * 3 + 17), worn(open + 17), "the round is not the same every time");
});

test("🔴 unhurried, but not so slow that nobody ever catches two", () => {
  // 🔴 REPOINTED 2026-08-27: 9s → 5s (owner: *"its still not doing the expression montage i want"*).
  // The floor's reasoning holds — the commonest thing a learner does here is READ, and a face
  // changing every second in the corner of their eye pulls at attention they are spending
  // elsewhere. The CEILING is the half that was missing: an expression moves the eyes only, on a
  // 76px character, so it is a quiet change to begin with, and at nine seconds most people never
  // saw two in a row and concluded nothing was happening.
  assert.ok(MONTAGE_HOLD_MS >= 3_000, `${MONTAGE_HOLD_MS}ms is a flicker beside someone trying to read`);
  assert.ok(MONTAGE_HOLD_MS <= 7_000, `${MONTAGE_HOLD_MS}ms is slow enough that nobody notices it happening`);
});

test("🔴🔴 the learner's own list is used, and a bad one never leaves the character faceless", () => {
  // Owner, 2026-08-27: *"allow me to pick the expressions for the montage"*. It is stored in
  // `localStorage`, so it can be anything: from an older build, hand-edited, or emptied.
  assert.equal(worn(startOf(0, ["happy"]), ["happy"]), "happy", "a chosen list is ignored");
  assert.equal(worn(startOf(0, ["happy"]) + (MONTAGE_HOLD_MS + FOLLOW_MS) * 3, ["happy"]), "happy", "one chosen face should hold");
  assert.deepEqual(resolveMontage(["happy", "not-a-face"]), ["happy"], "an unknown id is drawn instead of dropped");
  // 🔴 EMPTY MEANS THE DEFAULT, NOT NOTHING. "No expressions" is already expressible by leaving one
  // ticked, and a character frozen on one face is a better failure than a blank one.
  assert.deepEqual(resolveMontage([]), MONTAGE);
  assert.deepEqual(resolveMontage(["nope"]), MONTAGE);
  assert.deepEqual(resolveMontage(null), MONTAGE, "null is 'not read from storage yet'");
});

test("🔴 every entry the picker offers is real, and it offers all thirty-nine", () => {
  // The card draws each one with the live engine, so a bad id is a blank tile the owner would be
  // asked to choose from. The default is a recommendation, not a cage: everything is offered.
  for (const choice of MONTAGE_CHOICES) {
    assert.ok(ANIMATION_BY_ID.has(choice.id), `the picker offers ${choice.id}, which is not playable`);
    assert.ok(choice.label.trim().length > 0, `${choice.id} has no label for the card`);
    assert.ok(choice.kind === "loop" || choice.kind === "feeling", `${choice.id} has no kind`);
    // A feeling is a single held face, so it must also exist as a face; a loop names several.
    if (choice.kind === "feeling") assert.ok(FACE_BY_ID.has(choice.id), `${choice.id} is not a drawable face`);
  }
  assert.equal(new Set(MONTAGE_CHOICES.map((c) => c.id)).size, MONTAGE_CHOICES.length, "the picker offers the same id twice");
  assert.equal(MONTAGE_CHOICES.filter((c) => c.kind === "feeling").length, EXPRESSION_IDS.length, "a feeling is missing from the picker");
  for (const id of [...MONTAGE, ...MONTAGE_LEFT_OUT]) {
    assert.ok(MONTAGE_CHOICES.some((c) => c.id === id), `${id} is in the default set but not offered`);
  }
  // 🔴 THE CARD MUST SEPARATE THEM. An undifferentiated wall of thirty-nine words is how the
  // moving half went missing the first time.
  const card = readFileSync(new URL("../../components/SettingsSurface.tsx", import.meta.url), "utf8");
  assert.match(card, /c\.kind === kind/, "the settings card stopped grouping the two kinds");
});

test("🔴🔴 BOTH surfaces run the montage, not just the canvas", () => {
  // This is most of why the owner kept saying he could not see it: it was wired into the dock and
  // the FRONT DOOR renders `NemesisAvatar` directly, so every layer the dock composes has to be
  // repeated there. The character was doing its montage on the screen he was not looking at.
  const home = readFileSync(new URL("../../components/workspace/learn/canvas-home.tsx", import.meta.url), "utf8");
  const dock = readFileSync(new URL("../../components/character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(home, /useMontage\(/, "the front door's greeter stopped pulling faces");
  assert.match(home, /animation=\{greeterFace\.state\}/, "the greeter computes a montage face and then draws something else");
  assert.match(dock, /useMontage\(/, "the canvas character stopped pulling faces");
});

test("🔴 the montage is addressed from a clock, not advanced by a timer", () => {
  // Same construction as the blink schedule: asking about a moment an hour in costs the same as
  // the first second, and it cannot drift. A counter would also make every character on a page
  // march in step, which is what `seed` exists to prevent.
  // 🔴 REPOINTED 2026-08-27: the holds became uneven, so the arithmetic became a walk over a list
  // of holds. The invariant is unchanged and is what is asserted — `restingMs` is the only clock,
  // and nothing in this file counts ticks.
  const src = readFileSync(new URL("./attention.ts", import.meta.url), "utf8");
  assert.match(src, /ms % pass/, "the clock stopped addressing its round from the time it is given");
  assert.ok(!/setInterval|setTimeout|Date\.now|performance\.now/.test(src), "the clock grew a clock of its own");
  for (const file of ["./montage.ts"]) {
    const other = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!/setInterval|setTimeout|Date\.now/.test(other), `${file} grew a clock of its own`);
  }
  // Asked about a moment an hour in, it answers, and it answers the same as one round earlier.
  const round = MONTAGE.length * FOLLOW_MS + MONTAGE.reduce((sum, id) => sum + holdFor(id), 0);
  const hour = 60 * 60 * 1000;
  assert.equal(
    JSON.stringify(attentionAt({ ms: hour })),
    JSON.stringify(attentionAt({ ms: hour + round })),
    "one full round does not return to the same entry",
  );
});

test("🔴 nothing in the default set sleeps through a learner's session", () => {
  // Owner 2026-08-28: *"remove sleeping and drowsy"*. `useDoze` owns actually falling asleep and
  // only does it once the learner has been away; a resting montage that plays sleep while someone
  // is reading looks broken rather than restful.
  assert.ok(!MONTAGE.includes("gaze-sleeping"), "gaze-sleeping is back in the resting montage");
  assert.ok(!MONTAGE.includes("gaze-drowsy"), "gaze-drowsy is back in the resting montage");
  // Still OFFERED, because the default is a recommendation and not a cage.
  for (const id of ["gaze-sleeping", "gaze-drowsy"]) {
    assert.ok(MONTAGE_CHOICES.some((c) => c.id === id), `${id} was removed from the picker as well`);
    assert.ok(MONTAGE_LEFT_OUT.includes(id), `${id} is neither in the set nor named as left out`);
  }

  // 🔴 MEASURED, NOT ASSUMED: how much of one round has BOTH eyes shut. One narrow eye is a squint,
  // which is an expression; two is sleep. Was 22% of the round, now 12%.
  const shutShare = (ids: readonly string[]) => {
    let total = 0, shut = 0;
    for (const id of ids) {
      const a = ANIMATION_BY_ID.get(id);
      if (!a) continue;
      const hold = holdFor(id), per = hold / a.steps.length;
      for (const s of a.steps) {
        const f = FACE_BY_ID.get(s.face)!;
        if (Math.max(f.left.height, f.right.height) / RADIUS <= 0.2) shut += per;
      }
      total += hold;
    }
    return shut / total;
  };
  assert.ok(shutShare(MONTAGE) < 0.15, `${(shutShare(MONTAGE) * 100).toFixed(0)}% of the round is spent with both eyes shut`);
  assert.ok(shutShare([...MONTAGE, "gaze-sleeping", "gaze-drowsy"]) > 0.19, "the fixture no longer shows what was removed");
});
