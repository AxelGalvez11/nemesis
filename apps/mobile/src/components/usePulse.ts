import { useEffect, useRef } from "react";
import { Animated } from "react-native";

/**
 * The slow opacity breathe that means "this is working, keep waiting".
 *
 * Lifted out of DeliverableSheet so the photo-analysing row breathes at exactly
 * the same rate as the recording card. Two different pulses on one screen read
 * as two different kinds of waiting, which is a distinction the app does not
 * actually make.
 *
 * Built on RN's own Animated, the same zero-dep posture as Skeleton.tsx —
 * reanimated stays reserved for gestures.
 *
 * The floor is 0.5 rather than Skeleton's 0.35 because these carry words the
 * student is meant to READ while they pulse; a skeleton has no text to lose.
 * Legs are 900ms, slower than a loading shimmer, because this stands for a job
 * measured in seconds rather than a page about to appear.
 */
export function usePulse(active: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      // Settle at full strength — a row that finished mid-fade would keep
      // whatever partial opacity the loop happened to stop on.
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [active, opacity]);
  return opacity;
}
