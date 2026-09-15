/**
 * Pieces of the sign-in and onboarding screens (gen.py: ob_top, ob_text, ob_actions, chip, grp/gr,
 * ai_logo, nem_logo, pb, pb_go, the .logo dot animation and the .gdrift gradient drift).
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { NxMark } from '../NxMark';
import { NxPressable } from '../NxPressable';

export const COBALT = require('../../../../assets/images/nx/cobalt-hd.jpg');
export const CYAN_SOFT = require('../../../../assets/images/nx/cyan-soft.jpg');

const inOut = Easing.inOut(Easing.ease);

/* ---------- gradient art with the slow drift ---------- */

/**
 * The cobalt field with the cyan layer drifting over it. Sizes are the mockup's percentages of the
 * container; CSS translate percentages refer to the layer's own size, so they are turned into points here.
 */
export function DriftingGradient({ width, height, tall = false }: { width: number; height: number; tall?: boolean }) {
  const reduce = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    a.value = withRepeat(withTiming(1, { duration: 16000, easing: inOut }), -1, true);
    b.value = withRepeat(withTiming(1, { duration: 21000, easing: inOut }), -1, true);
  }, [reduce, a, b]);

  // Welcome: left -30% top -20% 160% x 140%. All set: top -30%, 160% x 160%.
  const w1 = width * 1.6;
  const h1 = height * (tall ? 1.6 : 1.4);
  const w2 = width * 1.5;
  const h2 = height * (tall ? 1.4 : 1.2);

  const s1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: w1 * (-0.03 + 0.09 * a.value) },
      { translateY: h1 * (-0.02 + 0.07 * a.value) },
      { scale: 1 + 0.14 * a.value },
      { rotate: `${7 * a.value}deg` },
    ],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: reduce ? 0.32 : 0.18 + 0.24 * b.value,
    transform: [
      { translateX: w2 * (0.08 - 0.14 * b.value) },
      { translateY: h2 * (0.06 - 0.14 * b.value) },
      { scale: 1.1 - 0.1 * b.value },
      { rotate: `${-6 + 10 * b.value}deg` },
    ],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: '#1d3fbf' }]}>
      <Animated.Image
        source={COBALT}
        resizeMode="cover"
        style={[{ position: 'absolute', left: -0.3 * width, top: (tall ? -0.3 : -0.2) * height, width: w1, height: h1 }, s1]}
      />
      <Animated.View
        style={[{ position: 'absolute', left: -0.4 * width, top: (tall ? 0 : 0.1) * height, width: w2, height: h2, mixBlendMode: 'screen' }, s2]}
      >
        <Image source={CYAN_SOFT} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
    </View>
  );
}

/* ---------- the three-dot logo: pops in, then waves ---------- */

/** Moved to the shared NxMark (also used on Upgrade); kept under this name for the sign-in screen. */
export const AnimatedMark = NxMark;

/* ---------- onboarding frame ---------- */

