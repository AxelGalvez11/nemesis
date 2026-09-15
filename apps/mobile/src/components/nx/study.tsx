/**
 * Study pieces from the canvas (gen.py: review_header, flash_card, xc, quiz_head, q_label, q_text, opt,
 * pair, mode_card, explain_chip, quiz_foot): the study header, the flashcard (front and back the same size,
 * X and check only after turning), the quiz option, the matching tile, the mode card and the footer button.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { nxEase, useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';

/** `color-mix(in srgb, <hex> a%, transparent)` from the canvas, as rgba. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The canvas `.fl` float: a faint ring plus a soft drop shadow (stronger in dark). */
export function useFloat(): ViewStyle {
  const dark = useColorScheme() === 'dark';
  const c = useNx();
  return dark
    ? { backgroundColor: c.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }
    : { backgroundColor: c.card, borderWidth: 1, borderColor: 'rgba(42,28,0,0.08)', shadowColor: '#2a1c00', shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } };
}

/** Close on the left, the set's name centred. Nothing else: no progress bar, no "4 of 12". */
export function NxStudyHeader({ title, emoji = '🗂️', onClose }: { title: string; emoji?: string; onClose: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + 3 }]}>
      <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.ib, pressed && { opacity: 0.5 }]} accessibilityLabel="Close">
        <NxIcon name="x" size={22} color={c.t1} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headTitle, { color: c.t1 }]}>
        {title ? `${emoji} ${title}` : ''}
      </Text>
    </View>
  );
}

/** One card. The front is the prompt; the back shows ONLY the answer, with Explain under it. */
export function NxFlashcard({ front, back, flipped, onFlip, onExplain }: { front: string; back: string; flipped: boolean; onFlip: () => void; onExplain?: () => void }) {
  const c = useNx();
  const float = useFloat();
  const reduce = useReducedMotion();
  const turn = useSharedValue(flipped ? 180 : 0);
  useEffect(() => {
    turn.value = withTiming(flipped ? 180 : 0, { duration: reduce ? 0 : 360, easing: Easing.bezier(...nxEase) });
  }, [flipped, reduce, turn]);
  const frontStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${turn.value}deg` }], opacity: interpolate(turn.value, [89, 90], [1, 0], 'clamp') }));
  const backStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${turn.value + 180}deg` }], opacity: interpolate(turn.value, [89, 90], [0, 1], 'clamp') }));
  return (
    <Pressable onPress={onFlip} style={styles.cardWrap} accessibilityRole="button" accessibilityHint="Turns the card over">
      <Animated.View pointerEvents={flipped ? 'none' : 'auto'} style={[styles.face, float, { justifyContent: 'center' }, frontStyle]}>
        <Text style={[styles.front, { color: c.t1 }]}>{front}</Text>
        <Text style={{ fontSize: 13, color: c.t3 }}>Tap to flip</Text>
      </Animated.View>
      <Animated.View pointerEvents={flipped ? 'box-none' : 'none'} style={[styles.face, float, backStyle]}>
        <View style={styles.backBody}>
          <Text style={[styles.back, { color: c.t1 }]}>{back}</Text>
        </View>
        {onExplain ? (
          <Pressable onPress={onExplain} style={({ pressed }) => [styles.explainPill, { backgroundColor: c.sel, opacity: pressed ? 0.7 : 1 }]}>
            <NxIcon name="spark" size={16} color={c.t1} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: c.t1 }}>Explain</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Missed it / Got it. Always takes its space so the card is the same size before and after turning. */
export function NxMarkButtons({ visible, onMiss, onGot }: { visible: boolean; onMiss: () => void; onGot: () => void }) {
  const c = useNx();
  const float = useFloat();
  const insets = useSafeAreaInsets();
  const btn = (icon: NxIconName, color: string, fn: () => void, label: string) => (
    <View style={styles.markCol}>
      <Pressable
        accessibilityLabel={label}
        disabled={!visible}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          fn();
        }}
        style={({ pressed }) => [styles.mark, float, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <NxIcon name={icon} size={26} color={color} strokeWidth={2} />
      </Pressable>
      <Text style={{ fontSize: 12, color: c.t2 }}>{label}</Text>
    </View>
  );
  return (
    <View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.marks, { paddingBottom: Math.max(40, insets.bottom + 6), opacity: visible ? 1 : 0 }]}
    >
      {btn('x', c.danger, onMiss, 'Missed it')}
      {btn('check', c.ok, onGot, 'Got it')}
    </View>
  );
}

export function NxQLabel({ children }: { children: string }) {
  const c = useNx();
  return <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: c.t3 }}>{children}</Text>;
}

export function NxQText({ children }: { children: string }) {
  const c = useNx();
  return <Text style={{ fontSize: 21, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3, color: c.t1 }}>{children}</Text>;
}

