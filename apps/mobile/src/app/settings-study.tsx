import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { setStudyReminder } from "@/lib/push";
import { useNx } from "@/theme/nx";
import { Group, GroupRow, NxSwitch, Sec, SettingsHeader, Value } from "@/components/nx/settings/kit";

// Study and recording (canvas artboard "StudySettings").
// Only the daily reminder is real today (lib/push.ts schedules it on the phone at 7:00 PM). New
// cards per day, recording language, note style, keep the audio and "notes are ready" alerts have
// no setting anywhere behind them yet, so they are not drawn. The on/off state shares its store
// with the older profile/notifications screen so the two never disagree.

const prefsKey = (uid: string) => `nemesis_notification_prefs_v1_${uid}`;

export default function StudySettingsScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [reminder, setReminder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void SecureStore.getItemAsync(prefsKey(uid))
      .then((raw) => {
        const on = raw ? (JSON.parse(raw) as { studyReminders?: unknown }).studyReminders === true : false;
        if (alive) setReminder(on);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const change = async (next: boolean) => {
    if (!uid) return;
    setError(null);
    setReminder(next);
    const result = await setStudyReminder(uid, next);
    setReminder(result.enabled);
    setError(result.error);
    void SecureStore.setItemAsync(prefsKey(uid), JSON.stringify({ studyReminders: result.enabled })).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-study">
      <SettingsHeader title="Study and recording" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Sec label="Flashcards" style={{ paddingHorizontal: 32, paddingTop: 16 }} />
        <Group>
          <GroupRow
            title="Daily reminder"
            trail={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
                <Value text="7:00 PM" />
                <NxSwitch on={reminder} onChange={(v) => void change(v)} label="Daily reminder" />
              </View>
            }
          />
        </Group>
        {error ? (
          <Text style={{ paddingTop: 8, paddingHorizontal: 32, fontSize: 13, lineHeight: 18, color: c.danger }}>{error}</Text>
        ) : (
          <Text style={{ paddingTop: 8, paddingHorizontal: 32, fontSize: 13, lineHeight: 18, color: c.t2 }}>
            A quiet nudge each evening to review the cards that are due.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
