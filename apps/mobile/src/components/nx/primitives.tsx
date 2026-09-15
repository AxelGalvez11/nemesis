/**
 * Building blocks of the 2026-09 iPhone design (canvas "Nemesis iPhone Screens"):
 * top tabs, rows, section labels, pills, buttons and the floating bottom bar.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { nxDuration, nxSize, nxType, useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';
import { NxPressable } from './NxPressable';
import { NxMark } from './NxMark';
import { nxEasing, nxHaptic } from './motion';

export type NxTabKey = 'notes' | 'study' | 'chats';

const TABS: { key: NxTabKey; icon: NxIconName; label: string }[] = [
  { key: 'notes', icon: 'notes', label: 'Notes' },
  { key: 'study', icon: 'book', label: 'Study' },
  { key: 'chats', icon: 'bubble', label: 'Chats' },
];

/**
 * Tabs sit on top, like Notion (canvas `tabs()`): avatar, then the three tabs. Only the open tab shows its
 * name, in a grey pill; the other two are icons. One optional action sits at the far right.
 */
export function NxTopTabs({
  active,
  onChange,
  onAvatar,
  initial,
  right,
}: {
  active: NxTabKey;
  onChange: (k: NxTabKey) => void;
  onAvatar?: () => void;
  initial?: string;
  right?: React.ReactNode;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  // The open tab's pill grows in place: neighbours slide over (layout), the label fades in.
  const slide = reduce ? undefined : LinearTransition.duration(nxDuration.base).easing(nxEasing);
  const fade = reduce ? undefined : FadeIn.duration(nxDuration.fast);
  return (
    <View style={[styles.tabsBar, { paddingTop: insets.top + 2 }]}>
      <NxPressable onPress={onAvatar} hitSlop={4} scaleTo={0.92} style={styles.iconBtn} accessibilityLabel="Profile">
        <View style={[styles.avatar, { backgroundColor: c.sel }]}>
          <Text style={{ color: c.t1, fontSize: 12, fontWeight: '600' }}>{(initial ?? 'N').slice(0, 1).toUpperCase()}</Text>
        </View>
      </NxPressable>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Animated.View key={t.key} layout={slide}>
            {on ? (
              <Animated.View key="on" entering={fade} style={styles.tabWrap}>
                <View style={[styles.tabOn, { backgroundColor: c.sel }]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
                  <NxIcon name={t.icon} size={18} color={c.t1} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: c.t1 }}>{t.label}</Text>
                </View>
              </Animated.View>
            ) : (
              <NxPressable
                key="off"
                scaleTo={0.9}
                onPress={() => {
                  nxHaptic('selection');
                  onChange(t.key);
                }}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: false }}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
              >
                <NxIcon name={t.icon} size={20} color={c.t2} />
              </NxPressable>
            )}
          </Animated.View>
        );
      })}
      <View style={{ flex: 1 }} />
      {right ? <View style={styles.iconBtn}>{right}</View> : null}
    </View>
  );
}

export function NxIconButton({ icon, onPress, color, size = 20, label }: { icon: NxIconName; onPress?: () => void; color?: string; size?: number; label: string }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]} accessibilityLabel={label}>
      <NxIcon name={icon} size={size} color={color ?? c.t1} />
    </Pressable>
  );
}

export function NxSection({ label, right }: { label: string; right?: React.ReactNode }) {
  const c = useNx();
  return (
    <View style={styles.section}>
      <Text style={[nxType.section, { color: c.t2 }]}>{label}</Text>
      {right}
    </View>
  );
}

export function NxRow({
  lead,
  title,
  meta,
  trail,
  onPress,
  onLongPress,
  indent = 0,
  style,
}: {
  lead?: React.ReactNode;
  title: string;
  meta?: string;
  trail?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  indent?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, { paddingLeft: nxSize.gutter + indent }, pressed && { backgroundColor: c.soft }, style]}
    >
      {lead}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[nxType.rowTitle, { color: c.t1 }]}>
          {title}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={[nxType.rowMeta, { color: c.t2 }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trail}
    </Pressable>
  );
}

export function NxEmoji({ emoji, size = 20 }: { emoji?: string | null; size?: number }) {
  return (
    <View style={styles.emoji}>
      <Text style={{ fontSize: size }}>{emoji || '📄'}</Text>
    </View>
  );
}

