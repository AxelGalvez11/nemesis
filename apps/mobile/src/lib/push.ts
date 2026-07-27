import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { supabase } from "@/api/supabase";

// Push registration + routing. Expo's push service needs no server secret — the
// device token itself is the capability, so a future server-side sender can push
// straight from Node with nothing but the token the phone uploads here.
// Registration is entirely best-effort: a denied permission or a failed upsert
// must never block sign-in or app usage.

// Foreground handler: show the banner even while the app is open, no sound/badge —
// a quiet notification, not an urgent alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const studyReminderKey = (uid: string) => `nemesis_study_reminder_notification_v1_${uid}`;

/** Enable/disable the student's real on-device daily study reminder.
 * Permission is requested only after the explicit ON tap in Settings. */
export async function setStudyReminder(uid: string, enabled: boolean): Promise<{ enabled: boolean; error: string | null }> {
  try {
    const existingId = await SecureStore.getItemAsync(studyReminderKey(uid));
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
      await SecureStore.deleteItemAsync(studyReminderKey(uid)).catch(() => {});
    }
    if (!enabled) return { enabled: false, error: null };

    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      return { enabled: false, error: "Notifications are off for Nemesis. Enable them in iOS Settings to use study reminders." };
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        body: "Review what is due, then do one focused study block.",
        data: { destination: "study" },
        title: "Ready for a quick review?",
      },
      trigger: {
        hour: 19,
        minute: 0,
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
      },
    });
    await SecureStore.setItemAsync(studyReminderKey(uid), id);
    return { enabled: true, error: null };
  } catch {
    return { enabled: false, error: "Nemesis couldn't schedule that reminder. Try again." };
  }
}

/** Upsert this device's Expo push token when notification permission has already
 * been granted. Permission is requested only from an explicit Settings action.
 * Push tokens don't work in the simulator or Expo Go — real verification is a
 * physical-device step; this function safely returns early there. */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    if (!existing.granted) return;

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return;

    await supabase.from("devices").upsert(
      {
        user_id: userData.user.id,
        kind: "ios",
        name: Device.deviceName ?? "iPhone",
        expo_push_token: pushToken,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind,name" },
    );
  } catch {
    // Best-effort by design — see module comment.
  }
}

/** Route study reminders to Study and other notifications to home. Wired once
 * at app root, independent of auth state. */
export function setupPushResponseRouting(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const destination = response.notification.request.content.data?.destination;
    router.push(destination === "study" ? ("/study" as never) : ("/" as never));
  });
  return () => sub.remove();
}
