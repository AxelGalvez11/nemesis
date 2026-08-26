// A run of text with a highlight travelling through it, left to right — the phone's build of
// `.canvas-rewriting` (`apps/web/app/globals.css:930-944`).
//
// Owner 2026-08-21, on a screenshot of the phone's thinking screen (the character, a row of three
// dots, the caption "Putting this together…") with a red circle around THE CAPTION TEXT and
// nothing else: "this should be pulsing from left to right". The dots were outside the circle and
// were left alone at the time. Later the same day the owner removed them from that screen
// altogether ("also remove the three dots animation, i only want the mascot and the thinking
// words"), so the screenshot above no longer describes what is drawn: the waiting screen is now
// the character and this caption, and this sweep is the only motion under it. That does not change
// anything below — the instruction this file exists to satisfy was always about the words — but a
// reader comparing the code to that screenshot needs to know which half of it is still current.
// `PulseDot` in `CanvasThinking.tsx` survives for the ambient one-dot line beside an answer, which
// was never in scope; `PULSE_MS` in `canvas-metrics.ts` carries the full record.
//
// 🔴 IT IS A BAND TRAVELLING THROUGH THE WORDS, NOT THE WORDS BLINKING. The web comment this is
// ported from makes the distinction and it is the whole point: "a whole-element opacity throb says
// WAIT; §20 asks for information forming from left to right". Every part of the caption is at a
// different brightness at any given instant, and which part is brightest is what moves. An
// `Animated.Text` with one animated `opacity`, which is a two-line change and looks superficially
// similar, is exactly the thing web threw out.
//
// 🔴 THE WORDS NEVER LEAVE READING CONTRAST. `.canvas-rewriting` deliberately has no
// `background-color`, unlike `.canvas-forming` beside it, "because the text is right there and the
// learner is reading it … the words stay legible and the band travels behind them". Here the band
// is shaped to the glyphs rather than painted behind them, so the same rule is enforced
// arithmetically instead: the resting copy of the text is always painted, at `SWEEP_TROUGH`, and
// the band only ever ADDS back towards the text's own colour. Composite coverage is
// `SWEEP_TROUGH + (1 - SWEEP_TROUGH) × band`, i.e. 0.55 at the darkest and exactly the resting
// colour at the peak — never brighter, never a different hue, and never faded towards the page.
// Measured under node (`Math.abs` of the sRGB contrast at the trough): 6.27:1 on the black page
// and 4.76:1 on the white one, both above the 4.5:1 floor for body text.
//
// 🔴 THE MASK IS THE TEXT AND THE SWEEP IS THE CONTENT — THE OTHER WAY ROUND IS A BROKEN CAPTION ON
// THE WEB BUILD, and this is the one decision here that cannot be read off the CSS.
// `@react-native-masked-view/masked-view` has a web implementation and it is four lines long:
//
//     function MaskedView({ maskElement, ...props }) {
//       return React.createElement(View, props, maskElement);   // MaskedView.web.js
//     }
//
// It renders the MASK and DROPS the children. So on `expo start --web` (and under the Playwright
// e2e suite, which drives that build) whatever is passed as `maskElement` is what the learner
// sees. Passing the gradient as the mask — the arrangement `BottomFadeBlur.tsx` uses, and the
// obvious one to copy — would put a solid gradient bar over the caption on web. Passing the TEXT
// as the mask degrades to a second, full-colour copy of the caption sitting exactly on top of the
// resting one: the words, static, perfectly legible, no sweep. That is the only difference between
// the two arrangements on native, and the entire difference on web.
//
// 🔴 AND THAT IS THE ANSWER TO `components/ThinkingLine.tsx`, WHICH REJECTED MaskedView FOR TEXT —
// it is not being ignored. That file's `SweepChar` builds the chat's sweep out of one
// `Animated.Text` per character precisely because "a mask that doesn't composite takes the text
// with it, and this row is the only thing on screen while the model works … prefer the failure you
// can read". The objection is correct and it is sharper here, because this caption sits on a
// screen with nothing else written on it. It is answered rather than overruled: the readable text
// is painted OUTSIDE the mask, by an ordinary `<Text>` that is always mounted and always visible,
// so no mask failure in any direction can take it away. The per-character build was the other
// candidate and is rejected for this surface for two reasons — it has no width in it at all, so it
// cannot reproduce a gradient defined in multiples of the element's width, and it sweeps in
// READING order, which on the two-line caption below would run the band through line one, jump
// back to the left edge and continue through line two. The web's band does not do that (see the
// two-line note on the layer geometry below). The chat's row is single-line (`numberOfLines={1}`),
// so that difference never shows up there and its build stays right where it is.