/** The rounded box the options (or the think-first prompt) sit in. */
export function NxQuizBox({ children }: { children: React.ReactNode }) {
  const c = useNx();
  return <View style={[styles.box, { borderColor: c.ring }]}>{children}</View>;
}

export type OptState = 'idle' | 'ok' | 'bad' | 'dim';

export function NxQuizOption({ text, state, first, onPress }: { text: string; state: OptState; first?: boolean; onPress?: () => void }) {
  const c = useNx();
  const bg = state === 'ok' ? tint(c.ok, 0.16) : state === 'bad' ? tint(c.danger, 0.13) : 'transparent';
  const fg = state === 'ok' ? c.ok : state === 'bad' ? c.danger : state === 'dim' ? c.t3 : c.t1;
  return (
    <Pressable
      onPress={onPress}
      disabled={state !== 'idle'}
      style={({ pressed }) => [styles.opt, { backgroundColor: pressed ? c.soft : bg, borderTopWidth: first ? 0 : 1, borderTopColor: c.ln }]}
    >
      <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: fg, fontWeight: state === 'ok' ? '600' : state === 'bad' ? '500' : '400' }}>{text}</Text>
      {state === 'ok' ? <NxIcon name="check" size={18} color={c.ok} strokeWidth={2.2} /> : null}
      {state === 'bad' ? <NxIcon name="x" size={18} color={c.danger} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

export type PairState = 'idle' | 'pick' | 'ok' | 'bad';

export function NxMatchTile({ text, state, onPress }: { text: string; state: PairState; onPress?: () => void }) {
  const c = useNx();
  // Canvas: idle is an inset 1px ring, picked an outer 2px accent ring (it grows outward), matched a green fill.
  const ring: ViewStyle =
    state === 'ok'
      ? { backgroundColor: tint(c.ok, 0.16), borderWidth: 1, borderColor: 'transparent' }
      : state === 'pick' || state === 'bad'
        ? { borderWidth: 2, borderColor: state === 'pick' ? c.acc : c.danger, margin: -1 }
        : { borderWidth: 1, borderColor: c.ring };
  return (
    <Pressable onPress={onPress} disabled={state === 'ok'} style={[styles.pair, ring]}>
      <View style={styles.pairInner}>
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '500', textAlign: 'center', color: state === 'ok' ? c.ok : c.t1 }}>{text}</Text>
      </View>
    </Pressable>
  );
}

export function NxModeCard({ icon, title, sub, on, onPress }: { icon: NxIconName; title: string; sub: string; on?: boolean; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!on }}
      style={[styles.mode, on ? { borderWidth: 2, borderColor: c.acc, margin: -1, padding: 15 } : { borderWidth: 1, borderColor: c.ring }]}
    >
      <View style={[styles.modeIcon, { backgroundColor: on ? tint(c.acc, 0.14) : c.sel }]}>
        <NxIcon name={icon} size={22} color={on ? c.acc : c.t1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.t1 }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: c.t2 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** Outline pill with a spark, for Explain and the explain-again chips. */
export function NxSparkChip({ label, onPress, height = 38 }: { label: string; onPress: () => void; height?: number }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, { height, borderColor: c.ring, backgroundColor: pressed ? c.soft : 'transparent' }]}>
      <NxIcon name="spark" size={15} color={c.t1} />
      <Text style={{ fontSize: 14, fontWeight: height === 38 ? '500' : '400', color: c.t1 }}>{label}</Text>
    </Pressable>
  );
}

/** The dark full-width button pinned to the bottom (canvas quiz_foot). Dimmed to .35 while it cannot be used. */
export function NxFootButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.foot, { bottom: Math.max(insets.bottom, 34) }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.footBtn, { backgroundColor: c.inv, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 }]}
      >
        <Text style={{ color: c.onInv, fontSize: 16, fontWeight: '500' }}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 48, paddingBottom: 2 },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600' },
  cardWrap: { flex: 1, marginTop: 22, marginHorizontal: 16 },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, padding: 26, gap: 18, alignItems: 'center', backfaceVisibility: 'hidden' },
  front: { fontSize: 25, lineHeight: 32, fontWeight: '600', letterSpacing: -0.35, textAlign: 'center' },
  backBody: { flex: 1, justifyContent: 'center' },
  back: { fontSize: 23, lineHeight: 31, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  explainPill: { height: 44, paddingHorizontal: 16, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  marks: { flexDirection: 'row', justifyContent: 'center', gap: 56, paddingTop: 26 },
  markCol: { alignItems: 'center', gap: 8 },
  mark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  box: { marginTop: 22, marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  opt: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pair: { flex: 1, minHeight: 58, borderRadius: 14 },
  pairInner: { flex: 1, minHeight: 58, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16 },
  modeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingLeft: 12, paddingRight: 14, borderRadius: 9999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  foot: { position: 'absolute', left: 16, right: 16 },
  footBtn: { height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
