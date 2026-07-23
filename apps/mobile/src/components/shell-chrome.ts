import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Shell geometry, in one place. With the liquid-glass redesign the TopBar is an
// OVERLAY — it no longer occupies layout space, so content scrolls underneath the
// glass (that's the whole effect). Navigation lives in the sidebar drawer (desktop
// parity, owner call 2026-07-17 — no bottom tab bar); the bottom padding is just
// safe-area breathing room.
//
// KAV contract update: the old rule was "keyboardVerticalOffset = insets.top + 58"
// because the TopBar sat ABOVE the screen in layout flow. Now that the bar is an
// overlay, (tabs) screens start at the window top, so their KeyboardAvoidingView
// offset is 0 — the top padding lives inside the scroll content instead.

/** TopBar's own height below the status-bar inset. Sized so scroll content clears
 *  the floating glass buttons, which now sit space(4) below the inset (owner: the
 *  top icons were crowding the iPhone's time/wifi) rather than the old space(1.5). */
export const TOP_BAR_H = 68;

export interface ShellPadding {
  /** Space scroll content must leave at the top so it starts below the glass TopBar. */
  contentTop: number;
  /** Bottom clearance for scroll content and composers (home indicator + breathing room). */
  contentBottom: number;
}

export function useShellPadding(): ShellPadding {
  const insets = useSafeAreaInsets();
  return {
    contentTop: insets.top + TOP_BAR_H,
    contentBottom: insets.bottom + 20,
  };
}

/** True while the software keyboard is up. Composer screens use this to drop the
 * safe-area clearance from their bottom padding — the keyboard replaces it. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** How many points the keyboard currently covers (0 when down). The
 *  rename/new-folder dialogs (RowActionSheets.tsx) center themselves in the space
 *  ABOVE it — they're inline views, not native modals, so nothing else would keep
 *  the keyboard from sitting on top of the field they're asking you to type in. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
