/**
 * Page workspace chrome from the canvas: the quiet Notes / Sources / Create toggle,
 * the page title block, and the "Add" pill used on Sources.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { nxType, useNx } from '@/theme/nx';
import { NxIcon } from './NxIcon';

export type WsTab = 'notes' | 'sources' | 'create';

export function NxWorkspaceTabs({ active, sourceCount, onChange }: { active: WsTab; sourceCount?: number; onChange: (t: WsTab) => void }) {
  const c = useNx();
  const items: { key: WsTab; label: string; count?: number }[] = [
    { key: 'notes', label: 'Notes' },
    { key: 'sources', label: 'Sources', count: sourceCount || undefined },
    { key: 'create', label: 'Create' },
  ];
  return (
    <View style={styles.wsRow}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) void Haptics.selectionAsync();
              onChange(it.key);
            }}
            style={[styles.wsTab, on && { backgroundColor: c.sel }]}
          >
            <Text style={{ fontSize: 13, color: on ? c.t1 : c.t3, fontWeight: on ? '500' : '400' }}>{it.label}</Text>
            {it.count ? <Text style={{ fontSize: 13, color: c.t3, marginLeft: 5 }}>{it.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function NxPageTitle({ emoji, title, cover }: { emoji?: string | null; title: string; cover?: string }) {
  const c = useNx();
  return (
    <View>
      {cover ? <View style={{ height: 76, marginTop: 4, backgroundColor: cover }} /> : null}
      <Text style={[nxType.pageEmoji, { paddingHorizontal: 20, paddingTop: cover ? 0 : 14, marginTop: cover ? -26 : 0 }]}>{emoji || '📄'}</Text>
      <Text style={[nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: 6 }]}>{title || 'Untitled'}</Text>
    </View>
  );
}

export function NxAddPill({ onPress, label = 'Add' }: { onPress: () => void; label?: string }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.add, { opacity: pressed ? 0.7 : 1 }]}>
      <NxIcon name="plus" size={16} color={c.acc} strokeWidth={2.2} />
      <Text style={{ color: c.acc, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36, marginTop: 12, marginHorizontal: 16 },
  wsTab: { height: 30, paddingHorizontal: 11, borderRadius: 9999, flexDirection: 'row', alignItems: 'center' },
  add: { height: 32, paddingLeft: 9, paddingRight: 12, borderRadius: 9999, backgroundColor: 'rgba(59,147,240,0.12)', flexDirection: 'row', alignItems: 'center', gap: 5 },
});
