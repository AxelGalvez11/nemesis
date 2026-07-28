import { StyleSheet, Text, View } from "react-native";
import { MissionButton } from "./mission-ui";
import { SlideUpSheet } from "./StudySheet";
import { nextDailyReset, type BudgetResetKind } from "@/lib/chat-thread";
import { openPricingPage } from "@/lib/pricing";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/** Owner-decided freemium moment: credits ran dry → hard stop with exactly two
 *  ways out, "Upgrade" or wait for the reset. The reset line shows a real
 *  local-clock time (the ledger rolls at UTC midnight; monthly caps on the
 *  1st) instead of a vague "tomorrow". */
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
        <MissionButton label="Wait for reset" onPress={onClose} variant="secondary" testID="upgrade-wait" />
        <MissionButton
          label="Upgrade"
          onPress={() => {
            onClose();
            openPricingPage();
          }}
          variant="primary"
          testID="upgrade-open-pricing"
        />
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
