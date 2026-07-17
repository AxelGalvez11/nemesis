import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "@/auth/AuthProvider";
import { SectionHeader } from "@/components/ui";
import { common } from "@/theme/common";
import { c, space } from "@/theme/tokens";

// Settings — deliberately small. The phone app is a dispatch remote for the Mac agent,
// so settings hold only what the phone itself owns: who you're signed in as, the legal
// documents, support, and account deletion. Everything else (plans, library, models)
// lives on the desktop app and the web account page.

interface NavRow {
  testID: string;
  label: string;
  onPress: () => void;
}

const SUPPORT_EMAIL = "support@enternemesis.com";

export default function SettingsScreen() {
  const { session, signOut } = useAuth();

  if (!session) {
    return (
      <View style={common.screen} testID="tab-profile">
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
    <ScrollView contentContainerStyle={styles.body} testID="tab-profile">
      <Text style={common.h1}>Settings</Text>
      <Text testID="profile-email" style={styles.email}>{session.user.email}</Text>

      <Group title="Legal" rows={legal} />
      <Group title="Account" rows={account} />

      <Pressable testID="signout" style={[common.btn, styles.signout]} onPress={signOut}>
        <Text style={common.btnText}>Sign out</Text>
      </Pressable>

      <Text style={styles.version}>Nemesis {Constants.expoConfig?.version ?? ""}</Text>
    </ScrollView>
  );
}

function Group({ title, rows }: { title: string; rows: NavRow[] }) {
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

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(2), backgroundColor: c.bg, flexGrow: 1 },
  email: { fontSize: 15, color: c.text2, marginBottom: space(2) },
  group: { gap: 2, marginTop: space(2) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(3.5), borderBottomWidth: 1, borderBottomColor: c.line },
  rowLabel: { fontSize: 16, color: c.text },
  chevron: { fontSize: 22, color: c.text3 },
  signout: { alignSelf: "stretch", alignItems: "center", marginTop: space(5) },
  version: { fontSize: 12, color: c.text3, textAlign: "center", marginTop: space(4) },
});
