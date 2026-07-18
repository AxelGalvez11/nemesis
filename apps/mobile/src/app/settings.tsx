import type { ComponentType } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  SparkleIcon,
  TrashIcon,
} from "@/components/icons";
import { accentSwatchHex, ACCENT_SWATCHES, type ThemeColors, type ThemeMode } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// Settings — presented as a bottom-sheet MODAL (owner call 2026-07-17, matching
// the ChatGPT iOS app: it slides up from the bottom via the root Stack's
// presentation:"modal" on this route). Modeled on ChatGPT's account sheet: an X
// close top-right, a centered avatar/identity header, then grouped cards of
// icon + label (+ value / chevron) rows under muted section labels, with a red
// destructive block at the bottom.

const SUPPORT_EMAIL = "support@enternemesis.com";

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

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
  const initial = (email[0] ?? "N").toUpperCase();

  return (
    <View style={styles.root}>
      {CloseButton}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}
        showsVerticalScrollIndicator={false}
        testID="tab-profile"
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.identityEmail} testID="profile-email" numberOfLines={1}>{email}</Text>
        </View>

        <SectionLabel styles={styles}>Account</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={MailIcon} label="Email" value={email} last />
        </Card>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={SparkleIcon} label="Subscription" value="Free" last />
        </Card>

        <SectionLabel styles={styles}>Appearance</SectionLabel>
        <AppearanceCard styles={styles} />

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

function AppearanceCard({ styles }: { styles: Styles }) {
  const { accentId, mode, setAccent, setMode } = useTheme();
  return (
    <View style={[styles.card, styles.cardPad]}>
      <View style={styles.segment} testID="appearance-modes">
        {THEME_MODES.map((entry) => (
          <Pressable
            key={entry.id}
            testID={`mode-${entry.id}`}
            onPress={() => setMode(entry.id)}
            style={[styles.segmentItem, mode === entry.id && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, mode === entry.id && styles.segmentTextActive]}>{entry.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.swatchRow} testID="appearance-accents">
        {ACCENT_SWATCHES.map((swatch) => (
          <Pressable
            key={swatch.id}
            testID={`accent-${swatch.id}`}
            accessibilityLabel={`${swatch.label} accent`}
            onPress={() => setAccent(swatch.id)}
            style={styles.swatchCell}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: swatch.id === "crimson" ? "#ff2740" : accentSwatchHex(swatch.hue) },
                accentId === swatch.id && styles.swatchActive,
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    modalTop: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space(4), paddingBottom: space(1) },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },

    guest: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(6) },
    guestText: { color: c.text2, fontSize: 16 },
    signinBtn: { backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(8) },
    signinText: { color: c.onAccent, fontSize: 16, fontWeight: "600" },

    body: { paddingHorizontal: space(4), flexGrow: 1 },

    identity: { alignItems: "center", paddingTop: space(1), paddingBottom: space(5), gap: space(2.5) },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentFaint, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.accentLine },
    avatarText: { color: c.accent, fontSize: 28, fontWeight: "700" },
    identityEmail: { color: c.text, fontSize: 17, fontWeight: "600", maxWidth: "90%" },

    sectionLabel: { color: c.text3, fontSize: 12.5, fontWeight: "600", marginTop: space(4), marginBottom: space(1.5), marginLeft: space(1) },
    card: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    cardPad: { padding: space(3.5) },

    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(3.5), paddingVertical: space(3.25), minHeight: 52 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
    rowPressed: { backgroundColor: c.surface2 },
    rowIcon: { width: 22, alignItems: "center" },
    rowLabel: { fontSize: 16, color: c.text },
    rowValue: { flex: 1, textAlign: "right", fontSize: 15, color: c.text3 },
    chevron: { fontSize: 20, color: c.text3, marginLeft: space(1) },

    version: { fontSize: 12, color: c.text3, textAlign: "center", marginTop: space(5) },

    segment: { flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.sm, padding: 3, gap: 3 },
    segmentItem: { flex: 1, paddingVertical: space(2), alignItems: "center", borderRadius: radius.sm - 2 },
    segmentItemActive: { backgroundColor: c.accentFaint },
    segmentText: { fontSize: 14, color: c.text2, fontWeight: "600" },
    segmentTextActive: { color: c.accent },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", marginTop: space(3) },
    swatchCell: { width: "20%", alignItems: "center", paddingVertical: space(2) },
    swatch: { width: 30, height: 30, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
    swatchActive: { borderColor: c.text },
  });

type Styles = ReturnType<typeof createStyles>;
