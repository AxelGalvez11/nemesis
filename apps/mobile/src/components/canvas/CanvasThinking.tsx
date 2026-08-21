// The two thinking previews. They are different objects and the owner asked for BOTH — "the
// thinking previews should match the webapp and have the mascot too and the thinking preview
// line" — so this file carries the pair and names the difference, because shipping one of them
// and calling it done is the easy mistake.
//
// 1. `CanvasThinkingPreview` — the learner has just sent something and there is nothing to read
//    yet. The character comes to the middle of the surface at 128pt in its `thinking` state, with
//    one 12pt caption under it.
//    🔴 IT REPLACES WHAT WAS ON SCREEN; IT DOES NOT SIT UNDER IT (owner call, both halves,
//    2026-08-20). Rendering it as a small inline indicator above the answer looks like a
//    reasonable simplification and is the wrong one — the point of coming to the middle is that
//    the system has the floor.
//
// 2. `CanvasThinkingLine` — work is happening BESIDE content that is already on screen. A 6pt dot
//    and a 14pt phrase, and nothing else.
//    🔴 DELIBERATELY THE LEAST INTERESTING THING ON THE SURFACE. No ring, no sweep, no orbit, no
//    character. It is ambient; a second animated mascot beside an answer competes with the answer.
//
// 🔴 THE CAPTION NAMES A STEP THAT IS ACTUALLY RUNNING, OR THERE IS NO CAPTION. Both take their
// text from `lib/thinking-phase.ts`, whose own header explains at length why: every phrase there
// maps to a real pipeline stage (the route decision, a real search with its real query, the real
// number of sources that came back). A plausible timed walk through "Reading → Mapping →
// Preparing" would look better and would be undetectable narration about work nobody is doing.
// `phaseLabel` returning "" is a real answer and means show nothing.

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

import { speedOf, stateFor } from "@nemesis/shared/character/stations";
import { BloubBot } from "@/components/bloub/BloubBot";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

import { CANVAS_TEXT, PULSE_DOT, PULSE_GAP, PULSE_MS, THINKING_BLOCK_VH, THINKING_MASCOT } from "./canvas-metrics";
import { CanvasFadeIn } from "./CanvasFade";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The full-surface wait: character in the middle, one caption under it.
 *
 * `label` is `phaseLabel(phase)` — or null before the first phase arrives, which is a real state
 * lasting a few hundred milliseconds and is drawn as the character alone rather than as a guess.
 */
export function CanvasThinkingPreview({ label, paper }: { label: string | null; paper?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // 🔴 A MEASURED FRACTION OF THE WINDOW, NOT `"70%"` AND NOT `flex: 1`. The web file records the
  // bug this replaces: the block renders inside the crossfade wrapper, which has no height of its
  // own, so a percentage collapsed and the character ended up pinned to the top of the column.
  const minHeight = Dimensions.get("window").height * THINKING_BLOCK_VH;
  // 🔴 DERIVED THROUGH `stateFor`, NEVER A LITERAL `"thinking"`. `@nemesis/shared/character/
  // stations.ts` is by its own header the ONE Nemesis opinion about the character, and it is
  // shared precisely so a wait cannot look like one thing on a laptop and another on a phone.
  const state = stateFor("thinking");
  return (
    <View style={[styles.block, { minHeight }]} accessibilityRole="progressbar" accessibilityLabel={label ?? "Thinking"}>
      {/* `paper` is load-bearing, not cosmetic: the eyes are holes cut in the body and the rings
          pass behind it, so the backing must be EXACTLY the colour of the surface underneath or an
          orbit ring reappears inside the eyes. The caller passes the surface it is actually on. */}
      <BloubBot state={state} size={THINKING_MASCOT} paper={paper ?? c.bg} speed={speedOf(state)} />
      {label ? (
        // 260ms, the web's `.canvas-phrase` — slower than the 140ms content swap on purpose,
        // because a fast flicker between phase captions reads as churn. Keyed on the label so the
        // fade replays when the phase genuinely changes, and only then.
        <CanvasFadeIn blockKey={label}>
          <Text style={styles.caption} testID="canvas-thinking-caption">
            {normaliseEllipsis(label)}
          </Text>
        </CanvasFadeIn>
      ) : null}
    </View>
  );
}

/** The ambient line: a 6pt pulsing dot and a 14pt phrase, shown beside content already on screen. */
export function CanvasThinkingLine({ label }: { label: string }) {
  const styles = useThemedStyles(createStyles);
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Tailwind's `animate-pulse`, matched: 2s, 1 → .5 → 1, cubic-bezier(0.4, 0, 0.6, 1).
  //
  // 🔴 STARTED FROM AN EFFECT, NEVER FROM THE RENDER BODY. Assigning to a shared value while
  // React is rendering schedules a UI-thread write from the middle of a reconciliation; `note.tsx`
  // carries the scar from the same class of mistake. An effect runs after commit, which is the
  // only safe moment.
  //
  // 🔴 UNDER REDUCED MOTION THE DOT STAYS AND HOLDS AT 0.6 — the web's rule is that the sweep
  // stops and the resting appearance remains, so the region still reads as busy.
  useEffect(() => {
    if (reduced) {
      pulse.value = 0.6;
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

  if (!label) return null;
  return (
    <View style={styles.line} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Animated.View style={[styles.dot, animated]} />
      <CanvasFadeIn blockKey={label} style={styles.lineText}>
        <Text style={styles.phrase} numberOfLines={2} testID="canvas-phase">
          {normaliseEllipsis(label)}
        </Text>
      </CanvasFadeIn>
    </View>
  );
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
    // has to look like the desktop's, and the character is 128pt wide inside it.
    block: { alignItems: "center", justifyContent: "center", gap: 27, paddingHorizontal: 27 },
    // 12pt `--canvas-text-meta`. A deliberate exemption from `theme/tokens.ts`'s scale, at the
    // size the desktop caption is drawn — see `canvas-metrics.ts`.
    caption: { fontSize: CANVAS_TEXT.meta, lineHeight: 17, color: c.text3, textAlign: "center" },
    line: { flexDirection: "row", alignItems: "center", gap: PULSE_GAP, paddingVertical: space(1) },
    dot: { width: PULSE_DOT, height: PULSE_DOT, borderRadius: radius.pill, backgroundColor: c.text3 },
    lineText: { flexShrink: 1 },
    // 14pt `--canvas-text-small`, likewise exempt and likewise for parity with the desktop.
    phrase: { fontSize: CANVAS_TEXT.small, lineHeight: 20, color: c.text3 },
  });
