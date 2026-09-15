/**
 * Small pieces every database view shares: the bottom sheet, option pills, press feedback, empty states.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SchemaProp, SelectOption } from '@/api/database';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { NxPressable } from '../NxPressable';
import { NxSheet } from '../motion';
import { optionColor, optionOf } from './logic';

/** The shared NxSheet (slides up, dim fades, leaves the way it came) with a title row and a scrolling body. */
export function DbSheet({
  visible,
  title,
  onClose,
  children,
  right,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
  scroll?: boolean;
}) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const body = <View style={{ gap: 12 }}>{children}</View>;
  return (
    <NxSheet visible={visible} onClose={onClose} avoidKeyboard style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16), maxHeight: height * 0.86 }]}>
      <View style={[styles.grabber, { backgroundColor: c.ring }]} />
      <View style={styles.head}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: c.t1 }}>
          {title}
        </Text>
        {right}
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <NxIcon name="x" size={20} color={c.t2} />
        </Pressable>
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </NxSheet>
  );
}

/** A row in a sheet: icon, label, optional detail and a check when selected. */
export function SheetRow({
  icon,
  label,
  detail,
  selected,
  danger,
  onPress,
  lead,
}: {
  icon?: NxIconName;
  label: string;
  detail?: string;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
  lead?: React.ReactNode;
}) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: c.soft }]}
    >
      {lead ?? (icon ? <NxIcon name={icon} size={19} color={danger ? c.danger : c.t2} /> : null)}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: danger ? c.danger : c.t1 }}>
        {label}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={{ fontSize: 15, color: c.t2, maxWidth: 160 }}>
          {detail}
        </Text>
      ) : null}
      {selected ? <NxIcon name="check" size={18} color={c.acc} strokeWidth={2} /> : null}
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const c = useNx();
  return <Text style={{ fontSize: 13, fontWeight: '500', color: c.t3, marginTop: 4 }}>{children}</Text>;
}

export function OptionPill({ option, small }: { option: Pick<SelectOption, 'value' | 'color'>; small?: boolean }) {
  const dark = useColorScheme() === 'dark';
  const col = optionColor(option.color, dark);
  return (
    <View style={[styles.pill, small && { height: 20, paddingHorizontal: 6 }, { backgroundColor: col.bg }]}>
      <Text numberOfLines={1} style={{ fontSize: small ? 12 : 13, color: col.fg, fontWeight: '500' }}>
        {option.value}
      </Text>
    </View>
  );
}

/** A select, status or multi-select value as pills; any other value as grey text. */
export function ValuePills({ prop, value, max = 3 }: { prop: SchemaProp; value: unknown; max?: number }) {
  const values = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : typeof value === 'string' && value ? [value] : [];
  if (!values.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {values.slice(0, max).map((v) => (
        <OptionPill key={v} small option={optionOf(prop, v) ?? { value: v, color: 'default' }} />
      ))}
    </View>
  );
}

/** A card that gives way under the finger (the shared NxPressable). */
export function PressScale({
  onPress,
  onLongPress,
  style,
  children,
  label,
  disabled,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <NxPressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={style}>
      {children}
    </NxPressable>
  );
}

/** A plain note with one action, for views that need a property first. */
export function EmptyView({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const c = useNx();
  return (
    <View style={[styles.empty, { borderColor: c.ln }]}>
      <Text style={{ fontSize: 15, lineHeight: 22, color: c.t2, textAlign: 'center' }}>{text}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.emptyBtn, { backgroundColor: c.sel }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <NxIcon name="plus" size={16} color={c.t1} />
          <Text style={{ fontSize: 15, fontWeight: '500', color: c.t1 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "+ New" under a list of rows. */
export function NewRowButton({ onPress, label = 'New' }: { onPress: () => void; label?: string }) {
  const c = useNx();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.newRow, pressed && { backgroundColor: c.soft }]}>
      <NxIcon name="plus" size={16} color={c.t3} />
      <Text style={{ fontSize: 15, color: c.t3 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 16, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 6, borderRadius: 10 },
  pill: { height: 24, paddingHorizontal: 8, borderRadius: 6, justifyContent: 'center', alignSelf: 'flex-start', maxWidth: 200 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center', gap: 12 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 9999 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 8, borderRadius: 8 },
});