export function NxIconTile({ icon, tint }: { icon: NxIconName; tint?: 'accent' }) {
  const c = useNx();
  const accent = tint === 'accent';
  return (
    <View style={[styles.tile, { backgroundColor: accent ? 'rgba(59,147,240,0.14)' : c.sel }]}>
      <NxIcon name={icon} size={18} color={accent ? c.acc : c.t1} />
    </View>
  );
}

export function NxPill({ label, icon, onPress, inverse }: { label: string; icon?: NxIconName; onPress?: () => void; inverse?: boolean }) {
  const c = useNx();
  const fg = inverse ? c.onInv : c.t1;
  return (
    <NxPressable onPress={onPress} scaleTo={0.95} style={({ pressed }) => [styles.pill, { backgroundColor: inverse ? c.inv : c.sel }, pressed && { opacity: 0.7 }]}>
      {icon ? <NxIcon name={icon} size={16} color={fg} /> : null}
      <Text style={[nxType.pill, { color: fg }]}>{label}</Text>
    </NxPressable>
  );
}

export function NxButton({ label, icon, onPress, disabled }: { label: string; icon?: NxIconName; onPress?: () => void; disabled?: boolean }) {
  const c = useNx();
  return (
    <NxPressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: c.inv, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      {icon ? <NxIcon name={icon} size={18} color={c.onInv} strokeWidth={2} /> : null}
      <Text style={{ color: c.onInv, fontSize: 16, fontWeight: '500' }}>{label}</Text>
    </NxPressable>
  );
}

/** Floating bottom bar: search circle, Ask field, and an optional right action (New, close, icon). */
export function NxBottomBar({
  ask,
  onSearch,
  onAsk,
  right,
  left,
  askMark,
}: {
  ask: string;
  onSearch?: () => void;
  onAsk?: () => void;
  right?: React.ReactNode;
  /** Replaces the search circle (a note page puts its Recents button here, like Notion). */
  left?: React.ReactNode;
  /** The Nemesis mark in a ringed circle instead of the sparkle (Notion's Ask AI pill). */
  askMark?: boolean;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const float = { backgroundColor: c.card, borderColor: c.ring, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#2a1c00', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };
  return (
    <View pointerEvents="box-none" style={[styles.bottom, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      {/* Only drawn when there is somewhere to go: a search button that does nothing reads as broken. */}
      {left ?? (onSearch ? (
        <NxPressable onPress={onSearch} scaleTo={0.92} style={[styles.round, float]} accessibilityLabel="Search">
          <NxIcon name="search" size={20} color={c.t1} />
        </NxPressable>
      ) : null)}
      <NxPressable onPress={onAsk} scaleTo={0.98} style={[styles.ask, float, askMark && { paddingLeft: 6 }]}>
        {askMark ? (
          <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.ring, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
            <NxMark size={16} color={c.t1} />
          </View>
        ) : (
          <NxIcon name="spark" size={18} color={c.t3} />
        )}
        <Text numberOfLines={1} style={{ color: c.t3, fontSize: 15 }}>
          {ask}
        </Text>
      </NxPressable>
      {right}
    </View>
  );
}

export function NxNewButton({ onPress }: { onPress: () => void }) {
  const c = useNx();
  return (
    <NxPressable onPress={onPress} haptic="light" scaleTo={0.95} style={({ pressed }) => [styles.newBtn, { backgroundColor: c.inv, opacity: pressed ? 0.85 : 1 }]}>
      <NxIcon name="plus" size={18} color={c.onInv} strokeWidth={2} />
      <Text style={{ color: c.onInv, fontSize: 15, fontWeight: '500' }}>New</Text>
    </NxPressable>
  );
}

export function NxChevron() {
  const c = useNx();
  return <NxIcon name="chev_r" size={16} color={c.t3} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  tabsBar: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10, paddingRight: 6, paddingBottom: 2 },
  tabWrap: { height: 44, justifyContent: 'center', paddingHorizontal: 2 },
  tabOn: { height: 34, paddingLeft: 9, paddingRight: 12, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: nxSize.iconButton, height: nxSize.iconButton, alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18, paddingBottom: 6, paddingHorizontal: nxSize.gutter },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: nxSize.row, paddingRight: nxSize.gutter },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  emoji: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pill: { height: nxSize.pill, paddingHorizontal: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: { height: nxSize.button, borderRadius: nxSize.buttonRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bottom: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ask: { flex: 1, height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  newBtn: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 13, paddingRight: 16 },
});
