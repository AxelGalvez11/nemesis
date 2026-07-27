import type { ComponentType } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  CloseIcon,
  FileIcon,
  type IconProps,
  LifeRingIcon,
  LogoutIcon,
  MailIcon,
  SettingsIcon,
  SparkleIcon,
  ThemeIcon,
  TrashIcon,
} from "@/components/icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// Notifications/Usage need glyphs the shared icon set doesn't have yet. Kept
// local to this file (not added to components/icons.tsx) to stay inside this
// task's owned-files boundary during the cloud-first-phone build — several
// other agents are editing the mobile tree concurrently. Same hand-drawn
// language as icons.tsx: thin round strokes, color from the caller.
const iconBase = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function BellIcon({ size = 19, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 4.2c-3 0-5.3 2.4-5.3 5.7v2.9l-1.4 2.4a.55.55 0 0 0 .47.83h12.46a.55.55 0 0 0 .47-.83l-1.4-2.4v-2.9c0-3.3-2.3-5.7-5.3-5.7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...iconBase}
      />
      <Path d="M9.7 18.4a2.3 2.3 0 0 0 4.6 0" stroke={color} strokeWidth={strokeWidth} {...iconBase} />
    </Svg>
  );
}

function PulseIcon({ size = 19, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 12.5h3.4l1.8-5.3 3 10.1 2.2-8 1.6 3.2h5" stroke={color} strokeWidth={strokeWidth} {...iconBase} />
    </Svg>
  );
}

// Settings — presented as a bottom-sheet MODAL (owner call 2026-07-17, matching
// the ChatGPT iOS app: it slides up from the bottom via the root Stack's
// presentation:"modal" on this route). Modeled on ChatGPT's account sheet: an X
// close top-right, a centered avatar/identity header, then grouped cards of
// icon + label (+ value / chevron) rows under muted section labels, with a red
// destructive block at the bottom.

const SUPPORT_EMAIL = "support@enternemesis.com";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors: c, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const modeLabel = mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System";

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const CloseButton = (
    <View style={[styles.modalTop, { paddingTop: insets.top + space(1.5) }]}>
      <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} testID="settings-close" accessibilityLabel="Close settings">
        <CloseIcon size={17} color={c.text} />
      </Pressable>
    </View>
  );

  if (!session) {
    return (
      <View style={styles.root}>
        {CloseButton}
        <View style={styles.guest}>
          <Text style={styles.guestText} testID="profile-guest">You're not signed in.</Text>
          <Pressable testID="goto-signin" style={styles.signinBtn} onPress={() => router.replace("/sign-in")}>
            <Text style={styles.signinText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const email = session.user.email ?? "";
  const metadataName = session.user.user_metadata?.full_name;
  const displayName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : email.split("@")[0]?.replace(/[._-]+/g, " ") || "Student";
  const initial = (displayName[0] ?? email[0] ?? "N").toUpperCase();

  return (
    <View style={styles.root}>
      {CloseButton}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}
        showsVerticalScrollIndicator={false}
        testID="tab-profile"
      >
        <View style={styles.hero}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Text style={styles.identityName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.identityEmail} testID="profile-email" numberOfLines={1}>{email}</Text>
            <Text style={styles.planText}>Free plan · Academic OS synced</Text>
          </View>
        </View>

        <SectionLabel styles={styles}>Account</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={MailIcon} label="Email" value={email} />
          <SettingRow styles={styles} icon={SparkleIcon} label="Subscription" value="Free" chevron last testID="nav-subscription" onPress={() => router.push("/profile/subscription")} />
        </Card>

        <SectionLabel styles={styles}>Preferences</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={SettingsIcon} label="General" chevron testID="nav-general" onPress={() => router.push("/profile/general")} />
          <SettingRow styles={styles} icon={BellIcon} label="Notifications" chevron testID="nav-notifications" onPress={() => router.push("/profile/notifications")} />
          <SettingRow styles={styles} icon={PulseIcon} label="Usage" chevron testID="nav-usage" onPress={() => router.push("/profile/usage")} />
          <SettingRow styles={styles} icon={ThemeIcon} label="Appearance" value={modeLabel} chevron last testID="nav-appearance" onPress={() => router.push("/profile/appearance")} />
        </Card>

        <SectionLabel styles={styles}>Legal</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={FileIcon} label="Terms of service" chevron testID="nav-terms" onPress={() => router.push("/profile/legal?doc=terms")} />
          <SettingRow styles={styles} icon={FileIcon} label="Privacy policy" chevron last testID="nav-privacy" onPress={() => router.push("/profile/legal?doc=privacy")} />
        </Card>

        <SectionLabel styles={styles}>Support</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={LifeRingIcon} label="Contact support" chevron last testID="nav-support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} />
        </Card>

        <View style={{ height: space(4) }} />
        <Card styles={styles}>
          <SettingRow styles={styles} icon={TrashIcon} label="Delete account" danger chevron testID="nav-delete-account" onPress={() => router.push("/profile/delete-account")} />
          <SettingRow styles={styles} icon={LogoutIcon} label="Sign out" danger last testID="signout" onPress={signOut} />
        </Card>

        <Text style={styles.version}>Nemesis {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>
    </View>
  );
}

function SectionLabel({ styles, children }: { styles: Styles; children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ styles, children }: { styles: Styles; children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SettingRow({
  styles,
  icon: Icon,
  label,
  value,
  chevron,
  danger,
  last,
  testID,
  onPress,
}: {
  styles: Styles;
  icon: ComponentType<IconProps>;
  label: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
  testID?: string;
  onPress?: () => void;
}) {
  const { colors: c } = useTheme();
  const tint = danger ? c.danger : c.text2;
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && onPress && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Icon size={19} color={tint} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: c.danger }]}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {chevron ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    modalTop: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space(4), paddingBottom: space(1) },
    closeBtn: { width: control.sm, height: control.sm, borderRadius: control.sm / 2, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },

    guest: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(6) },
    guestText: { color: c.text2, fontSize: type.small.fontSize + 1 },
    signinBtn: { backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(8) },
    signinText: { color: c.onAccent, fontSize: type.small.fontSize + 1, fontWeight: "600" },

    body: { paddingHorizontal: space(4), flexGrow: 1 },

    hero: { marginTop: space(1), marginBottom: space(2) },
    identity: { alignItems: "center", paddingHorizontal: space(4), paddingVertical: space(5), gap: space(1.5) },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { ...type.display, color: c.text },
    identityName: { ...type.h2, color: c.text, marginTop: space(1) },
    identityEmail: { color: c.text2, fontSize: type.small.fontSize, maxWidth: "90%" },
    planText: { ...type.micro, color: c.text3, marginTop: space(1.5) },

    sectionLabel: {
      color: c.text3,
      fontSize: type.micro.fontSize,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: space(4),
      marginBottom: space(1.5),
      marginLeft: space(1),
    },
    card: {
      backgroundColor: c.raised,
      borderRadius: radius.md,
      overflow: "hidden",
    },
    cardPad: { padding: space(3.5) },

    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(3.5), paddingVertical: space(3.25), minHeight: 52 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
    rowPressed: { backgroundColor: c.surface2 },
    rowIcon: {
      width: 24,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { fontSize: type.small.fontSize + 1, color: c.text },
    rowValue: { flex: 1, textAlign: "right", fontSize: type.small.fontSize, color: c.text3 },
    chevron: { fontSize: 20, color: c.text3, marginLeft: space(1) },

    version: { fontSize: type.micro.fontSize, color: c.text3, textAlign: "center", marginTop: space(5) },
  });

type Styles = ReturnType<typeof createStyles>;
