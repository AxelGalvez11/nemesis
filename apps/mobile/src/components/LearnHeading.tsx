import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { CYCLE_MS, FADE_IN_MS, FADE_OUT_MS, LEARN_SUBJECTS, nextSubjectIndex } from "@/lib/learn-heading-schedule";
import { useTheme } from "@/theme/ThemeProvider";
import { type } from "@/theme/tokens";

// The front door's greeting: "Learn ‹subject›", with the subject rotating underneath.
// Web reference: apps/web/components/workspace/learn/learn-heading.tsx. The subject list and
// the timing constants live in ../lib/learn-heading-schedule.ts, copied and tuned for the phone
// (see that file's header for why the numbers differ from the web's).
//
// SEQUENTIAL, NOT A CROSSFADE — the web's own reasoning applies here too: only one word is ever
// on screen. The outgoing word fades to nothing FIRST; only once it is gone does the incoming
// word start fading in. Two words layered at partial opacity would read as a blur, not a swap.
export function LearnHeading() {
  const { colors: c } = useTheme();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // The slot's width, measured once from every subject's own natural width — see the
  // `measureHost` below. Reserved so the line never jumps as shorter/longer words rotate in.
  const [slotWidth, setSlotWidth] = useState<number | null>(null);
  const measuredWords = useRef(new Set<string>());
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => setReduceMotion(Boolean(enabled)));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // The rotation IS the motion, so reduced motion stops it here rather than merely skipping the
  // fade — same house rule the web's heading states for this exact line: the first subject, held,
  // reads as a complete sentence on its own.
  useEffect(() => {
    if (reduceMotion) return;
    let swap: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      opacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) });
      // The word changes only once it is fully gone — see the file header.
      swap = setTimeout(() => {
        setIndex((current) => nextSubjectIndex(current));
        opacity.value = withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) });
      }, FADE_OUT_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(swap);
    };
  }, [reduceMotion, opacity]);

  const onMeasure = useCallback((subject: string, width: number) => {
    if (measuredWords.current.has(subject)) return;
    measuredWords.current.add(subject);
    setSlotWidth((current) => Math.max(current ?? 0, Math.ceil(width) + 2));
  }, []);

  return (
    // 🔴 ONE STABLE LABEL FOR A SCREEN READER, same as the web: a word that swaps every few
    // seconds inside a live heading would otherwise be announced on every swap.
    <View accessibilityRole="header" accessibilityLabel="Learn anything." style={styles.row}>
      <Text style={[type.h1, styles.word, { color: c.text }]}>Learn </Text>
      <View style={{ width: slotWidth ?? undefined, minHeight: type.h1.lineHeight }}>
        <Animated.Text
          style={[type.h1, styles.word, animatedStyle, { color: c.text }]}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {LEARN_SUBJECTS[index]}
        </Animated.Text>
      </View>
      {/* Off-screen, one pass at mount: every subject's natural width, so the slot above can be
          sized to the longest without ever re-measuring mid-swap. */}
      {slotWidth === null && (
        <View style={styles.measureHost} pointerEvents="none">
          {LEARN_SUBJECTS.map((subject) => (
            <Text
              key={subject}
              style={[type.h1, styles.word]}
              onLayout={(event) => onMeasure(subject, event.nativeEvent.layout.width)}
            >
              {subject}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  word: { fontWeight: "700" },
  measureHost: { position: "absolute", opacity: 0 },
});
