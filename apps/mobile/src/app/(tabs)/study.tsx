import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { StudyModeMenu, FAB_SIZE, type StudyModeKey } from "@/components/StudyModeMenu";
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
//
// Folders (owner ask): decks group by `snapshot.course` — an optional "#
// course: …" header the card-generation skill writes into the deck file
// (nemesis-desktop-public src/app/study/deck-files.ts). NOT derived from
// `path`: the desktop publisher gives every deck a synthetic, flat path
// (`.study/sync/deck/<id>`, see electron/main.ts listPhoneDerivedDocs) that
// carries no real folder structure, so path-based grouping would dump every
// deck into one identical bucket. Course-less decks render ungrouped at the
// list's end — today's flat list is exactly what you get if no deck has a
// course, so this never regresses the no-metadata case.
//
// The lower-right glass FAB opens a Cards/Tests/Mindmaps picker; only Cards is
// real today (it's this screen), so Tests/Mindmaps route to a SlideUpSheet
// placeholder instead of a dead link. The lower-left FAB opens a Stats sheet
// built ONLY from numbers this screen already computes (due/new/total/decks) —
// no fabricated streak metric; a screen with no history just says so.

interface DeckRow {
  pathHash: string;
  snapshot: DeckSnapshot;
  /** Total actionable now = the session queue length (new + due review), minus cards
   *  already graded on this phone since the snapshot. newNow + reviewNow === dueNow. */
  dueNow: number;
  /** New (never-seen) cards in that queue. */
  newNow: number;
  /** Due REVIEW cards in that queue (dueNow − newNow) — kept distinct so the row can
   *  show "N new · M due" without double-counting. */
  reviewNow: number;
}

interface FolderGroup {
  course: string;
  decks: DeckRow[];
  due: number;
}

/** Bucket decks by `snapshot.course`; course-less decks fall out as "loose".
 *  Folders sort alphabetically; each folder's decks keep the caller's own
 *  order (the screen already sorts decks due-first before this runs). Pure. */
function groupDecksByCourse(decks: DeckRow[]): { folders: FolderGroup[]; loose: DeckRow[] } {
  const byCourse = new Map<string, DeckRow[]>();
  const loose: DeckRow[] = [];
  for (const deck of decks) {
    const course = deck.snapshot.course;
    if (!course) {
      loose.push(deck);
      continue;
    }
    const bucket = byCourse.get(course);
    if (bucket) bucket.push(deck);
    else byCourse.set(course, [deck]);
  }
  const folders = [...byCourse.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([course, courseDecks]) => ({
      course,
      decks: courseDecks,
      due: courseDecks.reduce((sum, d) => sum + d.dueNow, 0),
    }));
  return { folders, loose };
}

type StudyRow =
  | { type: "folder"; course: string; due: number; collapsed: boolean }
  | { type: "deck"; deck: DeckRow; nested: boolean };

/** Flatten folders + loose decks into the FlatList's actual row list, skipping
 *  a folder's children while it's collapsed — collapsing hides rows outright
 *  rather than rendering-and-hiding them, so a collapsed folder costs nothing
 *  to scroll past. Pure. */
function buildStudyRows(folders: FolderGroup[], loose: DeckRow[], collapsed: Set<string>): StudyRow[] {
  const rows: StudyRow[] = [];
  for (const folder of folders) {
    const isCollapsed = collapsed.has(folder.course);
    rows.push({ type: "folder", course: folder.course, due: folder.due, collapsed: isCollapsed });
    if (!isCollapsed) {
      for (const deck of folder.decks) rows.push({ type: "deck", deck, nested: true });
    }
  }
  for (const deck of loose) rows.push({ type: "deck", deck, nested: false });
  return rows;
}

const COMING_SOON_LABEL: Record<Exclude<StudyModeKey, "cards">, string> = {
  tests: "Tests",
  mindmaps: "Mindmaps",
};

