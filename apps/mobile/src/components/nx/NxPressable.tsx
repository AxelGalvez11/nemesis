/**
 * A Pressable that gives way under the finger: it eases to `scaleTo` (0.97 by default) on press-in and back
 * on release, on the canvas ease, with an optional haptic on press. With reduced motion it does not scale;
 * pass a style function to dim instead. Same props as Pressable otherwise.
 */
import React, { useState } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { nxDuration } from '@/theme/nx';
import { nxEasing, nxHaptic, type NxHaptic } from './motion';

const APressable = Animated.createAnimatedComponent(Pressable);

export type NxPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleTo?: number;
  haptic?: NxHaptic;
};

export function NxPressable({ style, scaleTo = 0.97, haptic, onPressIn, onPressOut, onPress, ...rest }: NxPressableProps) {
  const reduce = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        if (!reduce) s.value = withTiming(scaleTo, { duration: 90, easing: nxEasing });
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        s.value = reduce ? 1 : withTiming(1, { duration: nxDuration.fast, easing: nxEasing });
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) nxHaptic(haptic);
        onPress?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, a]}
    />
  );
}
