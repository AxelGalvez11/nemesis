/**
 * The popover under the avatar on the tabs (canvas artboard "ProfileMenu"): who you are, your plan,
 * Settings, Connected AI and apps, Help and feedback, Sign out. It navigates itself; the caller only
 * controls visibility. The Anki sync row is not drawn: there is no Anki sync behind it yet.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { useNx } from '@/theme/nx';
import { NxIcon, type NxIconName } from '../NxIcon';
import { Avatar, Chev, Pill, SUPPORT_URL, usePlan, useSettingsProfile } from './kit';
import './appearance-store';

export function ProfileMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { name, email, initial, session } = useSettingsProfile();
  const plan = usePlan();

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const doSignOut = async () => {
    onClose();
    await signOut();
    router.replace('/sign-in');
  };

  const row = (icon: NxIconName, title: string, onPress: () => void, danger = false) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.soft }]} accessibilityRole="button" accessibilityLabel={title}>
      <NxIcon name={icon} size={19} color={danger ? c.danger : c.t2} />
      <Text style={{ flex: 1, fontSize: 16, color: danger ? c.danger : c.t1 }}>{title}</Text>
      {danger ? null : <Chev />}
    </Pressable>
  );

  const divider = <View style={{ height: 1, backgroundColor: c.ln, marginVertical: 4 }} />;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} onPress={onClose} accessibilityLabel="Close menu" />

      {/* Sits exactly over the tab bar's avatar (NxTopTabs: 10pt side padding, 44pt button, insets.top + 2). */}
      <Pressable onPress={onClose} style={[styles.avatarSlot, { top: insets.top + 2 }]} accessibilityLabel="Close menu">
        <View style={[styles.avatarRing, { backgroundColor: c.card, borderColor: c.inv }]}>
          <Text style={{ color: c.t1, fontSize: 12, fontWeight: '600' }}>{initial}</Text>
        </View>
      </Pressable>

      <View
        style={[
          styles.card,
          { top: insets.top + 56, backgroundColor: c.card, borderColor: c.ring },
        ]}
      >
        <View style={styles.who}>
          <Avatar initial={initial} size={44} fontSize={17} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: c.t1, fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{name}</Text>
            <Text numberOfLines={1} style={{ color: c.t2, fontSize: 13, lineHeight: 18 }}>{email}</Text>
          </View>
        </View>

        {session ? (
          <Pressable onPress={() => go(plan.paid ? '/settings-account' : '/settings-upgrade')} style={[styles.plan, { backgroundColor: c.sunk }]}>
            <NxIcon name="star" size={18} color={c.t1} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.t1, fontSize: 14, lineHeight: 19, fontWeight: '500' }}>{plan.paid ? 'Nemesis Pro' : 'Free plan'}</Text>
              <Text style={{ color: c.t2, fontSize: 12, lineHeight: 18 }}>{plan.paid ? 'Your plan is active' : 'Unlimited recording on Pro'}</Text>
            </View>
            {plan.paid ? <Chev /> : <View style={{ minHeight: 44, justifyContent: 'center' }}><Pill label="Upgrade" tone="inv" onPress={() => go('/settings-upgrade')} /></View>}
          </Pressable>
        ) : null}

        {divider}
        {row('user', 'Settings', () => go('/settings'))}
        {row('link', 'Connected AI and apps', () => go('/settings-connected'))}
        {row('help', 'Help and feedback', () => {
          onClose();
          void WebBrowser.openBrowserAsync(SUPPORT_URL).catch(() => null);
        })}
        {session ? (
          <>
            {divider}
            {row('logout', 'Sign out', () => void doSignOut(), true)}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avatarSlot: { position: 'absolute', left: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    left: 12,
    width: 300,
    borderRadius: 18,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#2a1c00',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 },
  plan: { marginHorizontal: 14, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 14 },
});
