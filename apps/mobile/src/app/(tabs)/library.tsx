import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import { buildSections, type LibrarySection, type SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Library (read-only, Phase 1): what the agent wrote on the Mac, on your phone.
// Shows cached notes instantly (offline included), pulls new rows behind that, and
// live-refreshes while the agent is writing. No editor anywhere on this screen by
// design — the Mac agent is the only author (single-writer architecture).
// Only kind:"note" docs render here — deck snapshots and the calendar doc ride the
// same encrypted pipe but belong to the Study/Calendar screens (Phases 2/3).

export default function LibraryScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);

  const pull = useCallback(async (base: SyncCache) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const merged = await pullLibraryRows(base);
      setCache(merged);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pulling.current = false;
    }
  }, []);

  // Re-check the key + freshen on every focus: this is the screen the user lands on
  // right after pairing, and after any stretch away from the app.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const k = await loadVaultKey();
        if (!alive) return;
        setKey(k);
        setKeyChecked(true);
        if (!k) return;
        const cached = await loadCachedRows();
        if (!alive) return;
        setCache(cached);
        void pull(cached);
      })();
      return () => {
        alive = false;
      };
    }, [pull]),
  );

  // Live updates while the agent writes on the Mac.
  useEffect(() => {
    if (!key) return;
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    void currentUserId().then((uid) => {
      if (!alive || !uid) return;
      unsubscribe = subscribeLibrary(uid, () => {
        setCache((current) => {
          void pull(current);
          return current;
        });
      });
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [key, pull]);

  if (!keyChecked) return <View style={styles.flex} testID="library-loading" />;

  if (!key) {
    return (
      <View style={styles.pairWrap} testID="library-unpaired">
        <EmptyBlock
          title="Pair with your Mac"
          body="Your library lives on your Mac. Pair once and everything the agent writes shows up here — readable anywhere, even offline. End-to-end encrypted: our servers can't read a word of it."
        />
        <MissionButton label="Scan pairing code" variant="primary" testID="goto-pair" onPress={() => router.push("/pair")} />
        <Text style={styles.pairHint}>On your Mac: Settings → Phone sync → Pair phone.</Text>
      </View>
    );
  }

  const { docs, failures } = decryptLibrary(cache, key);
  const notes = docs.filter((d) => d.kind === "note");
  const sections: (LibrarySection & { title: string; data: LibrarySection["notes"] })[] = buildSections(
    notes.map((d) => ({ path: d.path, title: d.title })),
  ).map((s) => ({ ...s, title: s.folder === "" ? "Library" : s.folder, data: s.notes }));
  const pathToHash = new Map(notes.map((d) => [d.path, d.pathHash]));

  return (
    <View style={styles.flex} testID="library-screen">
      {failures > 0 ? (
        <Surface style={styles.warn} testID="library-decrypt-warning">
          <Text style={styles.warnText}>
            {failures} note{failures === 1 ? "" : "s"} couldn't be decrypted. If this persists, re-pair with your Mac
            (Settings → Phone sync).
          </Text>
        </Surface>
      ) : null}
      {error ? (
        <Surface style={styles.warn} testID="library-error">
          <Text style={styles.warnText}>Couldn't reach sync: {error}</Text>
        </Surface>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.path}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listBody}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void pull(cache).finally(() => setRefreshing(false));
            }}
          />
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionHead}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID={`note-${item.path}`}
            onPress={() => {
              const ph = pathToHash.get(item.path);
              if (ph) router.push({ pathname: "/note", params: { ph } });
            }}
          >
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="Nothing synced yet"
              body="Your Mac publishes notes as the agent writes them. Leave the Nemesis desktop app open and check back in a minute."
            />
          </View>
        }
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },
    listBody: { padding: space(4), paddingBottom: space(10), flexGrow: 1 },
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(4), marginBottom: space(1.5) },
    row: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: space(3), paddingHorizontal: space(3),
      borderWidth: 1, borderColor: c.line, borderRadius: radius.sm,
      backgroundColor: c.glass, marginBottom: space(1.5),
    },
    rowPressed: { backgroundColor: c.accentFaint },
    rowTitle: { ...type.bodyStrong, color: c.text, flex: 1, marginRight: space(2) },
    chevron: { fontSize: 20, color: c.text2 },
    warn: { marginHorizontal: space(4), marginTop: space(3), padding: space(3) },
    warnText: { ...type.small, color: c.text2 },
    emptyWrap: { paddingTop: space(10) },
  });
