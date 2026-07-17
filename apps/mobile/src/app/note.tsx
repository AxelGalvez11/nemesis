import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import type { LibraryDoc } from "@/lib/library-sync";
import { space, type } from "@/theme/tokens";
import tokens from "@/theme/tokens.json";

// Read-only note view: decrypts one cached library doc and renders its markdown.
// No editor, no actions — the Mac agent is the only author. Everything renders from
// the local ciphertext cache, so an already-opened library works fully offline.

const { colors, radius } = tokens;

export default function NoteScreen() {
  const params = useLocalSearchParams<{ ph?: string }>();
  const pathHash = Array.isArray(params.ph) ? params.ph[0] : params.ph;
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<(LibraryDoc & { pathHash: string }) | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [key, cache] = await Promise.all([loadVaultKey(), loadCachedRows()]);
      if (!alive) return;
      if (!key || !pathHash) {
        setDoc(null);
        return;
      }
      const { docs } = decryptLibrary(cache, key);
      setDoc(docs.find((d) => d.pathHash === pathHash) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [pathHash]);

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="note-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="note-back" style={styles.backBtn}>
          <Text style={styles.backText}>‹ Library</Text>
        </Pressable>
      </View>
      {doc === undefined ? null : doc === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Note unavailable" body="It may have been deleted on your Mac, or this phone needs re-pairing." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.meta}>
            {doc.path}
            {doc.mtime ? ` · synced from your Mac` : ""}
          </Text>
          <Markdown style={markdownStyles}>{doc.content}</Markdown>
          <View style={{ height: space(10) }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  topRow: { paddingHorizontal: space(3), paddingBottom: space(2) },
  backBtn: { alignSelf: "flex-start", paddingVertical: space(1) },
  backText: { ...type.bodyStrong, color: colors.muted },
  body: { paddingHorizontal: space(5) },
  title: { ...type.h1, color: colors.foreground, marginBottom: space(1) },
  meta: { ...type.micro, color: colors.muted, marginBottom: space(4) },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
});

// react-native-markdown-display style map, tuned to the Nemesis dark tokens.
const markdownStyles = {
  body: { color: colors.foreground, fontSize: 15.5, lineHeight: 24 },
  heading1: { color: colors.foreground, fontSize: 24, lineHeight: 30, fontWeight: "700", marginTop: 18, marginBottom: 6 },
  heading2: { color: colors.foreground, fontSize: 20, lineHeight: 26, fontWeight: "700", marginTop: 16, marginBottom: 4 },
  heading3: { color: colors.foreground, fontSize: 17, lineHeight: 23, fontWeight: "600", marginTop: 12, marginBottom: 2 },
  strong: { fontWeight: "700" as const },
  link: { color: colors.accent },
  blockquote: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.accentBorder,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.card,
  },
  code_inline: {
    backgroundColor: colors.surface,
    color: colors.foreground,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: "Menlo",
    fontSize: 13.5,
  },
  code_block: {
    backgroundColor: colors.surface,
    color: colors.foreground,
    borderRadius: radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: "Menlo",
    fontSize: 13,
  },
  fence: {
    backgroundColor: colors.surface,
    color: colors.foreground,
    borderRadius: radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: "Menlo",
    fontSize: 13,
  },
  table: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.card },
  th: { padding: 8, color: colors.foreground, fontWeight: "700" as const },
  td: { padding: 8, color: colors.foreground },
  tr: { borderColor: colors.border, borderBottomWidth: 1 },
  bullet_list_icon: { color: colors.muted },
  ordered_list_icon: { color: colors.muted },
  hr: { backgroundColor: colors.border, height: 1 },
} as const;
