/**
 * The pictures on the onboarding steps (gen.py: cal_rows card, the Microphone card, the two notification
 * banners). They are drawings of what a feature looks like, so they are hidden from screen readers and
 * nothing in them is pressable.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { nxEase, useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';
import { COBALT, NemLogo } from './parts';

const ease = Easing.bezier(nxEase[0], nxEase[1], nxEase[2], nxEase[3]);

function useFloat() {
  const c = useNx();
  return {
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.ring,
    shadowColor: '#2a1c00',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  } as const;
}

/* ---------- Connect Google Calendar ---------- */

function CalRow({ title, meta, record }: { title: string; meta: string; record?: boolean }) {
  const c = useNx();
  return (
    <View style={s.row}>
      <View style={[s.bar, { backgroundColor: c.t3 }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 22, color: c.t1 }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: c.t2 }}>{meta}</Text>
      </View>
      {record ? (
        <View style={[s.pill, { backgroundColor: c.sel }]}>
          <NxIcon name="mic" size={16} color={c.t1} />
          <Text style={{ color: c.t1, fontSize: 14, fontWeight: '500' }}>Record</Text>
        </View>
      ) : null}
    </View>
  );
}

export function CalendarPreview() {
  const c = useNx();
  const float = useFloat();
  return (
    <View style={[s.calCard, float]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[s.sec, { color: c.t2 }]}>Coming up</Text>
      <CalRow title="Contract law" meta="10:00 AM, Room 204" record />
      <CalRow title="Thermodynamics lab" meta="2:00 PM, Hall B" />
    </View>
  );
}

/* ---------- Microphone ---------- */

function Ring({ inset, width, alpha, delay, reduce }: { inset: number; width: number; alpha: number; delay: number; reduce: boolean }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    // breathe 3200ms: 50% { opacity: .08 }
    o.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(0.08, { duration: 1600, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) })), -1, false),
    );
  }, [reduce, o, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: -inset, left: -inset, right: -inset, bottom: -inset, borderRadius: 9999, borderWidth: width, borderColor: `rgba(255,255,255,${alpha})` },
        style,
      ]}
    />
  );
}

const BARS = [8, 14, 22, 12, 18, 26, 16, 10, 20, 12, 7];

export function MicCard() {
  const reduce = useReducedMotion();
  return (
    <View style={s.micCard} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={COBALT} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
        <Ring inset={22} width={1.5} alpha={0.28} delay={0} reduce={reduce} />
        <Ring inset={44} width={1} alpha={0.16} delay={600} reduce={reduce} />
        <View style={s.micCircle}>
          <NxIcon name="mic" size={50} color="#ffffff" />
        </View>
      </View>
      <View style={s.wave}>
        {BARS.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.85)' }} />
        ))}
      </View>
    </View>
  );
}

/* ---------- Notifications ---------- */

function Banner({ time, body, delay, top }: { time: string; body: string; delay: number; top: number }) {
  const c = useNx();
  const float = useFloat();
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const out = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      p.value = 1;
      out.value = 0;
      return;
    }
    // notifin 5200ms: in by 9%, hold to 80%, out by 90%, hidden to 100%.
    p.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 468, easing: ease }),
          withTiming(1, { duration: 3692 }),
          withTiming(1, { duration: 520 }),
          withTiming(0, { duration: 520 }),
        ),
        -1,
        false,
      ),
    );
    out.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 4160 }),
          withTiming(1, { duration: 520, easing: ease }),
          withTiming(1, { duration: 520 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [reduce, p, out, delay]);
  const style = useAnimatedStyle(() => {
    const leaving = out.value;
    return {
      opacity: leaving > 0 ? 1 - leaving : p.value,
      transform: [
        { translateY: leaving > 0 ? -10 * leaving : -36 * (1 - p.value) },
        { scale: leaving > 0 ? 1 - 0.02 * leaving : 0.94 + 0.06 * p.value },
      ],
    };
  });
  return (
    <Animated.View style={[s.banner, float, { marginTop: top }, style]}>
      <NemLogo size={38} radius={10} mark={22} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: c.t1 }}>Nemesis</Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.t3 }}>{time}</Text>
        </View>
        <Text style={{ fontSize: 15, lineHeight: 21, color: c.t1 }}>{body}</Text>
      </View>
    </Animated.View>
  );
}

export function NotificationPreview() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Banner time="9:00 AM" body="24 flashcards are due today" delay={0} top={64} />
      <Banner time="11:02 AM" body="Your notes for Contract law are ready" delay={700} top={10} />
    </View>
  );
}

const s = StyleSheet.create({
  calCard: { marginTop: 32, marginHorizontal: 24, borderRadius: 16, paddingVertical: 6 },
  sec: { fontSize: 13, lineHeight: 18, fontWeight: '500', paddingTop: 10, paddingHorizontal: 16, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  bar: { width: 3, height: 32, borderRadius: 9999, marginLeft: 4 },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  micCard: { marginTop: 28, marginHorizontal: 20, height: 300, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 22 },
  micCircle: { width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26 },
  banner: { marginHorizontal: 24, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
