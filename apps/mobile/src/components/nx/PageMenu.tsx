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

export function PageMenu({
  visible,
  onClose,
  items,
  anchor = 'top-right',
  title,
}: {
  visible: boolean;
  onClose: () => void;
  items: PageMenuItem[];
  /** 'top-right' grows from a header ... button; 'bottom' rises from the foot for a row's options. */
  anchor?: 'top-right' | 'bottom';
  /** A quiet line naming what the options act on (a chat or a source). */
  title?: string;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { mounted, p } = useNxPresence(visible);
  const pop = useNxPopStyle(p, anchor === 'bottom' ? 10 : -6);
  const place =
    anchor === 'bottom'
      ? { left: 12, right: 12, bottom: Math.max(insets.bottom, 12) + 8, transformOrigin: 'bottom' as const }
      : // Sized to its longest label, never narrower than 240 or wider than the screen allows.
        { top: insets.top + 50, right: 12, minWidth: 240, maxWidth: 360, transformOrigin: 'top right' as const };
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
        <NxDim p={p} onPress={onClose} />
        <Animated.View style={[styles.card, place, { backgroundColor: c.card, borderColor: c.ring }, pop]}>
          {title ? (
            <Text numberOfLines={1} style={[styles.title, { color: c.t3 }]}>
              {title}
            </Text>
          ) : null}
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
                <Text style={{ flexShrink: 1, paddingRight: 6, fontSize: 16, fontWeight: '500', color: it.danger ? c.danger : c.t1 }}>{it.label}</Text>
              </NxPressable>
            </React.Fragment>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: '500', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  card: { position: 'absolute', borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#2a1c00', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 12 },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 10, marginVertical: 4 },
});