export default function StudyScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const insets = useSafeAreaInsets();
  const { setHeaderTitle } = useShell();
  const [key, setKey] = useState<Uint8Array | null>(null);

  // Centered "Study" label in the shared TopBar (owner 2026-07-18) — same slot
  // Library/Chat drive; cleared on unmount so it never leaks to another screen.
  useEffect(() => {
    setHeaderTitle("Study");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [marks, setMarks] = useState<Record<string, GradedMark[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const pulling = useRef(false);

  // Folder collapse state (owner ask 1): course names currently collapsed.
  // Starts empty — every folder opens expanded so due cards are never hidden
  // by default; a tap on the folder row's chevron toggles membership.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const toggleFolder = useCallback((course: string) => {
    // The collapse ANIMATES via reanimated: the deck rows carry entering/exiting +
    // layout animations (see the render), so a folder's children fade+slide away on
    // collapse instead of vanishing. (LayoutAnimation didn't fire inside FlatList — this
    // screen is now a plain ScrollView, small enough to render every row.)
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(course)) next.delete(course);
      else next.add(course);
      return next;
    });
  }, []);

  // Lower-right FAB: Cards/Tests/Mindmaps picker (owner ask 2). `comingSoon`
  // (the label) and `comingSoonOpen` (the sheet's visibility) are separate
  // state on purpose: closing only flips `comingSoonOpen`, so the label stays
  // put through the ~200ms slide-down instead of blanking mid-animation.
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<Exclude<StudyModeKey, "cards"> | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const handleModeSelect = useCallback((mode: StudyModeKey) => {
    setModeMenuOpen(false);
    // "Cards" IS this screen — picking it just closes the menu. Tests/Mindmaps
    // don't exist yet, so they open the same placeholder sheet Stats uses
    // rather than a dead route.
    if (mode !== "cards") {
      setComingSoon(mode);
      setComingSoonOpen(true);
    }
  }, []);

  // Lower-left FAB: Stats sheet (owner ask 3).
  const [statsOpen, setStatsOpen] = useState(false);

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
      // One queue, split into its two buckets so "new" and "due" don't overlap: the
      // queue holds both new and due-review cards (initSession buckets them by isNew),
      // so newNow + reviewNow === dueNow exactly.
      const queue = sessionQueue(snapshot, marks[d.pathHash] ?? []);
      const newNow = queue.filter((card) => card.isNew).length;
      return { dueNow: queue.length, newNow, reviewNow: queue.length - newNow, pathHash: d.pathHash, snapshot };
    })
    .filter((row): row is DeckRow => row !== null)
    .sort((a, b) => b.dueNow - a.dueNow || a.snapshot.name.localeCompare(b.snapshot.name));

  const totalDue = decks.reduce((sum, deck) => sum + deck.dueNow, 0);
  const { folders, loose } = groupDecksByCourse(decks);
  const rows = buildStudyRows(folders, loose, collapsedFolders);

  // Stats sheet numbers: every one is summed from data this screen already
  // decrypted and parsed — nothing here is guessed. "Streak" has no source of
  // truth on the phone (no local review-history log survives a snapshot
  // catching up), so it says so instead of inventing a number.
  const totalCards = decks.reduce((sum, d) => sum + d.snapshot.stats.total, 0);
  const totalNew = decks.reduce((sum, d) => sum + d.snapshot.stats.fresh, 0);
  const statTiles: { label: string; value: string; color: string }[] = [
    { label: "Due now", value: String(totalDue), color: c.accent },
    { label: "New", value: String(totalNew), color: c.text },
    { label: "Total cards", value: String(totalCards), color: c.text },
    { label: "Decks", value: String(decks.length), color: c.text },
  ];

  return (
    <View style={styles.flex} testID="study-screen">
      {/* A ScrollView (not FlatList) so reanimated's entering/exiting/layout animations
          actually fire on collapse — every row renders (this list is small). Each deck row
          fades + slides away when its folder collapses; folder rows just reflow. */}
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listBody,
          { paddingTop: contentTop + space(2), paddingBottom: insets.bottom + FAB_SIZE + space(4) },
        ]}
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
      >
        {rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="No decks yet"
              body="Ask your agent on the Mac to build flashcards from your notes or slides — decks show up here on their own."
            />
          </View>
        ) : (
          rows.map((item) =>
            item.type === "folder" ? (
              <Animated.View key={`folder:${item.course}`} layout={LinearTransition.duration(220)}>
                <Pressable
                  testID={`study-folder-${item.course}`}
                  onPress={() => toggleFolder(item.course)}
                  style={({ pressed }) => [styles.folderRow, pressed && styles.rowPressed]}
                >
                  <PlusMinusIcon size={13} color={c.text2} expanded={!item.collapsed} />
                  <Text style={styles.folderName} numberOfLines={1}>{item.course}</Text>
                  {item.due > 0 ? <Text style={styles.due}>{item.due}</Text> : null}
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View
                key={`deck:${item.deck.pathHash}`}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                layout={LinearTransition.duration(220)}
              >
                <Pressable
                  testID={`deck-${item.deck.snapshot.id}`}
                  onPress={() => router.push({ pathname: "/review", params: { ph: item.deck.pathHash } })}
                  style={({ pressed }) => [styles.row, item.nested && styles.rowNested, pressed && styles.rowPressed]}
                >
                  <Text style={styles.deckName} numberOfLines={1}>{item.deck.snapshot.name}</Text>
                  {/* Trailing: the two pending counts — new (blue) vs due (accent), numbers
                      only (owner 2026-07-19) — then a '›'. ✓ when nothing's due. */}
                  <View style={styles.deckTrail}>
                    {item.deck.dueNow === 0 ? (
                      <Text style={styles.done}>✓</Text>
                    ) : (
                      <>
                        {item.deck.newNow > 0 ? <Text style={styles.newCount}>{item.deck.newNow}</Text> : null}
                        {item.deck.reviewNow > 0 ? <Text style={styles.due}>{item.deck.reviewNow}</Text> : null}
                      </>
                    )}
                    <Text style={styles.deckChevron}>›</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ),
          )
        )}
      </ScrollView>

      {/* Floating liquid-glass controls (owner asks 2 + 3) — an overlay row like
          TopBar's, so empty space between the two buttons still lets scroll/tap
          reach the list underneath. Stats sits lower-left, the mode picker
          lower-right, exactly as asked. */}
      <View style={[styles.fabRow, { bottom: insets.bottom + space(1) }]} pointerEvents="box-none">
        <Pressable
          onPress={() => setStatsOpen(true)}
          hitSlop={8}
          accessibilityLabel="Study stats"
          testID="study-stats-fab"
        >
          <GlassSurface style={styles.fab} fallbackColor={c.glassPanel}>
            <View style={styles.fabInner}>
              <ChartIcon size={21} color={c.text} />
            </View>
          </GlassSurface>
        </Pressable>

        <Pressable
          onPress={() => setModeMenuOpen((v) => !v)}
          hitSlop={8}
          accessibilityLabel="Study modes"
          testID="study-modes-fab"
        >
          <GlassSurface style={styles.fab} fallbackColor={c.glassPanel}>
            <View style={styles.fabInner}>
              <ModesIcon size={21} color={c.text} />
            </View>
          </GlassSurface>
        </Pressable>
      </View>

      <StudyModeMenu visible={modeMenuOpen} onClose={() => setModeMenuOpen(false)} onSelect={handleModeSelect} insetBottom={contentBottom} />

      <SlideUpSheet visible={statsOpen} onClose={() => setStatsOpen(false)} title="Study stats" testID="study-stats-sheet">
        <View style={styles.statGrid}>
          {statTiles.map((tile) => (
            <View key={tile.label} style={styles.statTile}>
              <Text style={[styles.statValue, { color: tile.color }]}>{tile.value}</Text>
              <Text style={styles.statLabel}>{tile.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.streakRow}>
          <Text style={styles.streakLabel}>Streak</Text>
          <Text style={styles.streakValue}>Not tracked yet</Text>
        </View>
      </SlideUpSheet>

      <SlideUpSheet
        visible={comingSoonOpen}
        onClose={() => setComingSoonOpen(false)}
        title={comingSoon ? COMING_SOON_LABEL[comingSoon] : ""}
        testID="study-coming-soon-sheet"
      >
        <Text style={styles.comingSoonText}>
          {comingSoon ? COMING_SOON_LABEL[comingSoon] : ""} mode is coming soon. Cards has your due decks covered for now.
        </Text>
      </SlideUpSheet>
    </View>
  );
}

// --- inline icons (kept local to this screen — icons.tsx stays untouched) -----

const iconBase = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Folder disclosure indicator — a "+" when collapsed, a "−" when expanded (owner
 *  2026-07-18). The horizontal stroke always draws; the vertical one only while
 *  collapsed, so the glyph reads as plus→minus as the folder opens. */
function PlusMinusIcon({ size = 13, color, expanded }: { size?: number; color: string; expanded: boolean }) {
  const mid = 12;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="5" y1={mid} x2="19" y2={mid} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      {expanded ? null : <Line x1={mid} y1="5" x2={mid} y2="19" stroke={color} strokeWidth={2.4} strokeLinecap="round" />}
    </Svg>
  );
}

