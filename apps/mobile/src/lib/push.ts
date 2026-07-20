import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
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

/** Request permission (soft-fail if denied) and upsert this device's Expo push
 * token into `devices`. Call after a session exists (AuthProvider). Push tokens
 * don't work in the simulator or Expo Go — real verification is a physical-device
 * step, out of scope here; this function still runs safely there, it just
 * returns early via `Device.isDevice`. */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

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

/** Route a notification tap to the app's home. Cloud-first phone (owner call
 * 2026-07-20): Mac-dispatch missions — and the mission detail screen a push used
 * to deep-link into — are retired (docs/design/nemesis-cloud-first-phone-2026-07.md
 * §10), so every notification tap now just opens home; home itself redirects to
 * /chat. Wired once at app root (root _layout.tsx), independent of auth state, so
 * a tap always navigates somewhere useful. */
export function setupPushResponseRouting(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(() => {
    router.push("/" as never);
  });
  return () => sub.remove();
}
