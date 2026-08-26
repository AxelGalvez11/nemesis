// The two thinking previews. They are different objects and the owner asked for BOTH — "the
// thinking previews should match the webapp and have the mascot too and the thinking preview
// line" — so this file carries the pair and names the difference, because shipping one of them
// and calling it done is the easy mistake.
//
// 1. `CanvasThinkingPreview` — the learner has just sent something and there is nothing to read
//    yet. The character comes to the middle of the surface at 128pt WITH ITS FACE ON, and centred
//    under it one 12pt caption with a highlight travelling through the words, left to right (owner
//    2026-08-21: "this should be pulsing from left to right", against a red circle around the
//    caption alone — see the note at the caption itself, and `CanvasSweepText.tsx` for how it is
//    drawn). Those two things are the entire screen.
//    🔴 THERE IS NO ROW OF PULSING DOTS ON THIS SCREEN ANY MORE, AND ITS ABSENCE IS A DECISION
//    RATHER THAN AN OVERSIGHT (owner 2026-08-21, verbatim: "also remove the three dots animation,
//    i only want the mascot and the thinking words"). For part of the SAME DAY a trio of staggered
//    dots sat on the caption's own row, immediately left of the words, built to match a reference
//    image the owner attached — characters with faces, and beside them a separate group of three
//    animated dots with a short label. The owner then watched it on the device and took them out.
//    So that reference image is still the authority on the CHARACTER (face on, no coloured rings —
//    see `WAITING_FACE` below) and is NOT the authority on the dots: anyone who finds the image
//    later must not put them back thinking they were lost by accident. What was deleted with them
//    and what the ambient line below still needs is recorded at `PULSE_MS` in `canvas-metrics.ts`.
//    🔴 IT REPLACES WHAT WAS ON SCREEN; IT DOES NOT SIT UNDER IT (owner call, both halves,
//    2026-08-20). Rendering it as a small inline indicator above the answer looks like a
//    reasonable simplification and is the wrong one — the point of coming to the middle is that
//    the system has the floor.
//
// 2. `CanvasThinkingLine` — work is happening BESIDE content that is already on screen. A 6pt dot
//    and a 14pt phrase, and nothing else.
//    🔴 DELIBERATELY THE LEAST INTERESTING THING ON THE SURFACE. No ring, no sweep, no orbit, no
//    character. It is ambient; a second animated mascot beside an answer competes with the answer.
//    That argument is untouched by the 2026-08-21 rebuild of the preview above: the preview earned
//    a character because it owns an EMPTY screen, and this one never does.
//
// 🔴 THE CAPTION NAMES A STEP THAT IS ACTUALLY RUNNING, OR THERE IS NO CAPTION. Both take their
// text from `lib/thinking-phase.ts`, whose own header explains at length why: every phrase there
// maps to a real pipeline stage (the route decision, a real search with its real query, the real
// number of sources that came back). A plausible timed walk through "Reading → Mapping →
// Preparing" would look better and would be undetectable narration about work nobody is doing.
// `phaseLabel` returning "" is a real answer and means show nothing. There is no clock, no step
// counter and no percentage in this file. With the dots gone the caption is the only thing on the
// waiting screen that says anything at all, which raises rather than lowers the bar on it: there
// is nothing else left to carry the wait honestly if it starts narrating. What says "still
// working" without making a claim is now the character's own idle movement and the band travelling
// through the words — neither of which asserts a step, a position or a time.

import { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import type { StateId } from "@nemesis/shared/bloub/states";
import { speedOf } from "@nemesis/shared/character/stations";
import { BloubBot } from "@/components/bloub/BloubBot";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

import {
  CANVAS_TEXT,
  PULSE_DOT,
  PULSE_GAP,
  PULSE_MS,
  PULSE_REST,
  THINKING_BLOCK_VH,
  THINKING_MASCOT,
} from "./canvas-metrics";
import { CanvasFadeIn } from "./CanvasFade";
import { CanvasSweepText } from "./CanvasSweepText";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The animation the waiting character wears, and the one decision in this file a reader will
 * question first, so it is answered first.
 *
 * 🔴 IT IS NOT `thinking`, AND THAT IS THE OWNER'S THIRD ANSWER TO A QUESTION THEY HAVE NOW
 * ANSWERED THREE TIMES (owner 2026-08-21: "i need a better thinking animation, remove the
 * colorful swirls around the mascot. i need the thinking to have the mascot in it too like the
 * attached reference").
 *
 * The history, because without it this line looks like a mistake to be tidied back:
 *
 *   1. It was `orbit`. `apps/web/components/workspace/learn/canvas-thinking-preview.tsx` still
 *      carries the reason, and the reason was correct: at 128px the engine's own `thinking`
 *      "dissolves the ball INTO the middle dot and reads as an ordinary typing indicator with no
 *      character in it".
 *   2. The owner overruled that on 2026-08-20 ("why is it only doing swirl?") after watching the
 *      rings on the real surface — `orbit` is the loudest animation in the catalogue and it played
 *      on every single wait, so it stopped meaning anything. Both surfaces moved to `thinking`.
 *   3. Which put back exactly the fault web had described. The owner's screenshot of the phone
 *      mid-answer is three grey dots and the words "Thinking it through…" — no character anywhere.
 *      So BOTH of the options that were ever on the table are now rejected: faceless dots, and
 *      loud coloured rings. Today's instruction supplies the third — a character that keeps its
 *      own face while it waits. (The reference also put a separate trio of dots beside that
 *      character, and those were built and then removed by the owner later the same day; see the
 *      file header. The state chosen here is unaffected — it was never the dots' companion, it was
 *      the answer to "the mascot has no face".)
 *
 * Read off the state table under node rather than assumed (`packages/shared/src/bloub/states.ts`,
 * every state sampled across four seconds of its own clock):
 *
 *   state      eyeAlpha  arcs  decor-dots  baseFace  baseBody
 *   idle       1         0     0           true      true
 *   thinking   0         0     2           false     false   ← no face, and the BODY is the 3rd dot
 *   orbit      1         6     0           false     false   ← the coloured rings
 *   swirl      1         3     0           true      true    ← half the same rings
 *   comet      0         4     0           false     false
 *
 * `idle` is `pose: () => base()` (states.ts:214) and `base()` sets `eyeAlpha: 1` and `arcs: []`
 * (states.ts:79, 82) — a face that is drawn, and not one coloured arc anywhere. The arcs are what
 * the owner means by "colourful swirls": `decor.ts`'s `RINGS`, `SWOOSH` and `COMET_RIBBONS` are
 * the only coloured things the character can wear, and they are hue-wheel gradients
 * (`wheel(seed.hue)`, decor.ts:155) against an otherwise monochrome palette.
 *
 * And the same check run end to end rather than on the pose alone — a real `BotEngine` in `idle`,
 * fed the phone's own idle look-around (`idleAim` through `centredLook`, which is exactly what
 * `BloubBot`'s loop does when nothing passes `aimAt`), sampled for sixty seconds at 60fps: zero
 * arcs and zero decor dots in every one of the 3,600 frames, two open eyes in every one of them,
 * and the eye centres travelling 58.5px horizontally and 23.9px vertically on a 100px-radius body
 * — about 37pt and 15pt at the 128pt this is drawn at. That last number is the point of choosing a
 * state with a face at all: the character is not a still image while the learner waits.
 *
 * 🔴 IT IS NOT THE ONLY FACED, ARC-FREE STATE, AND THE OTHERS ARE REJECTED FOR A DIFFERENT REASON
 * THAN THE COLOUR. `wink`, `wide`, `notify`, `egg` and `hexagon` all draw a face and carry no arcs
 * either. Each of them is a BEAT — a pose measured off the reference recording and meant to be
 * held for a second or two: a wink held for the length of a real web search reads as a tic, `egg`
 * and `hexagon` replace the body with a different shape, and `notify` adds the blue pastille,
 * which announces that something ARRIVED while the learner is still waiting for it. Only `idle`
 * and `swirl` have `baseFace` and `baseBody` true, which is the flag that means the character
 * wears its own resting face and the learner's chosen silhouette rather than a pose belonging to
 * one animation — and `swirl` is three of the same coloured rings. That leaves one.
 *
 * 🔴 AND IT IS A LITERAL HERE, WHICH IT DELIBERATELY WAS NOT BEFORE. This read
 * `stateFor("thinking")`, with a note saying it must never be a literal so that a wait cannot look
 * like one thing on a laptop and another on a phone. That rule is intact and still governs every
 * OTHER caller: `@nemesis/shared/character/stations.ts` answers "what does the system DOING this
 * look like", and its answer for a wait is still `thinking` — which is right where it is still
 * used. `learn.tsx` hands `stateForCanvas`'s answer to the 52pt `CanvasDock` while an answer
 * streams, and there the three-dot morph beside a paragraph of prose is an ordinary typing
 * indicator, which is exactly what an ambient wait beside content should be. This component
 * stopped asking that question. It does not draw the activity with the character at all: the
 * caption's travelling band is the activity, and the character is just the character, present and
 * alive, which is what the reference shows. That division is why removing the dots did not leave a
 * hole — they were never the thing that made the character make sense, and the character was never
 * the thing that reported the work. Asking the shared table for a "resting"
 * state instead was tried and rejected in the same breath — `stateFor("resting")` does return
 * `idle`, but `NemesisActivity`'s own doc defines `resting` as "Nothing is running; the learner
 * has the floor", and something IS running. Passing a lie to get the right pose is worse than a
 * named literal with the evidence above attached to it.
 */
const WAITING_FACE: StateId = "idle";

/**
 * The full-surface wait: the character in the middle, and one caption centred under it. Nothing
 * else — see the file header for the dot trio that stood here for part of 2026-08-21.
 *
 * `label` is `phaseLabel(phase)` — or null before the first phase arrives, which is a real state
 * lasting a few hundred milliseconds. It is drawn as the character ALONE, with no caption, rather
 * than as a guess at what is about to happen. That gap used to be covered by the dots, so it is
 * worth being explicit about what it looks like now: `BloubBot`'s idle gaze is running the whole
 * time (see the omissions at the call site), so the learner gets a character glancing about, not a
 * frozen picture. A placeholder caption to fill the gap is the obvious substitute and is the one
 * thing the header forbids — it would name a step that is not running.
 */
export function CanvasThinkingPreview({ label, paper }: { label: string | null; paper?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // 🔴 A MEASURED FRACTION OF THE WINDOW, NOT `"70%"` AND NOT `flex: 1`. The web file records the
  // bug this replaces: the block renders inside the crossfade wrapper, which has no height of its
  // own, so a percentage collapsed and the character ended up pinned to the top of the column.
  const minHeight = Dimensions.get("window").height * THINKING_BLOCK_VH;
  return (
    <View
      style={[styles.block, { minHeight }]}
      // 🔴 ONE ELEMENT, ONE ANNOUNCEMENT. `accessible` groups the whole block into a single
      // accessibility element, so a screen reader says the progress bar's name and stops. Without
      // it the caption below is a second focusable node carrying the SAME words, and VoiceOver
      // reads the state twice — "Thinking it through…, Thinking it through…". The drawing needs no
      // help: `BloubBot` hides its own subtree unless it is given a `label` or an `onPoke`, and
      // this call site gives neither, so it is decorative by construction rather than by a prop
      // somebody has to remember. With the dot trio gone the caption is the only text inside this
      // group, and it is still the group — not the caption — that announces.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Thinking"}
    >
      {/* `paper` is load-bearing, not cosmetic: the eyes are holes cut in the body and the rings
          pass behind it, so the backing must be EXACTLY the colour of the surface underneath or an
          orbit ring reappears inside the eyes. The caller passes the surface it is actually on.
          `idle` draws no rings, but the eyes are still holes, so this is not optional here either.

          Nothing is passed for `aimAt`, `gaze` or `entrance`, and all three omissions are load-
          bearing. With no aim, `BloubBot`'s loop drives the idle look-around from
          `@nemesis/shared/character/gaze`, which is what makes a character standing still read as
          alive rather than as a frozen asset — it already exists and this file gets it for free by
          asking for nothing. `entrance` would open with a full turn around the sphere during which
          the character HAS NO FACE for 1.1 seconds, which is the exact fault being fixed. */}
      <BloubBot
        state={WAITING_FACE}
        size={THINKING_MASCOT}
        paper={paper ?? c.bg}
        speed={speedOf(WAITING_FACE)}
      />
      {/* 🔴 THE CAPTION IS A DIRECT CHILD OF THE CENTRED COLUMN, AND IT TOOK TWO CHANGES, NOT ONE,
          TO PUT IT UNDER THE CHARACTER (owner 2026-08-21, "also remove the three dots animation, i
          only want the mascot and the thinking words"). What stood here was a ROW —
          `styles.status`, `flexDirection: "row"` — holding the dot trio, then a `PULSE_GAP` of
          11.25pt, then the caption. Deleting the three `PulseDot`s out of that row and stopping
          there is the tempting one-line version and it leaves the wrong thing behind twice over:

            1. The ROW is dead structure. `styles.block` already centres whatever it holds, so a row
               with one child in it lays nothing out; it is a wrapper plus an 11.25pt gap between
               nothing and the caption.
            2. The caption's own TEXT was deliberately left-aligned, because the dots used to anchor
               its left edge — the style here carried the words "it sits to the right of the dots".
               A left-aligned caption inside a box that is only as wide as its longest line is
               invisible on one line and obvious on two: the shorter line hangs to the left instead
               of balancing under a character that is dead centre.

          So: the row is gone rather than emptied, `textAlign: "center"` is on the caption, and
          `styles.block`'s `alignItems: "center"` is what positions it — the same rule that
          positions the character above it, which is the only way the two share an axis when a phase
          change resizes the words.

          Worked through under node rather than eyeballed (Deno is not installed here, so the phone's
          own `.test.ts` files cannot be run; this was plain arithmetic on the same numbers the
          styles use). The dots pushed the caption a constant 21.375pt to the RIGHT of the
          character's axis — half of the trio's 31.5pt plus the 11.25pt gap — at every caption width
          sampled; it now sits at 0.0. On a wrapped caption, a 96pt second line under a 168pt first
          sat 36pt left of the box's centre with the old alignment and sits at 0.0 with this one.

          🔴 A PHASE CHANGE STILL MOVES THE CAPTION'S EDGES, AND THAT IS NOW HARMLESS RATHER THAN
          MERELY ACCEPTED. "Working out how to answer" → "Reading 3 sources" is a width change; when
          the dots were the left anchor it slid the whole group sideways, and the note that stood
          here weighed left-anchoring the row (dots parked at the far edge of the screen) against
          stacking the dots above the caption (loses the reference's arrangement) and accepted the
          slide. Centred text with nothing anchored to it grows and shrinks about its own middle,
          underneath the caption's own 220ms fade-in. */}
      {label ? (
        // 🔴 THIS IS `CanvasFadeIn`'s 220ms (`FADE_IN_MS`), NOT 260, AND THE COMMENT THAT USED TO
        // SIT HERE SAID 260 — the web's `.canvas-phrase`, which `canvas-metrics.ts` records as
        // `PHRASE_MS` and which nothing on the phone has ever played. Corrected rather than
        // implemented: a caption arriving on its own private timing would be the surface's second
        // fade, and `CanvasFade.tsx`'s whole argument is that there is exactly one. The reason
        // web made its phrase slower than its 140ms content swap still holds and this is on the
        // same side of it — a fast flicker between phase captions reads as churn.
        //
        // Keyed on the label so the fade replays when the phase genuinely changes, and only then.
        <CanvasFadeIn blockKey={label} style={styles.captionBox}>
          {/* 🔴 THE WORDS CARRY A LEFT-TO-RIGHT SWEEP, AND IT SURVIVED THE REMOVAL OF THE DOTS
              (owner 2026-08-21, two instructions on the same day and only the second one touched
              this). First the owner sent the screen back with a red circle around THIS CAPTION —
              the dots explicitly outside it — and one line: "this should be pulsing from left to
              right", so the sweep was built for the text. Then: "also remove the three dots
              animation, i only want the mascot and the thinking words". The dots went; the thing
              that was actually circled stays exactly as it was.

              It is `.canvas-rewriting` from the web, ported: the same 1900ms linear band over the
              same gradient, and the words legible for every frame of it. `CanvasSweepText.tsx`
              holds the whole argument, including why the mask is the text rather than the
              gradient. Two things it is NOT, because both were on the table:
                - it is not an opacity throb on this element. Web threw that out in the same
                  breath ("a whole-element opacity throb says WAIT"), and it is what the phone
                  would get from the two-line version of this change.
                - it is not a change to what the caption SAYS. `label` still comes from
                  `phaseLabel(phase)`, still names a step that is really running, and still
                  renders nothing at all when that returns "". Nothing here is on a clock. */}
          <CanvasSweepText
            style={styles.caption}
            testID="canvas-thinking-caption"
            text={normaliseEllipsis(label)}
          />
        </CanvasFadeIn>
      ) : null}
    </View>
  );
}

/** The ambient line: a 6pt pulsing dot and a 14pt phrase, shown beside content already on screen. */
export function CanvasThinkingLine({ label }: { label: string }) {
  const styles = useThemedStyles(createStyles);
  if (!label) return null;
  return (
    // `accessible` for the reason the preview above gives at length: the phrase below is the same
    // words as this element's own accessible name, and ungrouped it is read a second time.
    <View style={styles.line} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {/* 🔴 THIS DOT IS THE LAST ONE ON THE SURFACE AND IT IS DELIBERATELY STILL HERE
          (2026-08-21). The owner's "remove the three dots animation" was about the full-screen
          wait above, where three dots sat under the character; it did not name this row, which is
          a different object doing a different job — a single 6pt mark beside an answer the learner
          is already reading. Removing this one too would be tidying past the instruction and would
          leave an ambient wait with no indicator at all. `PulseDot` below is now written for this
          one caller only; it used to be shared with the trio, and before that this row owned a
          private copy of the same pulse. */}
      <PulseDot />
      {/* 🔴 NO SWEEP ON THIS ONE, DELIBERATELY, AND IT IS A PLAIN `Text` SO THAT STAYS OBVIOUS
          (2026-08-21). `CanvasSweepText` is a component precisely because a second caller could
          want it, and this is the caller that does not: the header above commits this row to being
          "deliberately the least interesting thing on the surface", because unlike the preview it
          always sits BESIDE an answer the learner is already reading. A band travelling through a
          phrase next to live prose competes with the prose — the same argument that keeps the
          character out of this row. The owner circled the FULL-SCREEN caption, which owns an empty
          screen and has nothing to compete with. Recommendation to the owner in those words: leave
          this one still; if it ever should sweep too, it is a one-line change here and the timings
          already match by construction. */}
      <CanvasFadeIn blockKey={label} style={styles.lineText}>
        <Text style={styles.phrase} numberOfLines={2} testID="canvas-phase">
          {normaliseEllipsis(label)}
        </Text>
      </CanvasFadeIn>
    </View>
  );
}

/**
 * One pulsing dot: Tailwind's `animate-pulse`, matched — 2s, 1 → .5 → 1, cubic-bezier(0.4,0,0.6,1).
 *
 * 🔴 IT TAKES NO DELAY ANY MORE, AND THE PROP WAS REMOVED RATHER THAN LEFT AS A CONVENIENCE
 * (2026-08-21). It had exactly one purpose: offsetting each dot of the full-screen trio by
 * `PULSE_STAGGER_MS` so the three read as a wave travelling left to right. The owner removed that
 * trio ("also remove the three dots animation, i only want the mascot and the thinking words"), so
 * the only surviving caller is `CanvasThinkingLine`, which is a SINGLE dot and always passed 0.
 * An optional parameter no call site can reach is dead code that reads as a live feature.
 *   The arithmetic is not lost, because reinstating a staggered row is a plausible future request
 *   and it was measured, not guessed: `withDelay` had to WRAP the infinite `withRepeat`, not sit
 *   inside it. Wrapped, the offset is paid once on mount and each dot then runs the same unbroken
 *   2s cycle permanently that far behind its neighbour; inside the repeat it would insert 140ms of
 *   stillness into every cycle, which turns a wave into a limp. During the initial delay the dot
 *   held at its starting 1 — at most 280ms on the trailing dot, at full contrast, which is where a
 *   dot should start anyway. `PULSE_STAGGER_MS` itself is deleted; its measurements survive in
 *   `PULSE_MS`'s note in `canvas-metrics.ts`, which is where the whole removal is recorded — 140ms
 *   as the web's own number, and 0.224 of opacity as the widest gap the three dots ever showed.
 *
 * 🔴 STARTED FROM AN EFFECT, NEVER FROM THE RENDER BODY. Assigning to a shared value while React
 * is rendering schedules a UI-thread write from the middle of a reconciliation. An effect runs
 * after commit, which is the only safe moment.
 *
 * (This note used to cite `app/note.tsx` as carrying the scar of the same mistake. It does not —
 * its one shared value is written from effects and handlers, like this. The rule is unchanged and
 * the citation is dropped rather than repeated: the in-repo scar of the same SHAPE, work done in a
 * render body sixty times a second, is `components/GraphNodeView.tsx:162` and `lib/note-graph.ts`,
 * where gesture objects rebuilt in the render body were measured against a 200-note graph.)
 *
 * 🔴 UNDER REDUCED MOTION THE DOT STAYS AND HOLDS AT `PULSE_REST` — the web's rule is that the
 * sweep stops and the resting appearance remains, so the region still reads as busy. No timing is
 * started at all in that branch, so there is nothing left running on the UI thread either.
 */
function PulseDot() {
  const styles = useThemedStyles(createStyles);
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    if (reduced) {
      pulse.value = PULSE_REST;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: PULSE_MS / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(1, { duration: PULSE_MS / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
      false,
    );
  }, [reduced, pulse]);

  return <Animated.View style={[styles.dot, animated]} />;
}

/**
 * Exactly one trailing ellipsis, never two and never none — the web's
 * `label.replace(/…$/, "") + "…"`.
 *
 * `phaseLabel` writes some phrases with one and some without ("Reading 3 sources" has none,
 * "Searching the web for “…”" ends in the learner's own trimmed question), and a caption that
 * sometimes trails off and sometimes stops dead reads as two different components.
 */
function normaliseEllipsis(label: string): string {
  return `${label.replace(/…$/, "")}…`;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // gap-6 / px-6 at 1rem = 18px → 27pt each. Not rounded to the 4pt grid: this is the block that
    // has to look like the desktop's, and the character is 128pt wide inside it. The gap is
    // untouched by the dots leaving — it was always the distance from the character down to
    // whatever came next, and what comes next is now the caption.
    // `alignItems: "center"` is doing more work than it was: with the dot row gone it is the only
    // thing putting the caption on the character's axis. See the note at the caption itself.
    block: { alignItems: "center", justifyContent: "center", gap: 27, paddingHorizontal: 27 },
    // Content-width and centred by the block above. `maxWidth` is the bound that makes a long
    // honest caption ("No sources came back — answering from what I know") wrap inside the column
    // instead of running under the screen edge; it replaces the `flexShrink: 1` that did that job
    // while this box was an item in a horizontal row, and which means nothing in a column.
    captionBox: { alignItems: "center", maxWidth: "100%" },
    // 12pt `--canvas-text-meta`. A deliberate exemption from `theme/tokens.ts`'s scale, at the
    // size the desktop caption is drawn — see `canvas-metrics.ts`. Centred: it is the only thing
    // under a centred 128pt character, so a wrapped second line has to balance under the first.
    // (It was left-aligned while the dots anchored its left edge — that is the alignment the dots
    // took with them.) Both copies inside `CanvasSweepText` get this same style, so the readable
    // text and the mask wrap and centre identically and the band still lines up with the glyphs.
    caption: { fontSize: CANVAS_TEXT.meta, lineHeight: 17, color: c.text3, textAlign: "center" },
    line: { flexDirection: "row", alignItems: "center", gap: PULSE_GAP, paddingVertical: space(1) },
    dot: { width: PULSE_DOT, height: PULSE_DOT, borderRadius: radius.pill, backgroundColor: c.text3 },
    lineText: { flexShrink: 1 },
    // 14pt `--canvas-text-small`, likewise exempt and likewise for parity with the desktop.
    phrase: { fontSize: CANVAS_TEXT.small, lineHeight: 20, color: c.text3 },
  });