/** Stacked-cards glyph for the Cards/Tests/Mindmaps FAB — a front card plus a
 *  peeking back edge, the same "shape + partial second shape" depth trick the
 *  shared icon set uses elsewhere (e.g. SessionsIcon). */
function ModesIcon({ size = 22, color, strokeWidth = 1.7 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8.2 4.2h9.4a1.8 1.8 0 0 1 1.8 1.8v9.4" stroke={color} strokeWidth={strokeWidth} {...iconBase} />
      <Rect x="3.6" y="6.4" width="13" height="9.6" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...iconBase} />
    </Svg>
  );
}

/** Simple bar-chart glyph for the Stats FAB. */
function ChartIcon({ size = 22, color, strokeWidth = 1.7 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4.2" y1="20" x2="19.8" y2="20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M7.4 20V13.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 20V8.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16.6 20V11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },
    listBody: { padding: space(4), flexGrow: 1 },
    // Decks are just names now (owner call) — the two pending counts + a '›' trail.
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    // Nested under a folder header — indented like a file tree's children.
    rowNested: { paddingLeft: space(6) },
    rowPressed: { backgroundColor: c.surface },
    deckName: { ...type.body, color: c.text, flex: 1, minWidth: 0 },
    due: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },
    // "New" is distinct from "due" (info-blue vs accent) so the two counts read apart.
    newCount: { ...type.small, fontWeight: "700", color: c.info, fontVariant: ["tabular-nums"] },
    done: { ...type.small, color: c.good },
    // The trailing cluster: counts (or ✓) then the '›' affordance.
    deckTrail: { flexDirection: "row", alignItems: "center", gap: space(2) },
    deckChevron: { ...type.body, color: c.text3, marginLeft: space(0.5) },
    emptyWrap: { paddingTop: space(10) },

    // Collapsible folder header row (owner ask 1).
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    folderName: { ...type.bodyStrong, color: c.text2, flex: 1, minWidth: 0, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 12.5 },

    // Floating glass FABs (owner asks 2 + 3).
    fabRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space(4) },
    fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 1, borderColor: c.line },
    fabInner: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Stats sheet content.
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
    statTile: { width: "47%", backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingVertical: space(3.5), paddingHorizontal: space(3), gap: space(0.5) },
    statValue: { fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
    statLabel: { ...type.small, color: c.text2 },
    streakRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(4), paddingTop: space(3), borderTopWidth: 1, borderTopColor: c.line },
    streakLabel: { ...type.body, color: c.text2 },
    streakValue: { ...type.small, color: c.text3 },

    comingSoonText: { ...type.body, color: c.text2, paddingBottom: space(2) },
  });
