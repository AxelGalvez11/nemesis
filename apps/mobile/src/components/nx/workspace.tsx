/**
 * Page workspace chrome from the canvas: the quiet Notes / Sources / Create toggle,
 * the page title block, and the "Add" pill used on Sources.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { nxDuration, nxType, useNx } from '@/theme/nx';
import { NxIcon } from './NxIcon';
import { NxPressable } from './NxPressable';
import { nxEasing, nxHaptic } from './motion';

export type WsTab = 'notes' | 'sources' | 'create';

export function NxWorkspaceTabs({ active, sourceCount, onChange }: { active: WsTab; sourceCount?: number; onChange: (t: WsTab) => void }) {
  const c = useNx();
  const reduce = useReducedMotion();
  const items: { key: WsTab; label: string; count?: number }[] = [
    { key: 'notes', label: 'Notes' },
    { key: 'sources', label: 'Sources', count: sourceCount || undefined },
    { key: 'create', label: 'Create' },
  ];
  // One grey pill slides between the tabs (280ms) instead of each tab painting its own background.
  const boxes = useRef<Partial<Record<WsTab, { x: number; w: number }>>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const place = (key: WsTab) => {
    const b = boxes.current[key];
    if (!b) return;
    if (reduce || w.value === 0) {
      x.value = b.x;
      w.value = b.w;
      return;
    }
    x.value = withTiming(b.x, { duration: nxDuration.base, easing: nxEasing });
    w.value = withTiming(b.w, { duration: nxDuration.base, easing: nxEasing });
  };
  useEffect(() => {
    place(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const pill = useAnimatedStyle(() => ({ opacity: w.value > 0 ? 1 : 0, width: w.value, transform: [{ translateX: x.value }] }));
  return (
    <View style={styles.wsRow}>
      <Animated.View pointerEvents="none" style={[styles.wsPill, { backgroundColor: c.sel }, pill]} />
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e) => {
              boxes.current[it.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (it.key === active) place(it.key);
            }}
            onPress={() => {
              if (!on) nxHaptic('selection');
              onChange(it.key);
            }}
            style={({ pressed }) => [styles.wsTab, pressed && !on && { opacity: 0.6 }]}
          >
            <Text style={{ fontSize: 13, color: on ? c.t1 : c.t3, fontWeight: on ? '500' : '400' }}>{it.label}</Text>
            {it.count ? <Text style={{ fontSize: 13, color: c.t3, marginLeft: 5 }}>{it.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The page's title (no emoji; `emoji` is ignored). With `onRename`, the title is typed straight into (saved when you leave the field). */
export function NxPageTitle({
  title,
  cover,
  onRename,
  autoFocus,
  bare,
  accessoryId,
}: {
  emoji?: string | null;
  title: string;
  cover?: string;
  onRename?: (title: string) => void;
  autoFocus?: boolean;
  /** A brand-new page (canvas NewPage): no emoji, no placeholder, only the cursor. */
  bare?: boolean;
  accessoryId?: string;
}) {
  const c = useNx();
  const [draft, setDraft] = useState(title);
  const [focused, setFocused] = useState(!!autoFocus);
  useEffect(() => setDraft(title), [title]);
  // No page emoji (owner 2026-09-15): a page starts with its title, with room under the header.
  const titleStyle = [nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: bare ? 22 : 14 }];
  return (
    <View>
      {cover ? <View style={{ height: 76, marginTop: 4, backgroundColor: cover }} /> : null}
      {onRename ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          // Saved once, on leaving the field. Done (blurOnSubmit) blurs, so it lands here too.
          onBlur={() => {
            setFocused(false);
            if (draft.trim() !== title.trim()) onRename(draft.trim());
          }}
          // Bare (a brand-new page) shows only the cursor while typing; once the field lets go it must still say
          // Untitled, or the page reads as blank.
          placeholder={bare && focused ? '' : 'Untitled'}
          onFocus={() => setFocused(true)}
          placeholderTextColor={c.t3}
          autoFocus={autoFocus}
          inputAccessoryViewID={accessoryId}
          returnKeyType="done"
          blurOnSubmit
          multiline={false}
          style={titleStyle}
          accessibilityLabel="Page title"
        />
      ) : (
        <Text style={titleStyle}>{title || 'Untitled'}</Text>
      )}
    </View>
  );
}

export function NxAddPill({ onPress, label = 'Add' }: { onPress: () => void; label?: string }) {
  const c = useNx();
  return (
    <NxPressable onPress={onPress} scaleTo={0.95} style={({ pressed }) => [styles.add, { opacity: pressed ? 0.7 : 1 }]}>
      <NxIcon name="plus" size={16} color={c.acc} strokeWidth={2.2} />
      <Text style={{ color: c.acc, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </NxPressable>
  );
}

const styles = StyleSheet.create({
  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36, marginTop: 12, marginHorizontal: 16 },
  wsPill: { position: 'absolute', left: 0, top: 3, height: 30, borderRadius: 9999 },
  wsTab: { height: 30, paddingHorizontal: 11, borderRadius: 9999, flexDirection: 'row', alignItems: 'center' },
  add: { height: 32, paddingLeft: 9, paddingRight: 12, borderRadius: 9999, backgroundColor: 'rgba(59,147,240,0.12)', flexDirection: 'row', alignItems: 'center', gap: 5 },
});
