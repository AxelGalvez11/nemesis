import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SlideUpSheet } from "./StudySheet";
import type { ChatSource } from "@/lib/chat-thread";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Compact "Sources · N" pill under an assistant message (chat.tsx) plus the
// bottom-up sheet it opens. Replaces the previous per-source chip row (one
// tappable chip per citation, each opening the browser directly) with the
// owner's spec: ONE pill, tap opens a SlideUpSheet listing every source as a
// row (title + domain, favicon-less), and tapping a ROW opens it.
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
        {sources.map((source, index) => (
          <Pressable
            key={`${source.url}-${index}`}
            style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}
            onPress={() => void Linking.openURL(source.url).catch(() => {})}
            testID={`chat-sources-sheet-row-${index}`}
          >
            <Text style={styles.rowTitle} numberOfLines={2}>{source.title.trim() || hostnameOf(source.url)}</Text>
            <Text style={styles.rowDomain}>{hostnameOf(source.url)}</Text>
          </Pressable>
        ))}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

/** Bare hostname for a row's domain line — dependency-free, can't throw on a
 *  malformed url (falls back to the raw string). Ported from chat.tsx, which
 *  used it per-chip before this pill+sheet replaced that row. */
export function hostnameOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(url);
  return (match?.[1] ?? url).replace(/^www\./, "");
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
    list: { maxHeight: 420 },
    row: { paddingVertical: space(3) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowTitle: { ...type.bodyStrong, color: c.text },
    rowDomain: { ...type.micro, color: c.text3, marginTop: 2 },
  });
