import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import { buildLibraryRows, type SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Library (read-only, Phase 1): what the agent wrote on the Mac, on your phone.
// Shows cached notes instantly (offline included), pulls new rows behind that, and
// live-refreshes while the agent is writing. No editor anywhere on this screen by
// design — the Mac agent is the only author (single-writer architecture).
// Only kind:"note" docs render here — deck snapshots and the calendar doc ride the
// same encrypted pipe but belong to the Study/Calendar screens (Phases 2/3).
//
// Folders nest arbitrarily deep (mirrors the Mac vault's own folder structure) and
// each one collapses independently — buildLibraryRows() (lib/library-sync.ts) turns
// the flat doc-path list into a depth-tagged row list every render; `collapsed` (a
// Set of full folder paths, e.g. "PHCY 1205/Unit 1") is the only state that drives
// it, so collapsing a parent never disturbs a child's own remembered state.

export default function LibraryScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const pulling = useRef(false);

  // Toggle ONE folder by its full path — never mutates the previous Set, always
  // builds a fresh one, so a folder's collapsed-ness is independent of its
  // siblings and its ancestors' own toggles.
  const toggleFolder = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

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
      <View
        style={[styles.pairWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="library-unpaired"
      >
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
  const rows = buildLibraryRows(notes.map((d) => ({ path: d.path, title: d.title })), collapsed);
  const pathToHash = new Map(notes.map((d) => [d.path, d.pathHash]));
  // Root-level notes (no folder) are the only rows ever at depth 0 with type "note" —
  // that's exactly the old "" bucket buildSections used to label "Library".
  const hasRootNotes = rows.some((r) => r.type === "note" && r.depth === 0);

  // The banners are siblings above the list, so when one shows IT carries the
  // glass-TopBar clearance and the list's own top padding shrinks — otherwise the
  // banner would render underneath the translucent bar.
  const hasBanner = failures > 0 || Boolean(error);

  return (
    <View style={styles.flex} testID="library-screen">
      {hasBanner ? (
        <View style={{ paddingTop: contentTop }}>
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
        </View>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.type}:${item.path}`}
        contentContainerStyle={[styles.listBody, { paddingTop: hasBanner ? space(2) : contentTop + space(2), paddingBottom: contentBottom }]}
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
        ListHeaderComponent={hasRootNotes ? <Text style={styles.sectionHead}>Library</Text> : null}
        renderItem={({ item }) => {
          const indent = item.depth > 0 ? { paddingLeft: space(2) + item.depth * space(4) } : null;
          if (item.type === "folder") {
            const isCollapsed = collapsed.has(item.path);
            return (
              <Pressable
                style={({ pressed }) => [styles.folderRow, indent, pressed && styles.rowPressed]}
                testID={`folder-${item.path}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} folder`}
                accessibilityState={{ expanded: !isCollapsed }}
                onPress={() => toggleFolder(item.path)}
              >
                <Text style={[styles.folderChevron, { transform: [{ rotate: isCollapsed ? "0deg" : "90deg" }] }]}>›</Text>
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              style={({ pressed }) => [styles.row, indent, pressed && styles.rowPressed]}
              testID={`note-${item.path}`}
              onPress={() => {
                const ph = pathToHash.get(item.path);
                if (ph) router.push({ pathname: "/note", params: { ph } });
              }}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            </Pressable>
          );
        }}
        // rows.length === 0 iff notes.length === 0: a top-level folder's own row (and
        // every root note) is always emitted regardless of collapse state — only a
        // collapsed folder's DESCENDANTS get hidden — so this never falsely fires while
        // notes merely sit behind a collapsed folder. Keeping FlatList's own empty
        // handling (rather than branching around the list) is also what keeps
        // pull-to-refresh alive on this exact screen — the just-paired, nothing-synced-
        // yet state, which is the moment a pull-to-refresh matters most.
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
    listBody: { padding: space(4), flexGrow: 1 },
    // "Library" — the label above root-level (unfoldered) notes only; real folders
    // render as folderRow below, each with its own name + chevron.
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(4), marginBottom: space(1.5) },
    // Notes are still just names (owner call) — no cards, no chevrons on notes.
    row: { paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    rowPressed: { backgroundColor: c.surface },
    rowTitle: { ...type.body, color: c.text },
    // Folders ARE collapsible, so they get the chevron notes deliberately don't.
    folderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      paddingVertical: space(2.5),
      paddingHorizontal: space(2),
      marginTop: space(3),
      borderRadius: radius.sm,
    },
    folderName: { ...type.bodyStrong, color: c.text, flexShrink: 1 },
    // Same glyph as settings.tsx's disclosure "›", rotated in place (0deg = collapsed
    // pointing right, 90deg = expanded pointing down) — no icon asset, no animation lib.
    folderChevron: { fontSize: 17, lineHeight: 20, color: c.text2, width: 14, textAlign: "center" },
    warn: { marginHorizontal: space(4), marginTop: space(3), padding: space(3) },
    warnText: { ...type.small, color: c.text2 },
    emptyWrap: { paddingTop: space(10) },
  });
