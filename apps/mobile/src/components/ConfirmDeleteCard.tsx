import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { PendingDelete } from "@nemesis/shared";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/**
 * The tap that has to happen before the chat deletes anything.
 *
 * `agent-tools.test.ts` carried a decision for months — "deleting is
 * deliberately not on offer... there is no confirm step inside a chat turn. If
 * this ever fails, the confirm has to come first." Deletion shipped on
 * 2026-07-31 with guardrails standing in for a confirm; the owner asked for the
 * real one the same day. This is it, and the guardrails all stay.
 *
 * Three deliberate choices about how it reads:
 *
 * 1. It names the THING, not the operation. "Delete the note “Pharm Ch. 4”?"
 *    rather than "Confirm delete_library_note" — the student is checking that
 *    the model understood them, and only the target tells them that.
 * 2. Keep is on the left and styled as the ordinary button; Delete is on the
 *    right and is the only red thing on the screen. The safe option should be
 *    the one your thumb lands on by accident.
 * 3. Whether it can be undone is stated on the card, not in the reply above it.
 *    A note goes to trash and a flashcard does not, and that difference is the
 *    single most useful fact at the moment of deciding.
 */
export function ConfirmDeleteCard({
  busy,
  onCancel,
  onConfirm,
  pending,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pending: PendingDelete;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityRole="alert" style={styles.card} testID="confirm-delete-card">
      <Text style={styles.question}>Delete {pending.target}?</Text>
      <Text style={styles.detail}>
        {pending.recoverable
          ? "It moves to your trash, so you can get it back."
          : "This cannot be undone."}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Keep it"
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [styles.button, styles.keep, pressed && styles.pressed]}
          testID="confirm-delete-keep"
        >
          <Text style={styles.keepText}>Keep</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete ${pending.target}`}
          accessibilityRole="button"
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [styles.button, styles.delete, pressed && styles.pressed]}
          testID="confirm-delete-confirm"
        >
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.deleteText}>Delete</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      alignSelf: "stretch",
      backgroundColor: c.surface2,
      borderColor: c.warnLine,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: space(1.5),
      marginTop: space(2),
      padding: space(3.5),
    },
    question: { ...type.body, color: c.text, fontWeight: "600" },
    detail: { ...type.small, color: c.text2 },
    actions: { flexDirection: "row", gap: space(2), justifyContent: "flex-end", marginTop: space(1) },
    button: {
      alignItems: "center",
      borderRadius: radius.md,
      justifyContent: "center",
      minHeight: 40,
      minWidth: 92,
      paddingHorizontal: space(4),
    },
    keep: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1 },
    keepText: { ...type.body, color: c.text },
    // The only red on the screen, and on the side a thumb reaches deliberately.
    delete: { backgroundColor: c.danger },
    deleteText: { ...type.body, color: "#fff", fontWeight: "600" },
    pressed: { opacity: 0.75 },
  });
