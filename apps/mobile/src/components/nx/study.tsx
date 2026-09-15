/**
 * Study pieces from the canvas: the flashcard (front/back same size, X and check
 * only after turning), the quiz option, the matching pair, and the mode card.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { nxEase, useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';

const ease = Easing.bezier(...nxEase);

/** One card. Front shows the prompt; the back shows ONLY the answer. */
export function NxFlashcard({ front, back, flipped, onFlip }: { front: string; back: string; flipped: boolean; onFlip: () => void }) {
  const c = useNx();
  const t = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: flipped ? 1 : 0, duration: 320, easing: ease, useNativeDriver: true }).start();
  }, [flipped, t]);
  const frontRot = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = t.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const face = [styles.card, { backgroundColor: c.card, borderColor: c.ln }];
  return (
    <Pressable onPress={onFlip} style={styles.cardWrap} accessibilityHint="Turns the card over">
      <Animated.View style={[face, { transform: [{ perspective: 1200 }, { rotateY: frontRot }] }]}>
        <Text style={[styles.cardText, { color: c.t1 }]}>{front}</Text>
      </Animated.View>
      <Animated.View style={[face, styles.back, { transform: [{ perspective: 1200 }, { rotateY: backRot }] }]}>
        <Text style={[styles.cardText, { color: c.t1 }]}>{back}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function NxMarkButtons({ onMiss, onGot }: { onMiss: () => void; onGot: () => void }) {
  const c = useNx();
  const btn = (icon: NxIconName, color: string, fn: () => void, label: string) => (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        fn();
      }}
      style={({ pressed }) => [styles.mark, { backgroundColor: c.card, borderColor: c.ring, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      <NxIcon name={icon} size={26} color={color} strokeWidth={2.2} />
    </Pressable>
  );
  return (
    <View style={styles.marks}>
      {btn('x', c.danger, onMiss, 'Missed it')}
      {btn('check', c.ok, onGot, 'Got it')}
    </View>
  );
}

export type OptState = 'idle' | 'right' | 'wrong' | 'muted';

export function NxQuizOption({ text, state, onPress }: { text: string; state: OptState; onPress?: () => void }) {
  const c = useNx();
  const bg = state === 'right' ? 'rgba(68,131,97,0.12)' : state === 'wrong' ? 'rgba(212,76,71,0.10)' : c.card;
  const border = state === 'right' ? c.ok : state === 'wrong' ? c.danger : c.ring;
  return (
    <Pressable onPress={onPress} disabled={state !== 'idle'} style={[styles.opt, { backgroundColor: bg, borderColor: border, opacity: state === 'muted' ? 0.55 : 1 }]}>
      <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: c.t1 }}>{text}</Text>
      {state === 'right' ? <NxIcon name="check" size={18} color={c.ok} strokeWidth={2.2} /> : null}
      {state === 'wrong' ? <NxIcon name="x" size={18} color={c.danger} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

export type PairState = 'idle' | 'picked' | 'matched';

export function NxMatchTile({ text, state, onPress }: { text: string; state: PairState; onPress?: () => void }) {
  const c = useNx();
  const border = state === 'matched' ? c.ok : state === 'picked' ? c.acc : c.ring;
  return (
    <Pressable
      onPress={onPress}
      disabled={state === 'matched'}
      style={[styles.pair, { borderColor: border, borderWidth: state === 'picked' ? 2 : 1, backgroundColor: state === 'matched' ? 'rgba(68,131,97,0.12)' : c.card }]}
    >
      <Text style={{ fontSize: 15, lineHeight: 20, color: c.t1 }}>{text}</Text>
    </Pressable>
  );
}

export function NxModeCard({ icon, title, sub, on, onPress }: { icon: NxIconName; title: string; sub: string; on?: boolean; onPress: () => void }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={[styles.mode, { borderColor: on ? c.acc : c.ring, borderWidth: on ? 2 : 1 }]}>
      <View style={[styles.modeIcon, { backgroundColor: on ? 'rgba(59,147,240,0.14)' : c.sel }]}>
        <NxIcon name={icon} size={22} color={on ? c.acc : c.t1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: c.t1 }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: c.t2 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrap: { flex: 1, marginHorizontal: 20, marginBottom: 120 },
  card: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  back: {},
  cardText: { fontSize: 22, lineHeight: 30, fontWeight: '500', textAlign: 'center' },
  marks: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  mark: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  opt: { minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pair: { minHeight: 64, borderRadius: 14, padding: 12, justifyContent: 'center' },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16 },
  modeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
