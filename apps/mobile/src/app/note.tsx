import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import type { LibraryDoc } from "@/lib/library-sync";
import { buildNoteResolver, isExternalUrl, preprocessWikilinks, resolveInternalHref } from "@/lib/wikilinks";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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
  // Transient "couldn't find that note" line — a tap on an internal link that
  // resolves to no synced note (the old silent dead-tap the owner reported).
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);
  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  // Any in-note link — a [[wikilink]] OR a bare relative markdown link — opens the
  // target note when it resolves to something synced. Real web links open in the
  // browser; an internal link that matches no synced note flashes a notice rather
  // than doing nothing. (return false = we handled it; don't let the default open.)
  const onLinkPress = useCallback(
    (url: string): boolean => {
      const targetHash = resolveInternalHref(url, resolver);
      if (targetHash) {
        router.push({ pathname: "/note", params: { ph: targetHash } });
        return false;
      }
      if (isExternalUrl(url)) {
        void Linking.openURL(url).catch(() => {});
        return false;
      }
      const name = (() => {
        try {
          return decodeURIComponent(url.replace(/^wikilink:/, "")).split("#")[0].replace(/^\.?\//, "");
        } catch {
          return url;
        }
      })();
      flashNotice(`"${name}" isn't in your synced library yet.`);
      return false;
    },
    [resolver, flashNotice],
  );

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="note-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="note-back" style={styles.backBtn}>
          <Text style={styles.backText}>‹ Library</Text>
        </Pressable>
      </View>
      {notice ? (
        <View style={styles.notice} testID="note-link-notice">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
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
    notice: {
      marginHorizontal: space(4),
      marginBottom: space(2),
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    noticeText: { ...type.small, color: c.text2 },
  });
