import { StyleSheet, Text, View } from "react-native";
import { MissionButton } from "./mission-ui";
import { SlideUpSheet } from "./StudySheet";
import { nextDailyReset, type BudgetResetKind } from "@/lib/chat-thread";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/** The freemium moment: credits ran dry → a hard stop that says exactly when
 *  they come back. The reset line shows a real local-clock time (the ledger
 *  rolls at UTC midnight; monthly caps on the 1st) instead of a vague
 *  "tomorrow", because "wait" is only tolerable when you know how long.
 *
 *  🔴 THIS SHEET USED TO CARRY AN "Upgrade" BUTTON THAT OPENED THE WEB PRICING
 *  PAGE. It was removed on 2026-07-29 when the app went from US-only to
 *  worldwide: Apple guideline 3.1.1(a) permits that button in the United States
 *  storefront and nowhere else, so shipping it globally is a rejection. Do not
 *  add it back — see the note in app/profile/subscription.tsx for the two
 *  lawful ways to sell from inside the app. */
export function UpgradeSheet({
  visible,
  message,
  reset,
  onClose,
}: {
  visible: boolean;
  /** The valve's student-readable line for which limit was hit, if any. */
  message: string | null;
  reset: BudgetResetKind | null;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  const resetLine =
    reset === "monthly"
      ? "Your monthly allowance resets on the 1st."
      : `Free credits reset at ${nextDailyReset(new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Out of free credits" testID="upgrade-sheet">
      <Text style={styles.message}>{message ?? "Today's AI allowance on your plan is used up."}</Text>
      <Text style={styles.reset}>{resetLine} Your chats and notes stay put either way.</Text>
      <View style={styles.buttons}>
        {/* One action, so it is the primary one. A lone "Wait for reset" button
            reads as a choice the student is making; with nothing to choose
            between, it is just an acknowledgement. */}
        <MissionButton label="OK" onPress={onClose} variant="primary" testID="upgrade-dismiss" />
      </View>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    message: { ...type.body, color: c.text, marginBottom: space(2) },
    reset: { ...type.small, color: c.text2, marginBottom: space(4) },
    buttons: { flexDirection: "row", justifyContent: "flex-end", gap: space(2) },
  });
