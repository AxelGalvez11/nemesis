/**
 * The "thinking" shimmer from the canvas (.shimmer): a soft band passes left to right and the letters
 * under it FADE (never darken). Canvas: mask 260% wide, dip to .08 between 36% and 64%, 1800ms linear.
 * In element widths that is a triangle 0.73 wide whose centre travels from -0.3 to 1.3.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const HALF = 0.365;
const FLOOR = 0.08;

function Letter({ ch, at, t, style }: { ch: string; at: number; t: SharedValue<number>; style: TextStyle }) {
  const a = useAnimatedStyle(() => {
    const centre = -0.3 + 1.6 * t.value;
    const k = Math.max(0, 1 - Math.abs(at - centre) / HALF);
    return { opacity: 1 - (1 - FLOOR) * k };
  });
  return <Animated.Text style={[style, a]}>{ch}</Animated.Text>;
}

export function ShimmerText({ text, style, live = true }: { text: string; style: TextStyle; live?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!live) return;
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [live, t]);
  if (!live) return <Text style={style}>{text}</Text>;
  const chars = Array.from(text);
  const n = Math.max(1, chars.length - 1);
  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      {chars.map((ch, i) => (
        <Letter key={`${i}-${ch}`} ch={ch} at={i / n} t={t} style={style} />
      ))}
    </View>
  );
}

/** The canvas spinner: an open 3/4 arc, 800ms per turn. */
export function Spinner({ color, size = 18 }: { color: string; size?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [r]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, a]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
        <Path d="M12 3a9 9 0 1 0 9 9" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'nowrap' } });
