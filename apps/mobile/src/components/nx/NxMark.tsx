/**
 * The Nemesis three-dot mark with the canvas `.logo` motion: each dot pops in (dotin 560ms, 0/130/260ms
 * delays) and then waves forever (dotwave 2800ms ease-in-out, starting at 1000/1180/1360ms: rise 1.8
 * units, grow 8% and dim to .72 at 25%, rest again by 55%). Reduced motion draws it still.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { nxEasing } from './motion';

const inOut = Easing.inOut(Easing.ease);

const DOTS = [
  { cx: 8, cy: 9, delayIn: 0, delayWave: 1000 },
  { cx: 20, cy: 9, delayIn: 130, delayWave: 1180 },
  { cx: 14, cy: 20, delayIn: 260, delayWave: 1360 },
];

function Dot({ size, color, cx, cy, delayIn, delayWave, reduce }: { size: number; color: string; cx: number; cy: number; delayIn: number; delayWave: number; reduce: boolean }) {
  const unit = size / 28;
  const pop = useSharedValue(reduce ? 1 : 0);
  const wave = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      pop.value = 1;
      wave.value = 0;
      return;
    }
    pop.value = withDelay(delayIn, withTiming(1, { duration: 560, easing: nxEasing }));
    // 0% rest, 25% peak (700ms), 55% rest (840ms), hold to 100% (1260ms).
    wave.value = withDelay(
      delayWave,
      withRepeat(withSequence(withTiming(1, { duration: 700, easing: inOut }), withTiming(0, { duration: 840, easing: inOut }), withTiming(0, { duration: 1260 })), -1, false),
    );
  }, [reduce, pop, wave, delayIn, delayWave]);

  const style = useAnimatedStyle(() => ({
    opacity: pop.value * (1 - 0.28 * wave.value),
    transform: [{ translateY: -1.8 * unit * wave.value }, { scale: pop.value * (1 + 0.08 * wave.value) }],
  }));
  const d = 8 * unit;
  return <Animated.View style={[{ position: 'absolute', left: (cx - 4) * unit, top: (cy - 4) * unit, width: d, height: d, borderRadius: d / 2, backgroundColor: color }, style]} />;
}

export function NxMark({ size, color }: { size: number; color: string }) {
  const reduce = useReducedMotion();
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Nemesis">
      {DOTS.map((dot) => (
        <Dot key={dot.cx} size={size} color={color} reduce={reduce} {...dot} />
      ))}
    </View>
  );
}
