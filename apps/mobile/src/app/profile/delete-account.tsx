import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { deleteAccount } from "@/api/account";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState } from "@/components/states";
import { common } from "@/theme/common";

// Account deletion (AC10 / §11 "deletion must work") — REAL and irreversible. A confirm
// gate, then the account-delete edge fn service-role-deletes auth.users(uid); every owned
// table cascades and answers anonymize. On success we clear the (now-dead) local session
// and return to sign-in.
export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [confirmed, setConfirmed] = useState(false);

  const del = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await signOut();
      router.replace("/sign-in");
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.body} testID="delete-account-screen">
      <Text style={common.h1}>Delete account</Text>
      <Text style={common.body}>
        This permanently deletes your account and all associated data — your profile, health context, follows, saved
        reports, and the link to your asked questions. This cannot be undone.
      </Text>

      <Pressable testID="delete-confirm" style={styles.confirmRow} onPress={() => setConfirmed((c) => !c)}>
        <View style={[styles.checkbox, confirmed && styles.checkboxOn]}>{confirmed ? <Text style={styles.check}>✓</Text> : null}</View>
        <Text style={styles.confirmLabel}>I understand this is permanent and cannot be undone.</Text>
      </Pressable>

      {del.isError ? <ErrorState testID="delete-account-error" body={(del.error as Error).message} /> : null}

      <Pressable
        testID="request-deletion"
        style={[styles.dangerBtn, (!confirmed || del.isPending) && styles.disabled]}
        disabled={!confirmed || del.isPending}
        onPress={() => del.mutate()}
      >
        <Text style={styles.dangerText}>{del.isPending ? "Deleting…" : "Delete my account"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  confirmRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#c0392b", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#c0392b" },
  check: { color: "#fff", fontSize: 14, fontWeight: "900" },
  confirmLabel: { flex: 1, fontSize: 14, lineHeight: 20, color: "#3a4451" },
  dangerBtn: { backgroundColor: "#c0392b", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
