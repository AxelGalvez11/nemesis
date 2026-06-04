import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { SectionHeader } from "@/components/ui";
import { common } from "@/theme/common";

// Profile hub (doc-06 Profile/Settings · §12). Account identity + the AC10 affordances:
// My Health Context (real CRUD), subscription, the three legal screens, data export +
// account deletion, and support. Guests get a sign-in affordance.

interface NavRow {
  testID: string;
  label: string;
  onPress: () => void;
}

export default function ProfileTab() {
  const { session, signOut } = useAuth();

  if (!session) {
    return (
      <View style={common.screen} testID="tab-profile">
        <Text style={common.h1}>Profile</Text>
        <Text testID="profile-guest" style={common.body}>Browsing as guest.</Text>
        <Pressable testID="goto-signin" style={common.btn} onPress={() => router.replace("/sign-in")}>
          <Text style={common.btnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const account: NavRow[] = [
    { testID: "nav-health-context", label: "My Health Context", onPress: () => router.push("/profile/health-context") },
    { testID: "nav-subscription", label: "Subscription", onPress: () => router.push("/profile/subscription") },
  ];
  const legal: NavRow[] = [
    { testID: "nav-privacy", label: "Privacy policy", onPress: () => router.push("/profile/legal?doc=privacy") },
    { testID: "nav-terms", label: "Terms of service", onPress: () => router.push("/profile/legal?doc=terms") },
    { testID: "nav-disclaimer", label: "Educational disclaimer", onPress: () => router.push("/profile/legal?doc=disclaimer") },
  ];
  const data: NavRow[] = [
    { testID: "nav-export", label: "Export your data", onPress: () => router.push("/profile/export") },
    { testID: "nav-delete-account", label: "Delete account", onPress: () => router.push("/profile/delete-account") },
    { testID: "nav-support", label: "Contact support", onPress: () => Linking.openURL("mailto:support@pharmabro.app").catch(() => {}) },
  ];

  return (
    <ScrollView contentContainerStyle={styles.body} testID="tab-profile">
      <Text style={common.h1}>Profile</Text>
      <Text testID="profile-email" style={styles.email}>{session.user.email}</Text>

      <Group title="Account" rows={account} />
      <Group title="Legal" rows={legal} />
      <Group title="Your data" rows={data} />

      <Pressable testID="signout" style={[common.btn, styles.signout]} onPress={signOut}>
        <Text style={common.btnText}>Sign out</Text>
      </Pressable>
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
  body: { padding: 20, gap: 8 },
  email: { fontSize: 15, color: "#4a5562", marginBottom: 8 },
  group: { gap: 2, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eceff3" },
  rowLabel: { fontSize: 16, color: "#1f2933" },
  chevron: { fontSize: 22, color: "#9aa4b2" },
  signout: { alignSelf: "stretch", alignItems: "center", marginTop: 20 },
});
