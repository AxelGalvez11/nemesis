import { Pressable, StyleSheet, Text, View } from "react-native";
import { FileTypeIcon, RowChevronIcon } from "@/components/icons-canvas";
import { fileKindFromTitle, fileKindLabel } from "@/lib/canvas-file-kind";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// One file the learner attached to a turn — IMG_6542's card above the bubble: white, a
// hairline border, a 36pt colored file-type tile, the name (17pt, middle-ellipsised via
// numberOfLines — RN has no true middle-ellipsis, so this is the closest the platform gives
// without hand-truncating the string), the kind below it in 13pt grey. Measured off IMG_6542
// (`card_grid.png`): height ≈53pt, border ≈#E5E5E5 (== c.line at ~0.08 opacity on white),
// radius ~12. Right-aligned by the caller (CanvasTurn's attachedRow), same envelope as the
// bubble beneath it.
export function AttachedFileCard({ title }: { title: string }) {
  const styles = useThemedStyles(createStyles);
  const kind = fileKindFromTitle(title);
  return (
    <View style={styles.card} testID="canvas-attached-file-card">
      <FileTypeIcon kind={kind} size={36} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text style={styles.kind}>{fileKindLabel(title)}</Text>
      </View>
    </View>
  );
}

// A finished answer's deliverables (IMG_6559): one card, one row per output, a 20pt tile,
// the name (17pt, ellipsised) and a trailing chevron, hairline dividers between rows —
// same shape as SourcesSheet's rows, one level up. `onPress` is optional: today's callers
// (canvas.tsx) have nowhere to send a tap yet (the deck/document open flow is a later
// slice), so a row with none renders inert rather than a dead tap target that looks live.
export function DeliverableList({ titles, onPress }: { titles: readonly string[]; onPress?: (title: string) => void }) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (titles.length === 0) return null;
  return (
    <View style={styles.list} testID="canvas-deliverable-list">
      {titles.map((title, index) => {
        const kind = fileKindFromTitle(title);
        const row = (
          <View style={[styles.deliverableRow, index > 0 && styles.deliverableDivider]}>
            <FileTypeIcon kind={kind} size={20} />
            <Text numberOfLines={1} style={styles.deliverableTitle}>{title}</Text>
            <RowChevronIcon size={16} color={c.text3} />
          </View>
        );
        return onPress ? (
          <Pressable key={`${title}-${index}`} onPress={() => onPress(title)} testID={`canvas-deliverable-${index}`}>
            {row}
          </Pressable>
        ) : (
          <View key={`${title}-${index}`}>{row}</View>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      paddingHorizontal: space(4),
      paddingVertical: space(4),
      borderRadius: 12, // measured, IMG_6542
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.bg,
      maxWidth: "86%",
    },
    copy: { flex: 1, gap: 2 },
    title: { ...type.title, color: c.text },
    kind: { ...type.micro, color: c.text2 },
    list: { borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, overflow: "hidden" },
    deliverableRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3.5) },
    deliverableDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    deliverableTitle: { ...type.label, color: c.text2, flex: 1 },
  });
