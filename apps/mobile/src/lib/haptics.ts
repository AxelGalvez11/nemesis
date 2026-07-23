// The app's whole vocabulary of taps, in one place.
//
// Call sites name the MOMENT ("a hold registered"), never the intensity, so the
// feel of the app can be retuned here without touching a single screen — and so
// two different moments can't drift into using the same tap by accident.
//
// Everything is fire-and-forget. A haptic is decoration: if the device has no
// Taptic engine, the user has switched system haptics off, or the call rejects
// for any reason, the app must carry on exactly as before. Nothing here is ever
// awaited and nothing here can throw into a caller.
//
// SHIPPING NOTE — this file cannot reach a phone over the air. expo-haptics
// ships native code, and app.json sets `runtimeVersion: { policy: "fingerprint" }`,
// so adding the dependency changes the fingerprint that over-the-air updates are
// matched against. Merging this to main therefore closes the OTA lane for
// EVERYTHING until a new TestFlight build ships. That is why haptics sat banked
// rather than half-built: the code was never the hard part.
import * as Haptics from "expo-haptics";

/** Run a haptic without ever letting it affect the caller. */
function fire(run: () => Promise<void>): void {
  try {
    void run().catch(() => {});
  } catch {
    // Unsupported platform or a module that failed to link — silence is right.
  }
}

/** The sidebar came open. Light, because it accompanies a big visible motion —
 *  a heavier tap on top of the panel sliding in reads as a thud. */
export function hapticDrawerOpened(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A press-and-hold registered — the row is now grabbed, or its menu is coming.
 *  Medium: this is the one moment where the tap carries real information, since
 *  nothing on screen has moved yet and this is what says "I have you". */
export function hapticHoldRegistered(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A question was sent and the model has started working. Soft — it confirms
 *  the send landed without competing with the answer that follows. */
export function hapticThinkingStarted(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** The answer finished arriving. The success notification pattern rather than a
 *  plain impact, because this is the one event the student may be waiting on
 *  with the phone face-down or their eyes elsewhere. */
export function hapticAnswerReady(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
