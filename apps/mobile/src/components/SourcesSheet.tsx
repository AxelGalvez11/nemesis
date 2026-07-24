import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SlideUpSheet } from "./StudySheet";
import type { ChatSource } from "@/lib/chat-thread";
import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Two entry points, one sheet:
//   • the footer "Sources · N" pill under an answer (all of the turn's sources), and
//   • an inline citation pill tapped mid-answer (just the sources it grouped).
// Both open this bottom-up SlideUpSheet, which lists each source as a card —
// favicon + short name, title, and the search snippet — the touch equivalent of
// web's hover card (source-pill.tsx). Favicons are safe here because a sheet row
// is a block <View>, so a fixed-size remote <Image> lays out normally (unlike the
// inline pill, where nesting an image in flowing text is the fragile part).

/** Fixed favicon box — a remote <Image> needs an explicit size in RN or it
 *  collapses to zero (the MarkdownImage landmine). */
const FAVICON_SIZE = 16;

export function SourcesPill({ count, onPress }: { count: number; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]} onPress={onPress} testID="chat-sources-pill">
      <Text style={styles.pillText}>Sources · {count}</Text>
    </Pressable>
  );
}

export function SourcesSheet({ visible, onClose, sources }: { visible: boolean; onClose: () => void; sources: ChatSource[] }) {
  const styles = useThemedStyles(createStyles);
  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={`Sources · ${sources.length}`} testID="chat-sources-sheet">
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {sources.map((source, index) => {
          const host = hostnameOf(source.url);
          const name = sourceLabel(source.url) ?? host ?? "Source";
          return (
            <Pressable
              key={`${source.url}-${index}`}
              style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}
              onPress={() => void Linking.openURL(source.url).catch(() => {})}
              testID={`chat-sources-sheet-row-${index}`}
            >
              <View style={styles.eyebrow}>
                {host ? (
                  <Image source={{ uri: faviconUrl(host, 64) }} style={styles.favicon} accessibilityIgnoresInvertColors />
                ) : null}
                <Text style={styles.eyebrowText} numberOfLines={1}>{name}</Text>
              </View>
              <Text style={styles.rowTitle} numberOfLines={2}>{source.title.trim() || host || source.url}</Text>
              {source.description.trim() ? (
                <Text style={styles.rowSnippet} numberOfLines={3}>{source.description.trim()}</Text>
              ) : null}
            </Pressable>
          );
        })}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    pill: {
      alignSelf: "flex-start",
      marginTop: space(1.5),
      marginHorizontal: space(0.5),
      paddingVertical: space(1),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      backgroundColor: c.surface,
    },
    pillPressed: { backgroundColor: c.surface2 },
    pillText: { ...type.small, color: c.text2 },
    // No height cap of its own — SlideUpSheet's body owns the sheet height
    // (collapsed cap + drag-up-to-expand, owner 2026-07-21). flexShrink lets
    // the scroll area compress to the body's animated maxHeight instead of
    // overflowing it.
    list: { flexShrink: 1 },
    row: { paddingVertical: space(3) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    // Favicon + short name eyebrow, echoing the stacked sources in web's card.
    eyebrow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
    favicon: { width: FAVICON_SIZE, height: FAVICON_SIZE, borderRadius: FAVICON_SIZE / 2, marginRight: space(1.5) },
    eyebrowText: { ...type.micro, color: c.text3, flexShrink: 1 },
    rowTitle: { ...type.bodyStrong, color: c.text },
    rowSnippet: { ...type.small, color: c.text2, marginTop: 3 },
  });
