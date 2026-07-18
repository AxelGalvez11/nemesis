import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import { flushReviewQueue, loadAllGradedMarks } from "@/api/reviewEvents";
import { parseDeckSnapshot, sessionQueue, type DeckSnapshot, type GradedMark } from "@/lib/study-session";
import type { SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Study (Phase 3): the Mac precomputes each deck's due queue into encrypted
// kind:"deck" documents; this screen lists them and hands a deck to the review
// screen. Zero scheduler code on the phone — due-ness, daily caps, and cloze
// slots were all decided by the desktop study model when the snapshot was built.

interface DeckRow {
  pathHash: string;
  snapshot: DeckSnapshot;
  /** stats.due minus cards already graded on this phone since the snapshot. */
  dueNow: number;
}

export default function StudyScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [marks, setMarks] = useState<Record<string, GradedMark[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);

  const pull = useCallback(async (base: SyncCache) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const merged = await pullLibraryRows(base);
      setCache(merged);
    } catch {
      // offline — the cached decks still render
    } finally {
      pulling.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const k = await loadVaultKey();
        if (!alive) return;
        setKey(k);
        setKeyChecked(true);
        if (!k) return;
        const [cached, gradedMarks] = await Promise.all([loadCachedRows(), loadAllGradedMarks()]);
        if (!alive) return;
        setCache(cached);
        setMarks(gradedMarks);
        void pull(cached);
        // Any grades stranded by an offline session get another chance now.
        void flushReviewQueue();
      })();
      return () => {
        alive = false;
      };
    }, [pull]),
  );

  // Live refresh while the Mac republishes snapshots (e.g. right after it
  // ingests this phone's grades).
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

  if (!keyChecked) return <View style={styles.flex} testID="study-loading" />;

  if (!key) {
    return (
      <View
        style={[styles.pairWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="study-unpaired"
      >
        <EmptyBlock
          title="Pair with your Mac"
          body="Your flashcards live on your Mac. Pair once and every deck the agent builds is reviewable here — grades sync back automatically."
        />
        <MissionButton label="Scan pairing code" variant="primary" testID="goto-pair" onPress={() => router.push("/pair")} />
        <Text style={styles.pairHint}>On your Mac: Settings → Phone sync → Pair phone.</Text>
      </View>
    );
  }

  const { docs } = decryptLibrary(cache, key);
  const decks: DeckRow[] = docs
    .filter((d) => d.kind === "deck")
    .map((d) => {
      const snapshot = parseDeckSnapshot(d.content);
      if (!snapshot) return null;
      return { dueNow: sessionQueue(snapshot, marks[d.pathHash] ?? []).length, pathHash: d.pathHash, snapshot };
    })
    .filter((row): row is DeckRow => row !== null)
    .sort((a, b) => b.dueNow - a.dueNow || a.snapshot.name.localeCompare(b.snapshot.name));

  const totalDue = decks.reduce((sum, deck) => sum + deck.dueNow, 0);

  return (
    <View style={styles.flex} testID="study-screen">
      <FlatList
        data={decks}
        keyExtractor={(item) => item.pathHash}
        contentContainerStyle={[styles.listBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
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
        ListHeaderComponent={
          decks.length ? (
            <Text style={styles.headline} testID="study-total-due">
              {totalDue === 0 ? "All caught up" : `${totalDue} card${totalDue === 1 ? "" : "s"} due`}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`deck-${item.snapshot.id}`}
            onPress={() => router.push({ pathname: "/review", params: { ph: item.pathHash } })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.deckName} numberOfLines={1}>{item.snapshot.name}</Text>
            {item.dueNow > 0 ? (
              <Text style={styles.due}>{item.dueNow}</Text>
            ) : (
              <Text style={styles.done}>✓</Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="No decks yet"
              body="Ask your agent on the Mac to build flashcards from your notes or slides — decks show up here on their own."
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
    listBody: { padding: space(4), flexGrow: 1 },
    headline: { ...type.h2, color: c.text, marginBottom: space(3), marginTop: space(1) },
    // Decks are just names now (owner call) — no cards; a bare due count / ✓ trails.
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    rowPressed: { backgroundColor: c.surface },
    deckName: { ...type.body, color: c.text, flex: 1, minWidth: 0 },
    due: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },
    done: { ...type.small, color: c.good },
    emptyWrap: { paddingTop: space(10) },
  });
