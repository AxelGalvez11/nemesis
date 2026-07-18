import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import type { LibraryDoc } from "@/lib/library-sync";
import { buildNoteResolver, isWikilinkUrl, preprocessWikilinks, resolveWikilinkUrl } from "@/lib/wikilinks";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// Read-only note view: decrypts one cached library doc and renders its markdown.
// No editor, no actions — the Mac agent is the only author. Everything renders from
// the local ciphertext cache, so an already-opened library works fully offline.
// [[wikilinks]] are tappable: preprocessed into markdown links and resolved against
// every synced note (by title / basename / path) to jump between notes.

export default function NoteScreen() {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const params = useLocalSearchParams<{ ph?: string }>();
  const pathHash = Array.isArray(params.ph) ? params.ph[0] : params.ph;
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<(LibraryDoc & { pathHash: string }) | null | undefined>(undefined);
  const [resolver, setResolver] = useState<Map<string, string>>(() => new Map());

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
      const notes = docs.filter((d) => d.kind === "note");
      setResolver(buildNoteResolver(notes.map((d) => ({ title: d.title, path: d.path, pathHash: d.pathHash }))));
      // kind guard at the data boundary: deck/calendar docs ride the same pipe
      // and must never render as notes, whatever route delivered the pathHash.
      setDoc(notes.find((d) => d.pathHash === pathHash) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [pathHash]);

  const rendered = useMemo(() => (doc ? preprocessWikilinks(doc.content) : ""), [doc]);
  // Wikilinks open the target note; unresolved ones are swallowed; real URLs open
  // in the browser (return true = let markdown-display's default handler run).
  const onLinkPress = (url: string): boolean => {
    const targetHash = resolveWikilinkUrl(url, resolver);
    if (targetHash) {
      router.push({ pathname: "/note", params: { ph: targetHash } });
      return false;
    }
    if (isWikilinkUrl(url)) return false;
    void Linking.openURL(url).catch(() => {});
    return false;
  };

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
          <Markdown style={markdownStyles} onLinkPress={onLinkPress}>{rendered}</Markdown>
          <View style={{ height: space(10) }} />
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    topRow: { paddingHorizontal: space(3), paddingBottom: space(2) },
    backBtn: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { ...type.bodyStrong, color: c.text2 },
    body: { paddingHorizontal: space(5) },
    title: { ...type.h1, color: c.text, marginBottom: space(1) },
    meta: { ...type.micro, color: c.text2, marginBottom: space(4) },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
  });