/** Back chevron and the step segments. `onBack` missing draws a spacer, never a dead button. */
export function ObTop({ step, total = 6, onBack, icon = 'chev_l' }: { step?: number; total?: number; onBack?: () => void; icon?: NxIconName }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.top, { paddingTop: Math.max(insets.top, 20) + 3 }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={6} style={s.ib} accessibilityRole="button" accessibilityLabel={icon === 'x' ? 'Close' : 'Back'}>
          <NxIcon name={icon} size={22} color={c.t1} />
        </Pressable>
      ) : (
        <View style={s.ib} />
      )}
      {step !== undefined ? (
        <View style={s.segs} accessibilityLabel={`Step ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[s.seg, { backgroundColor: i < step ? c.inv : c.sel }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ObText({ title, sub, top = 28 }: { title: string; sub: string; top?: number }) {
  const c = useNx();
  return (
    <View style={[s.text, { paddingTop: top }]}>
      <Text style={[s.title, { color: c.t1 }]}>{title}</Text>
      <Text style={[s.sub, { color: c.t2 }]}>{sub}</Text>
    </View>
  );
}

/** Primary button, then the grey text action (or an equal-height gap), pinned to the bottom. */
export function ObActions({
  primary,
  onPrimary,
  secondary,
  onSecondary,
  note,
  icon,
  busy,
  disabled,
}: {
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
  note?: string | null;
  icon?: NxIconName;
  busy?: boolean;
  disabled?: boolean;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.actions, { paddingBottom: Math.max(insets.bottom - 4, 30) }]}>
      {note ? <Text style={[s.note, { color: c.t2 }]}>{note}</Text> : null}
      <PrimaryButton label={primary} icon={icon} onPress={onPrimary} busy={busy} disabled={disabled} />
      {secondary && onSecondary ? (
        <Pressable onPress={onSecondary} disabled={busy} style={({ pressed }) => [s.txt, pressed && { opacity: 0.5 }]} accessibilityRole="button">
          <Text style={{ fontSize: 15, color: c.t2 }}>{secondary}</Text>
        </Pressable>
      ) : (
        <View style={{ height: 44 }} />
      )}
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, busy, disabled, testID }: { label: string; icon?: NxIconName; onPress: () => void; busy?: boolean; disabled?: boolean; testID?: string }) {
  const c = useNx();
  const off = !!disabled || !!busy;
  return (
    <NxPressable
      onPress={onPress}
      disabled={off}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: off }}
      style={({ pressed }) => [s.btn, { backgroundColor: c.inv, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={c.onInv} />
      ) : (
        <>
          {icon ? <NxIcon name={icon} size={18} color={c.onInv} /> : null}
          <Text style={{ color: c.onInv, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        </>
      )}
    </NxPressable>
  );
}

/** .btn2: white button with a hairline ring and a leading mark. */
export function OutlineButton({ label, lead, onPress, busy, disabled, testID }: { label: string; lead?: React.ReactNode; onPress: () => void; busy?: boolean; disabled?: boolean; testID?: string }) {
  const c = useNx();
  return (
    <NxPressable
      onPress={onPress}
      disabled={disabled || busy}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!disabled }}
      style={({ pressed }) => [
        s.btn2,
        { backgroundColor: pressed ? c.soft : c.card, borderColor: c.ring, opacity: disabled && !busy ? 0.5 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.t1} />
      ) : (
        <>
          {lead}
          <Text style={{ color: c.t1, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        </>
      )}
    </NxPressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useNx();
  return (
    <NxPressable
      onPress={onPress}
      haptic="selection"
      scaleTo={0.95}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[s.chip, on ? { backgroundColor: c.acc, borderColor: c.acc } : { borderColor: c.ring }]}
    >
      <Text style={{ fontSize: 15, color: on ? '#ffffff' : c.t1 }}>{label}</Text>
    </NxPressable>
  );
}

/** .grp: a sunk rounded group of rows split by hairlines. */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useNx();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.grp, { backgroundColor: c.sunk }, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.ln } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function GroupRow({ lead, title, trail, dim }: { lead?: React.ReactNode; title: string; trail?: React.ReactNode; dim?: boolean }) {
  const c = useNx();
  return (
    <View style={s.gr}>
      {lead}
      <Text style={{ flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22, color: dim ? c.t2 : c.t1 }}>{title}</Text>
      {trail}
    </View>
  );
}

export function CheckLead({ no }: { no?: boolean }) {
  const c = useNx();
  return <NxIcon name={no ? 'x' : 'check'} size={20} strokeWidth={2} color={no ? c.t3 : c.ok} />;
}

/** .pb (grey) and the green Connect variant. */
export function Pill({ label, icon, onPress, go }: { label: string; icon?: NxIconName; onPress: () => void; go?: boolean }) {
  const c = useNx();
  const fg = go ? '#ffffff' : c.t1;
  return (
    <NxPressable onPress={onPress} hitSlop={5} scaleTo={0.95} accessibilityRole="button" style={({ pressed }) => [s.pill, { backgroundColor: go ? '#2fa56a' : c.sel, opacity: pressed ? 0.75 : 1 }]}>
      {icon ? <NxIcon name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </NxPressable>
  );
}

export function IconBox({ name }: { name: NxIconName }) {
  const c = useNx();
  return (
    <View style={[s.icbox, { backgroundColor: c.soft }]}>
      <NxIcon name={name} size={18} color={c.t2} />
    </View>
  );
}

/** Claude (coral with rays) and ChatGPT (black with the petal knot), drawn as in the mockup. */
export function AiLogo({ kind, size = 32, radius = 10 }: { kind: 'claude' | 'gpt'; size?: number; radius?: number }) {
  const g = Math.round(size * 0.62);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: kind === 'claude' ? '#d97757' : '#0d0d0d', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={kind === 'claude' ? 2.6 : 1.5} strokeLinecap="round">
        {kind === 'claude'
          ? ([[0, 2.2], [45, 4.2], [90, 2.6], [135, 3.8], [180, 2.2], [225, 4.4], [270, 2.8], [315, 3.6]] as const).map(([a, y]) => (
              <Line key={a} x1="12" y1="12" x2="12" y2={y} transform={`rotate(${a} 12 12)`} />
            ))
          : [0, 60, 120, 180, 240, 300].map((a) => <Rect key={a} x="8.6" y="2.6" width="6.8" height="12" rx="3.4" transform={`rotate(${a} 12 12)`} />)}
      </Svg>
    </View>
  );
}

/** Rounded cobalt tile with the white three-dot mark. */
export function NemLogo({ size, radius, mark }: { size: number; radius: number; mark: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={COBALT} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <NxIcon name="mark" size={mark} color="#ffffff" />
    </View>
  );
}

/** Two tiles with the sync arrows between them (Approve Claude, Anki). */
export function LinkedTiles({ left }: { left: React.ReactNode }) {
  const c = useNx();
  return (
    <View style={s.tiles}>
      {left}
      <NxIcon name="sync" size={22} color={c.t3} />
      <NemLogo size={56} radius={16} mark={30} />
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 20 },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segs: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 9999 },
  text: { gap: 10, paddingHorizontal: 28, alignItems: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.4, textAlign: 'center' },
  sub: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  actions: { marginTop: 'auto', paddingHorizontal: 20, gap: 6 },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  txt: { height: 44, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btn2: { height: 50, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grp: { marginHorizontal: 16, borderRadius: 10, overflow: 'hidden' },
  gr: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4, paddingHorizontal: 14 },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 5 },
  icbox: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
});
