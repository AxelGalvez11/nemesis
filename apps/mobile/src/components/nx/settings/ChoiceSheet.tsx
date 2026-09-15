/**
 * Pick one value from a list, in the app's own bottom sheet (owner: the plain iOS action sheet "doesn't have UI").
 * The current value carries a tick; tapping a row closes the sheet and saves.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNx } from '@/theme/nx';
import { NxIcon } from '../NxIcon';
import { NxPressable } from '../NxPressable';
import { NxSheet, nxHaptic } from '../motion';

export function ChoiceSheet({
  visible,
  title,
  options,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly string[];
  selected: string | null;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <NxSheet visible={visible} onClose={onClose} style={[s.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={[s.grab, { backgroundColor: c.ring }]} />
      <Text style={[s.title, { color: c.t1 }]}>{title}</Text>
      <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const on = option === selected;
          return (
            <NxPressable
              key={option}
              scaleTo={0.98}
              onPress={() => {
                nxHaptic('selection');
                onClose();
                if (!on) onPick(option);
              }}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: c.soft }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={{ flex: 1, fontSize: 17, color: c.t1, fontWeight: on ? '600' : '400' }}>{option}</Text>
              {on ? <NxIcon name="check" size={20} color={c.acc} strokeWidth={2} /> : null}
            </NxPressable>
          );
        })}
      </ScrollView>
    </NxSheet>
  );
}

const s = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 12, marginHorizontal: 8, borderRadius: 12 },
});
