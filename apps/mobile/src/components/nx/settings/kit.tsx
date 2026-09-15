/**
 * Settings building blocks, measured off gen.py: page_header, .grp, .gr, icbox, value, chev, .sw,
 * .pb, pb_go, ai_logo, .sec. Kept in this folder so the shared primitives stay untouched.
 */
import React from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Svg, { Line, Rect } from 'react-native-svg';
import { useAuth } from '@/auth/AuthProvider';
import { fetchEntitlements } from '@/api/billing';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { useNxAppearance } from './appearance-store';

export const SUPPORT_URL = 'https://www.enternemesis.com/support';
export const SUPPORT_EMAIL = 'support@enternemesis.com';
export const GO_GREEN = '#2fa56a';

/** The accent the student picked (Appearance), used for every selected state here. */
export function useAccent(): string {
  return useNxAppearance().accent;
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as never);
}

/** page_header(None, [], 'chev_l', title): back chevron, centred title, empty right slot. */
export function SettingsHeader({ title, onBack = goBack }: { title: string; onBack?: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 2 }]}>
      <Pressable onPress={onBack} hitSlop={6} style={({ pressed }) => [s.ib, pressed && { opacity: 0.5 }]} accessibilityLabel="Back">
        <NxIcon name="chev_l" size={22} color={c.t1} />
      </Pressable>
      <View style={s.headerTitle}>
        <Text numberOfLines={1} style={{ color: c.t1, fontSize: 16, lineHeight: 22, fontWeight: '600' }}>
          {title}
        </Text>
      </View>
      <View style={s.ib} />
    </View>
  );
}

export function Sec({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  const c = useNx();
  return <Text style={[s.sec, { color: c.t2 }, style]}>{label}</Text>;
}

export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useNx();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.grp, { backgroundColor: c.sunk }, style]}>
      {rows.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.ln } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** gr(lead, title, meta, trail, title_color) */
export function GroupRow({
  lead,
  title,
  meta,
  trail,
  titleColor,
  onPress,
  minHeight = 48,
  accessibilityLabel,
}: {
  lead?: React.ReactNode;
  title: string;
  meta?: string;
  trail?: React.ReactNode;
  titleColor?: string;
  onPress?: () => void;
  minHeight?: number;
  accessibilityLabel?: string;
}) {
  const c = useNx();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [s.gr, { minHeight }, pressed && onPress ? { backgroundColor: c.soft } : null]}
    >
      {lead}
      <View style={s.grText}>
        <Text style={{ fontSize: 16, lineHeight: 22, color: titleColor ?? c.t1 }}>{title}</Text>
        {meta ? <Text style={{ fontSize: 13, lineHeight: 18, color: c.t2 }}>{meta}</Text> : null}
      </View>
      {trail}
    </Pressable>
  );
}

export function IconBox({ icon }: { icon: NxIconName }) {
  const c = useNx();
  return (
    <View style={[s.icbox, { backgroundColor: c.soft }]}>
      <NxIcon name={icon} size={18} color={c.t2} />
    </View>
  );
}

export function Value({ text }: { text: string }) {
  const c = useNx();
  return <Text numberOfLines={1} style={{ fontSize: 15, color: c.t2 }}>{text}</Text>;
}

export function Chev() {
  const c = useNx();
  return <NxIcon name="chev_r" size={16} color={c.t3} strokeWidth={2} />;
}

/** nav(icon, title, value) */
export function NavTrail({ value }: { value?: string }) {
  return (
    <View style={s.trail}>
      {value ? <Value text={value} /> : null}
      <Chev />
    </View>
  );
}

/** .sw: 44x26, knob 20, accent when on. */
export function NxSwitch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  const c = useNx();
  const acc = useAccent();
  return (
    <Pressable
      onPress={() => onChange(!on)}
      hitSlop={9}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[s.sw, { backgroundColor: on ? acc : c.ring }]}
    >
      <View style={[s.knob, { left: on ? 21 : 3 }]} />
    </Pressable>
  );
}

