// The Canvas's one crossfade — a port of `apps/web/lib/learn/canvas-crossfade.ts` and
// `apps/web/components/workspace/learn/canvas-fade.tsx`, timings and all.
//
// The owner asked for "fade in for text and fade outs". There is exactly ONE fade in this surface
// and everything goes through it, which is the whole point of the web module it comes from:
//
// 🔴 OPACITY ONLY. Nothing slides, scales, or bounces. 160ms out, then 220ms in — SEQUENTIAL, so a
// swap costs 380ms and the two screens are never on top of each other.
//
// 🔴 NO TRANSITION AT REST. When nothing is changing the animated value carries no timing at all;
// without that rule every canvas would dissolve into view on its first paint, which reads as the
// page loading rather than as the page changing.
//
// 🔴 THE OUTGOING SUBTREE IS HELD IN A REF, AND THIS IS THE ENTIRE REASON THE MODULE EXISTS.
// By the time the key changes, the caller's `children` are ALREADY the new content — React has no
// "about to unmount" hook a fade can hang off. So the previous subtree is held and painted for the
// 160ms of the fade-out, and only then replaced. Reanimated's `exiting` layout animations do this
// for you, but only for a node that actually unmounts; here the node stays and its contents swap.
//
// 🔴 AND THE KEY DELIBERATELY EXCLUDES BUSY, STREAMING AND THE CLOCK. `learning-canvas.tsx:828`
// builds its key from presence + screen + aside and nothing else. Keying on "is a request in
// flight" would fade the whole page out and back in the instant the learner pressed send — the
// exact flicker this component was written to remove — and keying on the streamed text would do it
// on every token. The caller owns that discipline; see `learn.tsx`'s `surfaceKey`.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { FADE_IN_MS, FADE_OUT_MS } from "./canvas-metrics";
import { useReducedMotion } from "./useReducedMotion";

// 🔴 `ease-out` ON BOTH HALVES, and Reanimated's defaults are not it: `withTiming` defaults to
// `Easing.inOut(Easing.quad)` at 300ms, and `FadeIn`/`FadeOut` default to 300ms too. Accepting
// either default makes the phone's swap visibly slower and softer than the desktop's.
const EASE = Easing.out(Easing.ease);

interface CanvasFadeProps {
  /** Changing this fades the current subtree out and the new one in. Same value = no transition. */
  contentKey: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CanvasFade({ contentKey, children, style, testID }: CanvasFadeProps) {
  const reduced = useReducedMotion();
  // The key currently PAINTED, which lags `contentKey` for the 160ms of the fade-out.
  const [shownKey, setShownKey] = useState(contentKey);
  const opacity = useSharedValue(1);

  // The held subtree. Written during render, deliberately: it must capture the OUTGOING children
  // before the effect below ever runs, and an effect would already be one render too late.
  const held = useRef<ReactNode>(children);
  const settled = contentKey === shownKey;
  if (settled) held.current = children;

  // `contentKey` as the fade-out completion sees it — the timing callback fires 160ms later and
  // must land on wherever the surface has got to by then, not on the value it started with.
  const targetKey = useRef(contentKey);
  targetKey.current = contentKey;

  const commit = useCallback(() => {
    setShownKey(targetKey.current);
    opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: EASE });
  }, [opacity]);

  useEffect(() => {
    if (settled) return;
    if (reduced) {
      // The swap still happens — instantly. See `useReducedMotion`: the sweep stops, the content
      // does not.
      opacity.value = 1;
      commit();
      return;
    }
    opacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: EASE }, (finished) => {
      "worklet";
      // An unfinished timing means another change interrupted this one; that change's own effect
      // owns the commit, and committing twice would snap the outgoing subtree back to full opacity.
      if (finished) runOnJS(commit)();
    });
  }, [settled, reduced, commit, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.fill, style, animated]} testID={testID}>
      {held.current}
    </Animated.View>
  );
}

interface CanvasFadeInProps {
  /**
   * The identity of the BLOCK, not of its contents.
   *
   * 🔴 THIS IS THE RULE THE STREAM BREAKS IF YOU GET IT WRONG. An answer arrives one delta at a
   * time; passing anything derived from the text — its length, a hash, the text itself — replays
   * the 220ms fade on every token and the paragraph strobes. Pass the turn's own id and the block
   * fades in once, then grows in place in silence.
   */
  blockKey: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A block that arrives: 220ms opacity, once, on the way in. Used for the answer and for anything
 *  else that appears beside content already on screen rather than replacing it. */
export function CanvasFadeIn({ blockKey, children, style, testID }: CanvasFadeInProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: EASE });
    // 🔴 `blockKey` AND NOT `children`. See the prop's doc.
  }, [blockKey, reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
