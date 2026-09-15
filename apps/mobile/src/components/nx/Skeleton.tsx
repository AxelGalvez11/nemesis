/**
 * Loading skeletons (canvas WritingNotes `skel`: 12px bars, 4px radius, `--sel` fill). Every screen that waits
 * on the network draws the shape of what is coming instead of a spinner, so the layout does not jump when the
 * data lands. One shared pulse drives every bar on screen.
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { nxSize, useNx } from '@/theme/nx';

const Pulse = createContext<Animated.Value | null>(null);

function usePulse(): Animated.Value {
  const shared = useContext(Pulse);
  const own = useRef(new Animated.Value(1)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (shared) return;
    if (reduce) {
      // Reduced motion: the bars hold still at a middle grey instead of breathing.
      own.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(own, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(own, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shared, own, reduce]);
  return shared ?? own;
}

/** Wraps a group of bars so they breathe together. */
export function SkelGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const value = usePulse();
  return (
    <Pulse.Provider value={value}>
      <Animated.View style={[{ opacity: value }, style]} accessibilityLabel="Loading" accessibilityRole="progressbar">
        {children}
      </Animated.View>
    </Pulse.Provider>
  );
}

export function SkelBar({ width = '100%', height = 12, radius = 4, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const c = useNx();
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: c.sel }, style]} />;
}

/** A list row: lead tile, title and meta bars (NxRow geometry). */
export function SkelRow({ lead = 'tile', title = '62%', meta = '38%', indent = 0 }: { lead?: 'tile' | 'emoji' | 'none'; title?: DimensionValue; meta?: DimensionValue | null; indent?: number }) {
  return (
    <View style={[styles.row, { paddingLeft: nxSize.gutter + indent }]}>
      {lead === 'tile' ? <SkelBar width={36} height={36} radius={10} /> : lead === 'emoji' ? <SkelBar width={24} height={24} radius={6} style={{ marginHorizontal: 4 }} /> : null}
      <View style={{ flex: 1, gap: 7 }}>
        <SkelBar width={title} height={13} />
        {meta ? <SkelBar width={meta} height={10} /> : null}
      </View>
    </View>
  );
}

export function SkelSection({ width = 64 }: { width?: number }) {
  return (
    <View style={styles.section}>
      <SkelBar width={width} height={10} />
    </View>
  );
}

/** Notes home: Recents cards, then the Private tree. */
export function SkelNotesHome() {
  const c = useNx();
  return (
    <SkelGroup>
      <SkelSection width={58} />
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.card, { borderColor: c.ln }]}>
            <View style={{ height: 38, backgroundColor: c.sel }} />
            <View style={{ padding: 12, gap: 8 }}>
              <SkelBar width={26} height={26} radius={6} style={{ marginTop: -24 }} />
              <SkelBar width="90%" height={12} />
              <SkelBar width="60%" height={12} />
              <SkelBar width="40%" height={9} />
            </View>
          </View>
        ))}
      </View>
      <SkelSection width={52} />
      {['58%', '72%', '46%', '64%', '52%'].map((w, i) => (
        <View key={i} style={styles.tree}>
          <SkelBar width={12} height={12} radius={3} />
          <SkelBar width={20} height={20} radius={5} />
          <SkelBar width={w as DimensionValue} height={13} />
        </View>
      ))}
    </SkelGroup>
  );
}

/** A page: emoji, title, the Notes / Sources / Create toggle, props and a few lines of body. */
export function SkelPage() {
  return (
    <SkelGroup style={{ paddingHorizontal: 20 }}>
      <SkelBar width={44} height={44} radius={10} style={{ marginTop: 22 }} />
      <SkelBar width="82%" height={26} radius={6} style={{ marginTop: 14 }} />
      <SkelBar width="48%" height={26} radius={6} style={{ marginTop: 8 }} />
      <SkelBar width="100%" height={36} radius={9999} style={{ marginTop: 18 }} />
      <View style={{ marginTop: 16, gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <SkelBar width={112} height={12} />
            <SkelBar width={i === 1 ? 92 : 60} height={12} />
          </View>
        ))}
      </View>
      <SkelBody style={{ marginTop: 26 }} />
    </SkelGroup>
  );
}

/** Lines of note text (the canvas `skel` widths). */
export function SkelBody({ style, lines = [92, 78, 86, 60] }: { style?: StyleProp<ViewStyle>; lines?: number[] }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      {lines.map((w, i) => (
        <SkelBar key={i} width={`${w}%`} height={12} />
      ))}
    </View>
  );
}

/** Rows for lists (Study sets, chats, sources, cards). */
export function SkelList({ rows = 5, lead = 'tile', section = true }: { rows?: number; lead?: 'tile' | 'emoji' | 'none'; section?: boolean }) {
  const titles = ['64%', '48%', '72%', '56%', '40%', '68%'];
  const metas = ['34%', '28%', '40%', '22%', '30%', '36%'];
  return (
    <SkelGroup>
      {section ? <SkelSection /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <SkelRow key={i} lead={lead} title={titles[i % titles.length] as DimensionValue} meta={metas[i % metas.length] as DimensionValue} />
      ))}
    </SkelGroup>
  );
}

/** A flashcard waiting for its cards. */
export function SkelFlashcard() {
  const c = useNx();
  return (
    <SkelGroup style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
      <View style={[styles.flash, { borderColor: c.ln }]}>
        <SkelBar width="70%" height={18} radius={5} />
        <SkelBar width="52%" height={18} radius={5} />
      </View>
    </SkelGroup>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: nxSize.row, paddingRight: nxSize.gutter },
  section: { paddingTop: 22, paddingBottom: 10, paddingHorizontal: nxSize.gutter },
  card: { width: 140, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  tree: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingLeft: 16, paddingRight: 16 },
  flash: { flex: 1, maxHeight: 520, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