/** .pb, optionally .pb.inv, or pb_go (green) */
export function Pill({
  label,
  icon,
  onPress,
  tone = 'plain',
  disabled,
}: {
  label: string;
  icon?: NxIconName;
  onPress?: () => void;
  tone?: 'plain' | 'inv' | 'go';
  disabled?: boolean;
}) {
  const c = useNx();
  const bg = tone === 'inv' ? c.inv : tone === 'go' ? GO_GREEN : c.sel;
  const fg = tone === 'inv' ? c.onInv : tone === 'go' ? '#ffffff' : c.t1;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={5}
      style={({ pressed }) => [s.pb, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}
    >
      {icon ? <NxIcon name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

const CLAUDE_RAYS: [number, number][] = [[0, 2.2], [45, 4.2], [90, 2.6], [135, 3.8], [180, 2.2], [225, 4.4], [270, 2.8], [315, 3.6]];

/** ai_logo(kind, s, r): Claude starburst on #d97757, ChatGPT knot on #0d0d0d. */
export function AiLogo({ kind, size = 32, radius = 10 }: { kind: 'claude' | 'gpt'; size?: number; radius?: number }) {
  const g = Math.floor(size * 0.62);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: kind === 'claude' ? '#d97757' : '#0d0d0d', alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'claude' ? (
        <Svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round">
          {CLAUDE_RAYS.map(([a, y]) => {
            const rad = (a * Math.PI) / 180;
            const dy = y - 12;
            return <Line key={a} x1={12} y1={12} x2={12 - dy * Math.sin(rad)} y2={12 + dy * Math.cos(rad)} />;
          })}
        </Svg>
      ) : (
        <Svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.5}>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Rect key={a} x={8.6} y={2.6} width={6.8} height={12} rx={3.4} transform={`rotate(${a} 12 12)`} />
          ))}
        </Svg>
      )}
    </View>
  );
}

export function Avatar({ initial, size, fontSize }: { initial: string; size: number; fontSize: number }) {
  const c = useNx();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.sel, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.t1, fontSize, fontWeight: '600' }}>{initial}</Text>
    </View>
  );
}

export const FIELDS = ['Law', 'Engineering', 'Computer science', 'History', 'Nursing', 'Business', 'Biology', 'Psychology', 'Art and design', 'Languages', 'Math', 'Something else'];
export const LEVELS = ['High school', 'College', 'Graduate school', 'On my own'];

/** Who is signed in, from the Supabase session. Profile answers live in user_metadata. */
export function useSettingsProfile() {
  const { session } = useAuth();
  const email = session?.user.email ?? '';
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === 'string' && (meta[k] as string).trim() ? (meta[k] as string).trim() : null);
  const fullName = str('full_name');
  const name = fullName ?? (email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Student');
  return {
    session,
    email,
    name,
    fullName,
    initial: (name[0] ?? 'N').toUpperCase(),
    field: str('field_of_study'),
    level: str('study_level'),
  };
}

/** The account's plan from get_my_entitlements. */
export function usePlan() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ['nx-settings-entitlements', session?.user.id ?? 'none'],
    queryFn: fetchEntitlements,
    enabled: !!session,
    staleTime: 60_000,
  });
  const plan = q.data?.plan ?? 'free';
  const paid = plan !== 'free';
  return { paid, label: paid ? 'Pro' : 'Free', refetch: q.refetch };
}

/** Pick one value: the native action sheet on iPhone, a plain alert elsewhere. */
export function pickOne(title: string, options: string[], selected: string | null, onPick: (value: string) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, 'Cancel'], cancelButtonIndex: options.length },
      (i) => {
        if (i < options.length) onPick(options[i]!);
      },
    );
    return;
  }
  Alert.alert(title, selected ? `Now: ${selected}` : undefined, [
    ...options.slice(0, 2).map((o) => ({ text: o, onPress: () => onPick(o) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 2 },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center' },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sec: { fontSize: 13, lineHeight: 18, fontWeight: '500', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 6 },
  grp: { marginHorizontal: 16, borderRadius: 10, overflow: 'hidden' },
  gr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, paddingHorizontal: 14 },
  grText: { flex: 1, minWidth: 0, gap: 1 },
  icbox: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  sw: { width: 44, height: 26, borderRadius: 13 },
  knob: { position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 0.5, shadowOffset: { width: 0, height: 0 } },
  pb: { height: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
