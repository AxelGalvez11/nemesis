import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { NxIcon } from '@/components/nx/NxIcon';
import { subscribeMicLevel } from '@/lib/mic-level';
import { useNx } from '@/theme/nx';

// The recorder bar from the canvas (gen.py `rec_pill`): a hint line, then a floating pill with pause, a red dot, the
// clock, a small waveform and End. Behind it a faint cobalt halo breathes (opacity .26 to .08 over 3.2 s).

const BARS = [8, 16, 11, 20, 9, 14, 6];

export function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function loop(value: Animated.Value, to: number, half: number) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: to, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(value, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]),
  );
}

function Waveform({ live, color }: { live: boolean; color: string }) {
  const scales = useRef(BARS.map(() => new Animated.Value(1))).current;
  useEffect(() => {
    if (!live) {
      scales.forEach((s) => s.setValue(1));
      return;
    }
    return subscribeMicLevel((level) => {
      scales.forEach((s, i) => {
        const jitter = 0.75 + 0.5 * Math.abs(Math.sin(Date.now() / 140 + i * 1.7));
        Animated.timing(s, { toValue: 0.45 + Math.min(1, level * 1.6) * jitter, duration: 80, useNativeDriver: true }).start();
      });
    });
  }, [live, scales]);
  return (
    <View style={styles.wave}>
      {BARS.map((h, i) => (
        <Animated.View key={i} style={{ width: 3, height: h, borderRadius: 9999, backgroundColor: color, transform: [{ scaleY: scales[i]! }] }} />
      ))}
    </View>
  );
}

export function RecordPill({
  seconds,
  paused,
  busy,
  onPause,
  onResume,
  onEnd,
  hint = 'Type notes if you want',
}: {
  seconds: number;
  paused: boolean;
  /** While End is being handled: the buttons stop taking taps. */
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  hint?: string;
}) {
  const c = useNx();
  const dark = useColorScheme() === 'dark';
  const enter = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(1)).current;
  const dot = useRef(new Animated.Value(1)).current;
  const reduce = useReducedMotion();

  useEffect(() => {
    // Reduced motion (the canvas `prefers-reduced-motion` block): no entrance, no breathing halo.
    if (reduce) {
      enter.setValue(1);
      halo.setValue(1);
      return;
    }
    // `recin`: fades up from 20 px below at 95% scale, on the canvas's ease.
    Animated.timing(enter, { toValue: 1, duration: 420, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start();
    const a = loop(halo, 0.08 / 0.26, 1600);
    a.start();
    return () => a.stop();
  }, [enter, halo, reduce]);

  useEffect(() => {
    if (paused || reduce) {
      dot.setValue(1);
      return;
    }
    const a = loop(dot, 0.35, 700);
    a.start();
    return () => a.stop();
  }, [paused, dot, reduce]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.hint, { color: c.t3 }]}>{hint}</Text>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.halo,
            { opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.26] }), boxShadow: '0 0 22px 8px rgba(84, 104, 236, 0.9)' },
          ]}
        />
        <View
          style={[
            styles.pill,
            {
              backgroundColor: c.card,
              boxShadow: dark ? '0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.5)' : '0 0 0 1px rgba(42,28,0,0.08), 0 4px 14px rgba(42,28,0,0.08)',
            },
          ]}
        >
          <Pressable
            onPress={paused ? onResume : onPause}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'}
            style={({ pressed }) => [styles.pause, { backgroundColor: c.sel, opacity: pressed ? 0.6 : 1 }]}
          >
            <NxIcon name={paused ? 'play' : 'pause'} size={18} color={c.t1} strokeWidth={2.2} />
          </Pressable>
          <Animated.View style={[styles.dot, { backgroundColor: paused ? c.t3 : c.danger, opacity: dot }]} />
          <Text style={[styles.clock, { color: c.t1 }]} accessibilityLabel={`${paused ? 'Paused at' : 'Recording for'} ${formatClock(seconds)}`}>
            {formatClock(seconds)}
          </Text>
          <Waveform live={!paused} color={c.t3} />
          <Pressable
            onPress={onEnd}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="End recording"
            style={({ pressed }) => [styles.end, { backgroundColor: c.inv, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.endText, { color: c.onInv }]}>End</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  halo: { borderRadius: 9999, margin: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 6, borderRadius: 9999 },
  pause: { width: 44, height: 44, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 9999, marginLeft: 4 },
  clock: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, marginHorizontal: 6 },
  end: { height: 44, paddingHorizontal: 20, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  endText: { fontSize: 15, fontWeight: '500' },
});
