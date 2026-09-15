/**
 * The Notes tab's New button menu (canvas artboard "New: page or recording"): two short options, no
 * descriptions (owner comment on the canvas), floating above the bottom bar on the right.
 *
 * Motion: the dim fades, the menu scales in from its bottom-right corner, and the New button morphs into the
 * close button (the pill narrows to a circle, "New" fades, the plus turns 45 degrees into an X). Closing
 * plays it backwards.
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nxDuration, useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';
import { NxPressable } from './NxPressable';
import { NxDim, useNxPopStyle, useNxPresence } from './motion';

/** NxNewButton's width: 13 + plus 18 + gap 6 + "New" at 15/500 (about 31) + 16. */
const NEW_W = 84;

export function NewMenu({ visible, onClose, onNewPage, onRecord, busy }: { visible: boolean; onClose: () => void; onNewPage: () => void; onRecord: () => void; busy?: boolean }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { mounted, p } = useNxPresence(visible, nxDuration.base, nxDuration.fast);
  const pop = useNxPopStyle(p);
  const morph = useAnimatedStyle(() => ({ width: 44 + (NEW_W - 44) * (1 - p.value) }));
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * p.value}deg` }] }));
  const word = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, p.value * 2.5) }));
  const option = (icon: NxIconName, label: string, onPress: () => void) => (
    <NxPressable onPress={onPress} disabled={busy} scaleTo={0.98} style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.soft }, busy && { opacity: 0.5 }]}>
      <View style={[styles.tile, { backgroundColor: c.sel }]}>
        <NxIcon name={icon} size={19} color={c.t1} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '500', color: c.t1 }}>{label}</Text>
    </NxPressable>
  );
  const bottom = Math.max(insets.bottom, 12) + 4;
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
        <NxDim p={p} onPress={onClose} />
        <Animated.View style={[styles.menu, { bottom: bottom + 56, backgroundColor: c.card, borderColor: c.ring, transformOrigin: 'bottom right' }, pop]}>
          {option('compose', 'New page', onNewPage)}
          <View style={[styles.rule, { backgroundColor: c.ln }]} />
          {option('mic', 'Record', onRecord)}
        </Animated.View>
        {/* The New button turns into a close button while the menu is open (canvas NewChooser). */}
        <NxPressable onPress={onClose} accessibilityLabel="Close" scaleTo={0.92} style={[styles.closeWrap, { bottom }]}>
          <Animated.View style={[styles.close, { backgroundColor: c.inv }, morph]}>
            <Animated.View style={turn}>
              <NxIcon name="plus" size={18} color={c.onInv} strokeWidth={2} />
            </Animated.View>
            <Animated.Text numberOfLines={1} style={[styles.word, { color: c.onInv }, word]}>
              New
            </Animated.Text>
          </Animated.View>
        </NxPressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeWrap: { position: 'absolute', right: 12, height: 44 },
  close: { height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 13, overflow: 'hidden' },
  word: { fontSize: 15, fontWeight: '500', flexShrink: 0 },
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
