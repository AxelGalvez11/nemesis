/**
 * Shared motion for the 2026-09 iPhone design: the canvas ease (cubic-bezier(.32,.72,0,1)), the three
 * durations, fire-and-forget haptics, and presence (mount, animate in, animate out, unmount) for modals so
 * menus and sheets leave the way they came instead of vanishing.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { nxDuration, nxEase, useNx } from '@/theme/nx';

export const nxEasing = Easing.bezier(nxEase[0], nxEase[1], nxEase[2], nxEase[3]);

export type NxHaptic = 'selection' | 'light' | 'medium' | 'success' | 'error';

/** A haptic is decoration: never awaited, never allowed to throw into the caller. */
export function nxHaptic(kind: NxHaptic): void {
  try {
    const run =
      kind === 'selection'
        ? Haptics.selectionAsync()
        : kind === 'light'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          : kind === 'medium'
            ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            : Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    void run.catch(() => {});
  } catch {
    // No Taptic engine or the module is missing: silence is right.
  }
}

/**
 * Keeps a modal mounted while it animates out. `p` runs 0 to 1 on open and back to 0 on close; the modal
 * unmounts once the close finishes. With reduced motion it snaps.
 */
export function useNxPresence(visible: boolean, inMs: number = nxDuration.base, outMs: number = nxDuration.fast): { mounted: boolean; p: SharedValue<number> } {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      p.value = reduce ? 1 : withTiming(1, { duration: inMs, easing: nxEasing });
      return;
    }
    p.value = reduce ? 0 : withTiming(0, { duration: outMs, easing: nxEasing });
    const t = setTimeout(() => setMounted(false), reduce ? 0 : outMs);
    return () => clearTimeout(t);
  }, [visible, reduce, inMs, outMs, p]);
  return { mounted, p };
}

/** The dim layer behind menus and sheets: fades with `p`, tap to close. */
export function NxDim({ p, onPress, label = 'Close' }: { p: SharedValue<number>; onPress: () => void; label?: string }) {
  const c = useNx();
  const style = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }, style]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityLabel={label} />
    </Animated.View>
  );
}

/** A menu that scales in from its anchor (`origin`, e.g. 'bottom right') and fades. */
export function useNxPopStyle(p: SharedValue<number>, rise = 6) {
  return useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.6),
    transform: [{ translateY: (1 - p.value) * rise }, { scale: 0.96 + 0.04 * p.value }],
  }));
}

/**
 * A bottom sheet in a modal: the dim fades in while the sheet slides up from below its own height (420 ms
 * in, 280 ms out). `style` is the sheet itself (background, radius, padding).
 */
export function NxSheet({
  visible,
  onClose,
  children,
  style,
  avoidKeyboard,
  closeLabel = 'Close',
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  avoidKeyboard?: boolean;
  closeLabel?: string;
}) {
  const { mounted, p } = useNxPresence(visible, nxDuration.slow, nxDuration.base);
  // A sheet belongs to its screen. A modal outlives navigation, so when another screen covers this one
  // (a push, a link), close it instead of leaving it floating over the new screen.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openRef = useRef(visible);
  openRef.current = visible;
  useFocusEffect(
    useCallback(
      () => () => {
        if (openRef.current) closeRef.current();
      },
      [],
    ),
  );
  const h = useSharedValue(800);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * h.value }] }));
  const sheet = (
    <Animated.View
      onLayout={(e) => {
        h.value = e.nativeEvent.layout.height + 40;
      }}
      style={[style, slide]}
    >
      {children}
    </Animated.View>
  );
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
        <NxDim p={p} onPress={onClose} label={closeLabel} />
        {avoidKeyboard ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.end} pointerEvents="box-none">
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.end} pointerEvents="box-none">
            {sheet}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ end: { flex: 1, justifyContent: 'flex-end' } });