import { useEffect, useId, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { SWEEP_MS, SWEEP_TILE, SWEEP_TILES, SWEEP_TRAVEL, SWEEP_TROUGH } from "./canvas-metrics";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The gradient's stops, as one tile repeated `SWEEP_TILES` times: transparent at the tile edge,
 * opaque at its middle, transparent again — the web's `transparent 0% / highlight 50% /
 * transparent 100%`, laid end to end the way `background-repeat: repeat` lays it.
 *
 * Alternating 0/1 across `2 × SWEEP_TILES` steps is what makes the ends meet: the first and last
 * stop are both 0, so the layer can be translated by any whole number of tiles and paint the
 * identical image. That is the loop point, and it is why there is no visible jump — see
 * `SWEEP_TRAVEL`'s note in `canvas-metrics.ts` for the arithmetic (4W of travel over a 2W tile is
 * exactly two tiles).
 */
const STOPS = Array.from({ length: SWEEP_TILES * 2 + 1 }, (_, i) => ({
  offset: i / (SWEEP_TILES * 2),
  opacity: i % 2,
}));

interface CanvasSweepTextProps {
  /** The words themselves. Already normalised by the caller — this component never edits text. */
  text: string;
  /** The resting style, colour included. Used for BOTH copies, so they wrap identically. */
  style?: StyleProp<TextStyle>;
  /** Passed to both copies for the same reason. */
  numberOfLines?: number;
  /** Lands on the readable copy — the one a test or a screen reader would look for. */
  testID?: string;
}

export function CanvasSweepText({ text, style, numberOfLines, testID }: CanvasSweepTextProps) {
  const reduced = useReducedMotion();
  // 🔴 MEASURED, NEVER ASSUMED. The whole gradient is defined in multiples of the text's own width
  // — that is what `background-size: 200%` means — so there is no width to hard-code and a guess
  // would make the sweep run at a different speed for every phrase. `onLayout` reports the box the
  // text actually took, which on a narrow phone is the wrapped two-line box.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const shift = useSharedValue(0);

  const width = box?.w ?? 0;
  const height = box?.h ?? 0;
  const travel = width * SWEEP_TRAVEL;
  const layer = width * SWEEP_TILE * SWEEP_TILES;

  // 🔴 THE BAND IS THE TEXT'S OWN COLOUR, READ OFF THE CALLER'S OWN STYLE — NOT WHITE, AND NOT A
  // SECOND PROP. `BottomFadeBlur.tsx`'s gradient is white because it is a MASK, where only the
  // alpha matters. This gradient is CONTENT: whatever colour it is drawn in is the colour the
  // glyphs turn as the band passes. White would be right on the black page and would erase the
  // caption on the white one, where `c.text3` is `#000000`. Flattening the style the words are
  // already painted with is what makes drift impossible — a second `color` prop would be a
  // second source of truth for one colour. A style with no literal colour string in it (a
  // platform colour object, or none at all) simply does not sweep: plain legible text is the
  // right failure, and it is the same rule as everything else in this file.
  const tint = StyleSheet.flatten(style)?.color;
  const sweepColor = typeof tint === "string" ? tint : null;
  const sweeping = !reduced && width > 0 && height > 0 && sweepColor !== null;

  // 🔴 STARTED FROM AN EFFECT, NEVER FROM THE RENDER BODY — the same rule `PulseDot` carries in
  // `CanvasThinking.tsx`. Assigning to a shared value while React is rendering schedules a
  // UI-thread write from the middle of a reconciliation; an effect runs after commit, which is the
  // only safe moment. The in-repo scar of the same SHAPE is `components/GraphNodeView.tsx:162`.
  //
  // 🔴 AND IT RUNS ON THE UI THREAD, WHICH IS NOT A STYLE PREFERENCE ON THIS SCREEN. The caption
  // is on screen while an answer is being streamed into the surface a token at a time; a
  // JS-driven `setState` loop would be competing with that for the same thread and would stutter
  // exactly when the learner is watching. `useAnimatedStyle` + `withTiming` never touch JS after
  // the effect returns.
  useEffect(() => {
    if (!sweeping) {
      cancelAnimation(shift);
      shift.value = 0;
      return;
    }
    // 🔴 THE RESTART IS INVISIBLE BECAUSE OF THE GEOMETRY, NOT BECAUSE OF ANYTHING REANIMATED
    // PROMISES (owner 2026-08-21). An earlier draft of this comment cited
    // `reanimated/lib/module/animation/repeat.js:78` as proof that a non-reversing repeat rewinds
    // to `startValue`. That citation was WRONG — the assignment on that line sits inside a
    // `reduceMotion && reverse` branch in `onStart`, which is the one path this animation never
    // takes — so it is removed rather than corrected to a different line number: the argument
    // never needed the library's internals.
    // What actually makes the seam invisible is `SWEEP_TRAVEL`: the travel is 4W and the pattern
    // repeats every 2W, so the frame at the end of a cycle is pixel-identical to the frame at its
    // start. Whether the value rewinds to −4W or holds at 0 and starts again, the picture on
    // screen is the same, which is why this does not depend on which one it does.
    shift.value = -travel;
    shift.value = withRepeat(
      withTiming(0, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      // No reverse. A band that walks back the way it came reads as a scanner, and both the owner
      // and the web keyframe ask for one direction.
      false,
    );
    // Cleanup on unmount AND on a re-measure: a phrase change ("Working out how to answer" →
    // "Reading 3 sources") is a new width, so the old timing is cancelled rather than left running
    // against numbers that no longer describe the text.
    return () => cancelAnimation(shift);
  }, [sweeping, travel, shift]);

  const band = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    // Sub-point jitter must not re-enter state: `onLayout` can fire with a hair of difference on
    // rotation or a font-scale change, and a setState per fire would restart the sweep each time.
    setBox((prev) =>
      prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h },
    );
  };

  // Unique per instance: `react-native-svg` resolves `url(#id)` against a shared registry, so two
  // captions on one surface sharing a literal id is a real collision. `useId` gives React's own
  // stable string; the non-word characters in it (`:r0:`) are stripped because they are not legal
  // in a fragment reference.
  const gradientId = `canvasSweep${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View onLayout={onLayout}>
      {/* 🔴 THE READABLE COPY, ALWAYS MOUNTED, NEVER INSIDE THE MASK. It is what a screen reader
          reads, what `testID` points at, and what stays on screen if anything about the mask goes
          wrong on any platform. `SWEEP_TROUGH` dims it only while the band is actually running —
          under Reduce Motion, and in the frame before the box has been measured, it is the plain
          caption at its own resting colour, which is the rule `useReducedMotion.ts` states: the
          sweep stops, the element does not. The trough is applied as one more entry in the style
          array rather than by wrapping this in an opacity `View`, so the node keeps its identity
          across that switch and does not re-mount (and re-measure) the moment the sweep starts. */}
      <Text
        numberOfLines={numberOfLines}
        style={[style, sweeping ? styles.trough : null]}
        testID={testID}
      >
        {text}
      </Text>
      {sweeping ? (
        // 🔴 DECORATIVE, AND SAID SO TWICE ON PURPOSE. This subtree contains a SECOND copy of the
        // caption (as the mask), so without both of these an assistive technology could reach it
        // and the block would announce its words a second time. `accessibilityElementsHidden` is
        // the iOS spelling and `importantForAccessibility` the Android/web one; neither covers the
        // other. The announcement itself is not at risk either way: the caller wraps this in a
        // `View` marked `accessible` with `accessibilityLabel={label}` — the same words — which
        // collapses the whole block to one element and is why the caption already announced
        // exactly once before this component existed (`CanvasThinkingPreview`, and the long note
        // there on "ONE ELEMENT, ONE ANNOUNCEMENT"). What this component must not do is add a
        // second node with the same words to that group, and the two props above are what stops
        // it. Note what is deliberately NOT done: the readable copy is never hidden, and never
        // rendered at `opacity: 0` to be replaced by a masked one — iOS drops fully transparent
        // views from the accessibility tree, so that arrangement would silence the caption on the
        // one screen where it is the only thing written.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <MaskedView
            maskElement={
              // The mask, and on the web build the whole of what is drawn (see the header). Same
              // string, same style, same `numberOfLines`, inside a box of the same width — so it
              // wraps to the same lines in the same places as the copy underneath.
              <Text numberOfLines={numberOfLines} style={style}>
                {text}
              </Text>
            }
            style={StyleSheet.absoluteFill}
          >
            {/* 🔴 THE LAYER IS THREE TILES WIDE AND ONLY IT MOVES. Nothing about the text is
                animated — no colour, no opacity, no layout — so nothing reflows and the caption
                keeps the exact geometry it has at rest, which is the same discipline the web
                comment records for `.canvas-forming` ("the highlight is the only thing that
                moves").

                ON TWO LINES: the band is a vertical column travelling across the whole box, so
                both lines brighten at the same horizontal position at the same moment. It is not a
                second pass for the second line and it is not reading order. That is exactly what
                the CSS does — a background image on a wrapped element covers the whole padding box
                and knows nothing about lines — and it is why the mask has to be the real wrapped
                `Text` rather than anything reconstructed per character. */}
            <Animated.View style={[styles.band, { height, width: layer }, band]}>
              <Svg height={height} width={layer}>
                <Defs>
                  <LinearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                    {STOPS.map((stop) => (
                      <Stop
                        key={stop.offset}
                        offset={String(stop.offset)}
                        stopColor={sweepColor}
                        stopOpacity={String(stop.opacity)}
                      />
                    ))}
                  </LinearGradient>
                </Defs>
                <Rect fill={`url(#${gradientId})`} height={height} width={layer} x="0" y="0" />
              </Svg>
            </Animated.View>
          </MaskedView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { left: 0, position: "absolute", top: 0 },
  /** The floor the words fall to between passes. See `SWEEP_TROUGH` for the contrast measurement. */
  trough: { opacity: SWEEP_TROUGH },
});
