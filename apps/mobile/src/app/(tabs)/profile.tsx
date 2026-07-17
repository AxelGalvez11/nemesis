import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "@/auth/AuthProvider";
import { useShellPadding } from "@/components/shell-chrome";
import { SectionHeader } from "@/components/ui";
import { useCommon } from "@/theme/common";
import { accentSwatchHex, ACCENT_SWATCHES, type ThemeColors, type ThemeMode } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// Settings — deliberately small. The phone app is a dispatch remote for the Mac agent,
// so settings hold only what the phone itself owns: who you're signed in as, appearance,
// the legal documents, support, and account deletion. Everything else (plans, library,
// models) lives on the desktop app and the web account page.

interface NavRow {
  testID: string;
  label: string;
  onPress: () => void;
}

const SUPPORT_EMAIL = "support@enternemesis.com";

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const common = useCommon();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();

  if (!session) {
    return (
      <View
        style={[common.screen, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
        testID="tab-profile"
      >
        <Text style={common.h1}>Settings</Text>
        <Text testID="profile-guest" style={common.body}>You're not signed in.</Text>
        <Pressable testID="goto-signin" style={common.btn} onPress={() => router.replace("/sign-in")}>
          <Text style={common.btnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const legal: NavRow[] = [
    { testID: "nav-terms", label: "Terms of service", onPress: () => router.push("/profile/legal?doc=terms") },
    { testID: "nav-privacy", label: "Privacy policy", onPress: () => router.push("/profile/legal?doc=privacy") },
  ];
  const account: NavRow[] = [
    { testID: "nav-support", label: "Contact support", onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) },
    { testID: "nav-delete-account", label: "Delete account", onPress: () => router.push("/profile/delete-account") },
  ];

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
      testID="tab-profile"
    >
      <Text style={common.h1}>Settings</Text>
      <Text testID="profile-email" style={styles.email}>{session.user.email}</Text>

      <AppearanceGroup styles={styles} />
      <Group styles={styles} title="Legal" rows={legal} />
      <Group styles={styles} title="Account" rows={account} />

      <Pressable testID="signout" style={[common.btn, styles.signout]} onPress={signOut}>
        <Text style={common.btnText}>Sign out</Text>
      </Pressable>

      <Text style={styles.version}>Nemesis {Constants.expoConfig?.version ?? ""}</Text>
    </ScrollView>
  );
}

// Appearance: light/dark/system + the desktop's ten accent swatches. Applies
// instantly app-wide (ThemeProvider persists the choice on this phone).
function AppearanceGroup({ styles }: { styles: Styles }) {
  const { accentId, mode, setAccent, setMode } = useTheme();

  return (
    <View style={styles.group}>
      <SectionHeader title="Appearance" />
      <View style={styles.modeRow} testID="appearance-modes">
        {THEME_MODES.map((entry) => (
          <Pressable
            key={entry.id}
            testID={`mode-${entry.id}`}
            onPress={() => setMode(entry.id)}
            style={[styles.modeChip, mode === entry.id && styles.modeChipActive]}
          >
            <Text style={[styles.modeText, mode === entry.id && styles.modeTextActive]}>{entry.label}</Text>
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
            style={[
              styles.swatch,
              { backgroundColor: swatch.id === "crimson" ? "#ff2740" : accentSwatchHex(swatch.hue) },
              accentId === swatch.id && styles.swatchActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function Group({ styles, title, rows }: { styles: Styles; title: string; rows: NavRow[] }) {
  return (
    <View style={styles.group}>
      <SectionHeader title={title} />
      {rows.map((r) => (
        <Pressable key={r.testID} testID={r.testID} style={styles.row} onPress={r.onPress}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingHorizontal: space(5), gap: space(2), backgroundColor: c.bg, flexGrow: 1 },
    email: { fontSize: 15, color: c.text2, marginBottom: space(2) },
    group: { gap: 2, marginTop: space(2) },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(3.5), borderBottomWidth: 1, borderBottomColor: c.line },
    rowLabel: { fontSize: 16, color: c.text },
    chevron: { fontSize: 22, color: c.text3 },
    signout: { alignSelf: "stretch", alignItems: "center", marginTop: space(5) },
    version: { fontSize: 12, color: c.text3, textAlign: "center", marginTop: space(4) },
    modeRow: { flexDirection: "row", gap: space(2), paddingVertical: space(2) },
    modeChip: {
      paddingHorizontal: space(4),
      paddingVertical: space(2),
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.glass,
    },
    modeChipActive: { backgroundColor: c.accentFaint, borderColor: c.accentLine },
    modeText: { fontSize: 14, color: c.text2, fontWeight: "500" },
    modeTextActive: { color: c.accent },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: space(3), paddingVertical: space(2) },
    swatch: { width: 30, height: 30, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
    swatchActive: { borderColor: c.text },
  });

type Styles = ReturnType<typeof createStyles>;
