import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { savePhoneSettings, type PhoneSettings } from "@/api/phoneSettings";
import { useAuth } from "@/auth/AuthProvider";
import { PageMenu, type PageMenuItem } from "@/components/nx/PageMenu";
import { Group, GroupRow, NavTrail, NxSwitch, Sec, SettingsHeader } from "@/components/nx/settings/kit";
import { usePhoneSettings } from "@/hooks/useSpace";
import { allowAlerts, setStudyReminder } from "@/lib/push";
import { useNx } from "@/theme/nx";

// Study and recording (canvas artboard "StudySettings"). Every row does something:
// - New cards per day caps how many never-studied cards join a flashcards sitting (api/study.ts reviewQueue).
// - Daily reminder is the time of the on-phone reminder (lib/push.ts); "When cards are due" turns it on or off.
// - Keep the audio: off deletes the uploaded recording once its notes are on the page (api/recording.ts).
// - When notes are ready: an alert when Nemesis finishes writing a recording's notes.
// Recording language and note style are not drawn: the server writes the transcript and the notes and takes
// neither today, so a row for them would change nothing.
// Values save to the person's own settings row (api/phoneSettings.ts). The reminder's on/off state still shares
// its store with the older profile/notifications screen so the two never disagree.

const prefsKey = (uid: string) => `nemesis_notification_prefs_v1_${uid}`;
const NEW_PER_DAY = [10, 20, 30, 50, 100];
const TIMES: [number, number][] = [
  [7, 0],
  [9, 0],
  [12, 0],
  [17, 0],
  [19, 0],
  [21, 0],
];
const clock = (h: number, m: number) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

export default function StudySettingsScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const loaded = usePhoneSettings().settings;
  const loadedKey = JSON.stringify(loaded);
  const [prefs, setPrefs] = useState<PhoneSettings>(loaded);
  const [reminder, setReminder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ open: boolean; title: string; items: PageMenuItem[] }>({ open: false, title: "", items: [] });

  // The saved values arrive with the bootstrap call; until then the defaults show.
  useEffect(() => setPrefs(JSON.parse(loadedKey) as PhoneSettings), [loadedKey]);

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

  const save = async (patch: Partial<PhoneSettings>): Promise<PhoneSettings | null> => {
    setError(null);
    const before = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await savePhoneSettings(patch);
      void qc.invalidateQueries({ queryKey: ["ws-bootstrap"] });
      return next;
    } catch (e) {
      setPrefs(before);
      setError(e instanceof Error ? e.message : "That setting did not save.");
      return null;
    }
  };

  const changeReminder = async (on: boolean, at = { hour: prefs.reminderHour, minute: prefs.reminderMinute }) => {
    if (!uid) return;
    setError(null);
    setReminder(on);
    const result = await setStudyReminder(uid, on, at);
    setReminder(result.enabled);
    if (result.error) setError(result.error);
    void SecureStore.setItemAsync(prefsKey(uid), JSON.stringify({ studyReminders: result.enabled })).catch(() => {});
  };

  const pickNewPerDay = () =>
    setPicker({
      open: true,
      title: "New cards per day",
      items: NEW_PER_DAY.map((n): PageMenuItem => ({ icon: n === prefs.newPerDay ? "check" : "cards", label: String(n), onPress: () => void save({ newPerDay: n }) })),
    });

  const pickTime = () =>
    setPicker({
      open: true,
      title: "Daily reminder",
      items: TIMES.map(
        ([h, m]): PageMenuItem => ({
          icon: h === prefs.reminderHour && m === prefs.reminderMinute ? "check" : "clock",
          label: clock(h, m),
          onPress: () =>
            void save({ reminderHour: h, reminderMinute: m }).then((next) => {
              // A reminder that is on moves to the new time.
              if (next && reminder) void changeReminder(true, { hour: h, minute: m });
            }),
        }),
      ),
    });

  const changeNotesReady = async (on: boolean) => {
    if (on && !(await allowAlerts())) {
      setError("Notifications are off for Nemesis. Turn them on in iOS Settings to get this alert.");
      return;
    }
    void save({ notesReadyAlert: on });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-study">
      <SettingsHeader title="Study and recording" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Sec label="Flashcards" style={{ paddingHorizontal: 32, paddingTop: 16 }} />
        <Group>
          <GroupRow title="New cards per day" onPress={pickNewPerDay} trail={<NavTrail value={String(prefs.newPerDay)} />} />
          <GroupRow title="Daily reminder" onPress={pickTime} trail={<NavTrail value={clock(prefs.reminderHour, prefs.reminderMinute)} />} />
        </Group>

        <Sec label="Recording" style={{ paddingHorizontal: 32, paddingTop: 24 }} />
        <Group>
          <GroupRow title="Keep the audio" trail={<NxSwitch on={prefs.keepAudio} onChange={(v) => void save({ keepAudio: v })} label="Keep the audio" />} />
        </Group>

        <Sec label="Notifications" style={{ paddingHorizontal: 32, paddingTop: 24 }} />
        <Group>
          <GroupRow title="When cards are due" trail={<NxSwitch on={reminder} onChange={(v) => void changeReminder(v)} label="When cards are due" />} />
          <GroupRow title="When notes are ready" trail={<NxSwitch on={prefs.notesReadyAlert} onChange={(v) => void changeNotesReady(v)} label="When notes are ready" />} />
        </Group>

        {error ? <Text style={{ paddingTop: 8, paddingHorizontal: 32, fontSize: 13, lineHeight: 18, color: c.danger }}>{error}</Text> : null}
      </ScrollView>
      <PageMenu anchor="bottom" visible={picker.open} title={picker.title} onClose={() => setPicker((p) => ({ ...p, open: false }))} items={picker.items} />
    </View>
  );
}
