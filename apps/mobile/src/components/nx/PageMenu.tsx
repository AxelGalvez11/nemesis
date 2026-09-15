/**
 * The page's "..." menu. Owner: the plain iOS action sheet "doesn't have UI", so it is the app's own pop-up, growing
 * out of the top-right button like the New and Add menus: favourite, share, move to trash.
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from './NxIcon';
import { NxPressable } from './NxPressable';
import { NxDim, useNxPopStyle, useNxPresence } from './motion';

export type PageMenuItem = { icon: NxIconName; label: string; danger?: boolean; onPress: () => void };

export function PageMenu({ visible, onClose, items }: { visible: boolean; onClose: () => void; items: PageMenuItem[] }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { mounted, p } = useNxPresence(visible);
  const pop = useNxPopStyle(p, -6);
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
        <NxDim p={p} onPress={onClose} />
        <Animated.View style={[styles.card, { top: insets.top + 50, backgroundColor: c.card, borderColor: c.ring, transformOrigin: 'top right' }, pop]}>
          {items.map((it, i) => (
            <React.Fragment key={it.label}>
              {it.danger && i > 0 ? <View style={[styles.rule, { backgroundColor: c.ln }]} /> : null}
              <NxPressable
                onPress={() => {
                  onClose();
                  it.onPress();
                }}
                scaleTo={0.98}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.soft }]}
              >
                <View style={[styles.tile, { backgroundColor: it.danger ? 'rgba(212,76,71,0.1)' : c.sel }]}>
                  <NxIcon name={it.icon} size={18} color={it.danger ? c.danger : c.t1} strokeWidth={1.8} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '500', color: it.danger ? c.danger : c.t1 }}>{it.label}</Text>
              </NxPressable>
            </React.Fragment>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', right: 12, width: 240, borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#2a1c00', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 12 },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 10, marginVertical: 4 },
});
