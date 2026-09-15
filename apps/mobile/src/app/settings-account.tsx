import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { purchasesAvailable, restorePurchases } from "@/lib/purchases";
import { useNx } from "@/theme/nx";
import {
  Avatar,
  FIELDS,
  Group,
  GroupRow,
  LEVELS,
  NavTrail,
  Pill,
  Sec,
  SettingsHeader,
  usePlan,
  useSettingsProfile,
} from "@/components/nx/settings/kit";
import { ChoiceSheet } from "@/components/nx/settings/ChoiceSheet";

// Account and subscription (canvas artboard "Account"). Name, field and level are saved on the
// Supabase account (user_metadata: full_name, field_of_study, study_level), so they follow the
// student to the web and onboarding reads the same keys.

export default function AccountScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { name, fullName, email, initial, field, level } = useSettingsProfile();
  const plan = usePlan();
  const [busy, setBusy] = useState(false);
  // Studying and Where you study open the app's own sheet, not the iOS action sheet.
  const [choosing, setChoosing] = useState<"field" | "level" | null>(null);

  const save = async (data: Record<string, string>) => {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) Alert.alert("Couldn't save that", "Check your connection and try again.");
  };

  const editName = () =>
    Alert.prompt(
      "Your name",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (value?: string) => {
            const next = (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
            if (next) void save({ full_name: next });
          },
        },
      ],
      "plain-text",
      fullName ?? "",
    );

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const result = await restorePurchases();
    setBusy(false);
    if (result) {
      void plan.refetch();
      Alert.alert("Purchases restored", "Nemesis Pro is active on this account.");
    } else {
      Alert.alert("Nothing to restore", "We couldn't find a Nemesis subscription for this Apple ID.");
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-account">
      <SettingsHeader title="Account" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", gap: 6, paddingTop: 18, paddingBottom: 6 }}>
          <Avatar initial={initial} size={76} fontSize={28} />
          <Text style={{ color: c.t1, fontSize: 20, fontWeight: "600", marginTop: 6 }}>{name}</Text>
          <Text style={{ color: c.t2, fontSize: 15, lineHeight: 18 }}>{email}</Text>
        </View>

        <Sec label="Profile" style={{ paddingHorizontal: 32 }} />
        <Group>
          <GroupRow title="Name" trail={<NavTrail value={fullName ?? "Add"} />} onPress={editName} />
          <GroupRow
            title="Studying"
            trail={<NavTrail value={field ?? "Choose"} />}
            onPress={() => setChoosing("field")}
          />
          <GroupRow
            title="Where you study"
            trail={<NavTrail value={level ?? "Choose"} />}
            onPress={() => setChoosing("level")}
          />
        </Group>
        <ChoiceSheet
          visible={choosing === "field"}
          title="What do you study?"
          options={FIELDS}
          selected={field}
          onPick={(v) => void save({ field_of_study: v })}
          onClose={() => setChoosing(null)}
        />
        <ChoiceSheet
          visible={choosing === "level"}
          title="Where do you study?"
          options={LEVELS}
          selected={level}
          onPick={(v) => void save({ study_level: v })}
          onClose={() => setChoosing(null)}
        />

        <Sec label="Subscription" style={{ paddingHorizontal: 32 }} />
        <Group>
          <GroupRow
            title="Plan"
            meta={plan.paid ? "Nemesis Pro" : "Free"}
            trail={plan.paid ? undefined : <View style={{ minHeight: 44, justifyContent: "center" }}><Pill label="See plans" onPress={() => router.push("/settings-upgrade" as never)} /></View>}
          />
          {purchasesAvailable() ? (
            <GroupRow title={busy ? "Restoring..." : "Restore purchases"} trail={<NavTrail />} onPress={() => void restore()} />
          ) : null}
        </Group>

        <Group style={{ marginTop: 22 }}>
          <GroupRow title="Sign out" onPress={() => void doSignOut()} />
          <GroupRow title="Delete account" titleColor={c.danger} onPress={() => router.push("/profile/delete-account" as never)} />
        </Group>
      </ScrollView>
    </View>
  );
}
