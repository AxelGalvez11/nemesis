import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

// The chat's "thinking" indicator — three dots that pulse and gently bounce in a
// staggered loop (owner: make the thinking animation polished). Runs on the UI
// thread via reanimated shared values, so it stays smooth while a reply streams.

const DOT = 6;
const PERIOD = 480;

function Dot({ delay, color }: { delay: number; color: string }) {
  const t = useSharedValue(0.3);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: PERIOD / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: PERIOD / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (0.65 - t.value) * 5 }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function ThinkingDots({ color }: { color: string }) {
  return (
    <View style={styles.row} accessibilityLabel="Thinking">
      <Dot delay={0} color={color} />
      <Dot delay={PERIOD / 4} color={color} />
      <Dot delay={PERIOD / 2} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, height: DOT + 5 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
