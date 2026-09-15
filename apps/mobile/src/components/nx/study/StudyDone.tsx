/**
 * "Done for today" (canvas CardsDone): the green rendered-art card with a slow drift, the Got it / Missed it
 * tally, a primary button and a quiet text button. The gradient is a picture (green.jpg), never a CSS gradient.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NxIcon } from '@/components/nx/NxIcon';
import { useNx } from '@/theme/nx';

const green = require('../../../../assets/images/nx/green.jpg');

export function StudyDone({
  title,
  sub,
  got,
  missed,
  primary,
  onPrimary,
  secondary,
  onSecondary,
}: {
  title: string;
  sub: string;
  got: number;
  missed: number;
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // Canvas .gdrift: translate(-3%,-2%) scale 1 rotate 0 → translate(6%,5%) scale 1.14 rotate 7deg, 16s, alternate.
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduce, t]);
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: `${-3 + 9 * t.value}%` },
      { translateY: `${-2 + 7 * t.value}%` },
      { scale: 1 + 0.14 * t.value },
      { rotate: `${7 * t.value}deg` },
    ],
  }));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.art}>
        {/* Oversized so the drift never shows an edge. */}
        <Animated.Image source={green} resizeMode="cover" style={[styles.img, drift]} />
        <View style={styles.tick}>
          <NxIcon name="check" size={38} color="#ffffff" strokeWidth={2} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <View style={[styles.grp, { backgroundColor: c.sunk }]}>
        <Tally label="Got it" value={got} />
        <Tally label="Missed it" value={missed} top />
      </View>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 34) }]}>
        <Pressable onPress={onPrimary} style={({ pressed }) => [styles.btn, { backgroundColor: c.inv, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={{ color: c.onInv, fontSize: 16, fontWeight: '500' }}>{primary}</Text>
        </Pressable>
        {secondary && onSecondary ? (
          <Pressable onPress={onSecondary} style={({ pressed }) => [styles.txt, pressed && { opacity: 0.5 }]}>
            <Text style={{ fontSize: 15, color: c.t2 }}>{secondary}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Tally({ label, value, top }: { label: string; value: number; top?: boolean }) {
  const c = useNx();
  return (
    <View style={[styles.gr, top && { borderTopWidth: 1, borderTopColor: c.ln }]}>
      <Text style={{ flex: 1, fontSize: 16, lineHeight: 22, color: c.t1 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: c.t2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { flex: 1, marginTop: 16, marginHorizontal: 16, marginBottom: 20, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, backgroundColor: '#1f9d4c' },
  img: { position: 'absolute', top: '-20%', left: '-20%', width: '140%', height: '140%' },
  tick: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: '#ffffff', textAlign: 'center' },
  sub: { fontSize: 16, lineHeight: 23, color: '#ffffff', opacity: 0.92, textAlign: 'center' },
  grp: { marginHorizontal: 16, marginBottom: 20, borderRadius: 10, overflow: 'hidden' },
  gr: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4, paddingHorizontal: 14 },
  actions: { paddingHorizontal: 20, gap: 8 },
  btn: { height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txt: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
