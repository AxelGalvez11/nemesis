/** A calm status banner under the tabs (canvas `banner`: Offline). Sunk fill, 10px radius, icon, title and one line. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';

export function NxBanner({ icon, title, sub, tone = 'quiet', trail }: { icon: NxIconName; title: string; sub: string; tone?: 'quiet' | 'danger'; trail?: React.ReactNode }) {
  const c = useNx();
  return (
    <View style={[styles.banner, { backgroundColor: c.sunk }]} accessibilityRole="alert">
      <NxIcon name={icon} size={20} strokeWidth={1.8} color={tone === 'danger' ? c.danger : c.t2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: c.t1 }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: c.t2 }}>{sub}</Text>
      </View>
      {trail}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: 8, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
