import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SlideUpSheet } from "@/components/StudySheet";
import { FileTypeIcon } from "@/components/icons-canvas";
import { fileKindFromTitle, fileKindLabel } from "@/lib/canvas-file-kind";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The "…" menu's "Uploaded files" row (IMG_6536): what this canvas's `sources` list holds —
// the material the learner attached, not the web pages an answer cited (that's SourcesSheet).
// A plain list rather than a preview: canvas-model.ts's CanvasSource carries excerpts, not a
// renderable file, so a title + kind is all there is to show today.
export function UploadedFilesSheet({ visible, onClose, titles }: { visible: boolean; onClose: () => void; titles: readonly string[] }) {
  const styles = useThemedStyles(createStyles);
  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Uploaded files" compactTitle testID="canvas-uploaded-files-sheet">
      {titles.length === 0 ? (
        <Text style={styles.empty}>No files uploaded to this canvas yet.</Text>
      ) : (
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {titles.map((title, index) => (
            <View key={`${title}-${index}`} style={[styles.row, index > 0 && styles.rowDivider]}>
              <FileTypeIcon kind={fileKindFromTitle(title)} size={28} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.title}>{title}</Text>
                <Text style={styles.kind}>{fileKindLabel(title)}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: space(4) }} />
        </ScrollView>
      )}
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    empty: { ...type.small, color: c.text3, paddingVertical: space(4) },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3) },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    copy: { flex: 1, gap: 2 },
    title: { ...type.label, color: c.text },
    kind: { ...type.micro, color: c.text2 },
  });
