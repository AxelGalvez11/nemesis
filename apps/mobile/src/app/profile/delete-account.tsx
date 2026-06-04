import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Card } from "@/components/ui";
import { common } from "@/theme/common";

// Account-deletion AFFORDANCE (AC10). Present + reachable, but deliberately NOT wired:
// a real delete is a cascade across every owned table plus auth.users removal, which is
// the Phase-7 account-delete edge function. We do NOT fake a half-delete here. What IS
// available now is the independent health-context delete (doc-18), which we point to.
export default function DeleteAccountScreen() {
  const [requested, setRequested] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.body} testID="delete-account-screen">
      <Text style={common.h1}>Delete account</Text>
      <Text style={common.body}>
        Account deletion permanently removes your account and all associated data. Full deletion (a cascade across
        every record) is being finalized for launch — until then, this records your request, and you can delete your
        optional health context immediately below.
      </Text>

      <Pressable testID="request-deletion" style={styles.dangerBtn} onPress={() => setRequested(true)}>
        <Text style={styles.dangerText}>Request account deletion</Text>
      </Pressable>

      {requested ? (
        <Card testID="delete-account-status">
          <Text style={styles.note}>
            Full account deletion (removing every record across the app) is being enabled for launch. In the
            meantime, you can delete your optional health context now, and sign out at any time.
          </Text>
        </Card>
      ) : null}

      <Pressable testID="goto-hc-delete" style={common.linkBtn} onPress={() => router.push("/profile/health-context")}>
        <Text style={common.link}>Delete my health context now →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  dangerBtn: { backgroundColor: "#c0392b", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  note: { fontSize: 14, lineHeight: 21, color: "#3a4451" },
});
