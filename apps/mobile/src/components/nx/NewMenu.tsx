/**
 * The Notes tab's New button menu (canvas artboard "New: page or recording"): two short options, no
 * descriptions (owner comment on the canvas), floating above the bottom bar on the right.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';

export function NewMenu({ visible, onClose, onNewPage, onRecord, busy }: { visible: boolean; onClose: () => void; onNewPage: () => void; onRecord: () => void; busy?: boolean }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const option = (icon: NxIconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.soft }, busy && { opacity: 0.5 }]}>
      <View style={[styles.tile, { backgroundColor: c.sel }]}>
        <NxIcon name={icon} size={19} color={c.t1} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '500', color: c.t1 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.menu,
          {
            bottom: Math.max(insets.bottom, 12) + 4 + 56,
            backgroundColor: c.card,
            borderColor: c.ring,
          },
        ]}
      >
        {option('compose', 'New page', onNewPage)}
        <View style={[styles.rule, { backgroundColor: c.ln }]} />
        {option('mic', 'Record', onRecord)}
      </View>
      {/* The New button turns into a close button while the menu is open (canvas NewChooser). */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={({ pressed }) => [styles.close, { bottom: Math.max(insets.bottom, 12) + 4, backgroundColor: c.inv, opacity: pressed ? 0.85 : 1 }]}
      >
        <NxIcon name="x" size={18} color={c.onInv} strokeWidth={2} />
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    right: 12,
    width: 212,
    borderRadius: 18,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#2a1c00',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 12 },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
});
