import { useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SlideUpSheet } from "./StudySheet";
import type { ChatSource } from "@/lib/chat-thread";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

export function SourcesPill({
  sources,
  onPress,
}: {
  sources: ChatSource[];
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={`Sources, ${sources.length}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      testID="chat-sources-pill"
    >
      <View style={styles.faviconStack}>
        {sources.slice(0, 3).map((source, index) => (
          <View key={`${source.url}-${index}`} style={[styles.stackIcon, index > 0 && styles.stackOverlap]}>
            <SourceFavicon source={source} size={22} />
          </View>
        ))}
      </View>
      <Text style={styles.pillText}>Sources</Text>
    </Pressable>
  );
}

export function SourcesSheet({
  visible,
  onClose,
  sources,
}: {
  visible: boolean;
  onClose: () => void;
  sources: ChatSource[];
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <SlideUpSheet
      compactTitle
      headerDivider
      hideClose
      onClose={onClose}
      title="Sources"
      visible={visible}
      testID="chat-sources-sheet"
    >
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {sources.map((source, index) => (
          <Pressable
            key={`${source.url}-${index}`}
            onPress={() => void Linking.openURL(source.url).catch(() => {})}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
            testID={`chat-sources-sheet-row-${index}`}
          >
            <SourceFavicon source={source} size={24} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowSite} numberOfLines={1}>{hostnameOf(source.url)}</Text>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {source.title.trim() || hostnameOf(source.url)}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </SlideUpSheet>
  );
}

function SourceFavicon({ source, size }: { source: ChatSource; size: number }) {
  const styles = useThemedStyles(createStyles);
  const [failed, setFailed] = useState(false);
  const uri = faviconOf(source.url);
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    return (
      <View style={[styles.faviconFallback, { borderRadius: size / 2, height: size, width: size }]}>
        <Text style={styles.faviconLetter}>{hostnameOf(source.url).slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <Image
      onError={() => setFailed(true)}
      source={{ uri }}
      style={[styles.favicon, { borderRadius: size / 2, height: size, width: size }]}
    />
  );
}

export function hostnameOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(url);
  return (match?.[1] ?? url).replace(/^www\./, "");
}

function faviconOf(url: string): string | null {
  const match = /^(https?):\/\/(?:[^/@]*@)?([^/:?#]+)/i.exec(url);
  return match ? `${match[1]}://${match[2]}/favicon.ico` : null;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    pill: {
      alignSelf: "flex-start",
      marginTop: space(1.5),
      marginHorizontal: space(0.5),
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingVertical: space(0.75),
      paddingHorizontal: space(2),
      borderRadius: radius.pill,
      backgroundColor: c.surface,
    },
    pillPressed: { backgroundColor: c.surface2 },
    pillText: { ...type.small, color: c.textHint, fontWeight: "600" },
    faviconStack: { flexDirection: "row", alignItems: "center" },
    stackIcon: {
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: c.bg,
      overflow: "hidden",
    },
    stackOverlap: { marginLeft: -7 },
    favicon: { backgroundColor: c.surface2 },
    faviconFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.text,
    },
    faviconLetter: { ...type.micro, color: c.bg, fontWeight: "700" },
    list: { flexShrink: 1 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(3),
      paddingVertical: space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowCopy: { flex: 1, gap: 2 },
    rowSite: { ...type.small, color: c.text },
    rowTitle: { ...type.body, color: c.text, fontWeight: "600" },
  });
