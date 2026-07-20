import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { StudyModeMenu, FAB_SIZE, type StudyModeKey } from "@/components/StudyModeMenu";
import {
  countsForCards,
  deckGroupInfo,
  fetchCloudStudy,
  type CloudStudyCard,
  type CloudStudyDeck,
  type DeckCounts,
} from "@/api/cloudStudy";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Study (cloud-first phone, build spec §8): decks + cards come straight from
// the cloud study_decks/study_cards tables (api/cloudStudy.ts) — the same
// tables the web workspace reads. No Mac precompute, no vault pairing, no
// offline snapshot: this screen re-fetches whenever it gains focus (open the
// tab, or come back from a review) and on pull-to-refresh.
//
// Folders (owner ask, ported from web): decks group by their OWN name's
// "Group::Subgroup::Leaf" convention (deckGroupInfo) — replacing the old
// Mac-authored "# course:" header the desktop card-generation skill used to
// write. Group-less decks render ungrouped at the list's end, same as before.
//
// New/Learn/Due counts are the exact web cards-tab.tsx math (countsForCards),
// recomputed live from the fetched cards — nothing here is guessed.
//
// The lower-right glass FAB opens a Cards/Tests/Mindmaps picker; only Cards is
// real today (it's this screen), so Tests/Mindmaps route to a SlideUpSheet
// placeholder instead of a dead link. The lower-left FAB opens a Stats sheet
// built ONLY from numbers this screen already computes (due/new/total/decks) —
// no fabricated streak metric; a screen with no history just says so.

interface DeckRow {
  deck: CloudStudyDeck;
  leaf: string;
  counts: DeckCounts;
}

interface FolderGroup {
  group: string;
  decks: DeckRow[];
  /** Sum of newCount+dueCount across the folder's decks — "actionable right
   *  now" (Learn cards aren't due yet, so they don't count toward this). */
  actionable: number;
}

/** Bucket decks by the group prefix of their OWN name; decks with no "::"
 *  fall out as "loose". Folders sort alphabetically; each folder's decks keep
 *  the caller's own order (the screen already sorts decks due-first). Pure. */
function groupDecks(decks: DeckRow[]): { folders: FolderGroup[]; loose: DeckRow[] } {
  const byGroup = new Map<string, DeckRow[]>();
  const loose: DeckRow[] = [];
  for (const row of decks) {
    const { group } = deckGroupInfo(row.deck.name);
    if (!group) {
      loose.push(row);
      continue;
    }
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(row);
    else byGroup.set(group, [row]);
  }
  const folders = [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, groupDecksList]) => ({
      group,
      decks: groupDecksList,
      actionable: groupDecksList.reduce((sum, d) => sum + d.counts.newCount + d.counts.dueCount, 0),
    }));
  return { folders, loose };
}

type StudyRow =
  | { type: "folder"; group: string; actionable: number; collapsed: boolean }
  | { type: "deck"; deck: DeckRow; nested: boolean };

/** Flatten folders + loose decks into the ScrollView's actual row list,
 *  skipping a folder's children while it's collapsed. Pure. */
function buildStudyRows(folders: FolderGroup[], loose: DeckRow[], collapsed: Set<string>): StudyRow[] {
  const rows: StudyRow[] = [];
  for (const folder of folders) {
    const isCollapsed = collapsed.has(folder.group);
    rows.push({ type: "folder", group: folder.group, actionable: folder.actionable, collapsed: isCollapsed });
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

type LoadStatus = "idle" | "loading" | "loaded" | "error";

export default function StudyScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const insets = useSafeAreaInsets();
  const { setHeaderTitle } = useShell();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // Centered "Study" label in the shared TopBar (owner 2026-07-18) — same slot
  // Library/Chat drive; cleared on unmount so it never leaks to another screen.
  useEffect(() => {
    setHeaderTitle("Study");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decks, setDecks] = useState<CloudStudyDeck[]>([]);
  const [cards, setCards] = useState<CloudStudyCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Folder collapse state (owner ask 1): group names currently collapsed.
  // Starts empty — every folder opens expanded so due cards are never hidden
  // by default; a tap on the folder row's chevron toggles membership.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const toggleFolder = useCallback((group: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Lower-right FAB: Cards/Tests/Mindmaps picker (owner ask 2).
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<Exclude<StudyModeKey, "cards"> | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const handleModeSelect = useCallback((mode: StudyModeKey) => {
    setModeMenuOpen(false);
    if (mode !== "cards") {
      setComingSoon(mode);
      setComingSoonOpen(true);
    }
  }, []);

  // Lower-left FAB: Stats sheet (owner ask 3).
  const [statsOpen, setStatsOpen] = useState(false);

  const load = useCallback(async (uid: string) => {
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    setLoadError(null);
    try {
      const { decks: nextDecks, cards: nextCards } = await fetchCloudStudy(uid);
      setDecks(nextDecks);
      setCards(nextCards);
      setStatus("loaded");
    } catch (cause) {
      setStatus("error");
      setLoadError(cause instanceof Error ? cause.message : "Couldn't load your study decks.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userId) void load(userId);
    }, [load, userId]),
  );

  if (!userId) {
    return (
      <View style={[styles.centerWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="study-signin">
        <EmptyBlock title="Sign in to study" body="Your flashcard decks live in your account — sign in to review them here." />
        <MissionButton label="Sign in" variant="primary" testID="study-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  if (status === "idle" || status === "loading") return <View style={styles.flex} testID="study-loading" />;

  if (status === "error") {
    return (
      <View style={[styles.centerWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="study-error">
        <EmptyBlock title="Study couldn't load" body={loadError ?? "Something went wrong."} />
        <MissionButton label="Try again" variant="primary" testID="study-retry" onPress={() => void load(userId)} />
      </View>
    );
  }

  const deckRows: DeckRow[] = decks
    .map((deck) => {
      const { leaf } = deckGroupInfo(deck.name);
      return { counts: countsForCards(cards.filter((card) => card.deckId === deck.id)), deck, leaf };
    })
    .sort(
      (a, b) =>
        b.counts.newCount + b.counts.dueCount - (a.counts.newCount + a.counts.dueCount) || a.leaf.localeCompare(b.leaf),
    );

  const totalActionable = deckRows.reduce((sum, d) => sum + d.counts.newCount + d.counts.dueCount, 0);
  const totalNew = deckRows.reduce((sum, d) => sum + d.counts.newCount, 0);
  const { folders, loose } = groupDecks(deckRows);
  const rows = buildStudyRows(folders, loose, collapsedFolders);

  // Stats sheet numbers: every one is summed from data this screen already
  // fetched — nothing here is guessed. "Streak" has no source of truth yet,
  // so it says so instead of inventing a number.
  const statTiles: { label: string; value: string; color: string }[] = [
    { label: "Due now", value: String(totalActionable), color: c.accent },
    { label: "New", value: String(totalNew), color: c.text },
    { label: "Total cards", value: String(cards.length), color: c.text },
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
              void load(userId).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyBlock
              title="No decks yet"
              body="Create flashcard decks on the Nemesis web app — they'll show up here automatically."
            />
          </View>
        ) : (
          rows.map((item) =>
            item.type === "folder" ? (
              <Animated.View key={`folder:${item.group}`} layout={LinearTransition.duration(220)}>
                <Pressable
                  testID={`study-folder-${item.group}`}
                  onPress={() => toggleFolder(item.group)}
                  style={({ pressed }) => [styles.folderRow, pressed && styles.rowPressed]}
                >
                  <PlusMinusIcon size={13} color={c.text2} expanded={!item.collapsed} />
                  <Text style={styles.folderName} numberOfLines={1}>{item.group}</Text>
                  {item.actionable > 0 ? <Text style={styles.due}>{item.actionable}</Text> : null}
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View
                key={`deck:${item.deck.deck.id}`}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                layout={LinearTransition.duration(220)}
              >
                <Pressable
                  testID={`deck-${item.deck.deck.id}`}
                  onPress={() => router.push({ pathname: "/review", params: { deckId: item.deck.deck.id } })}
                  style={({ pressed }) => [styles.row, item.nested && styles.rowNested, pressed && styles.rowPressed]}
                >
                  <Text style={styles.deckName} numberOfLines={1}>{item.deck.leaf}</Text>
                  {/* Trailing: New (blue) / Learn (amber) / Due (accent) — numbers only
                      (owner 2026-07-19 kept this compact), then a '›'. ✓ when nothing
                      is new or due right now (Learn is a leading indicator, not actionable). */}
                  <View style={styles.deckTrail}>
                    {item.deck.counts.newCount + item.deck.counts.dueCount === 0 ? (
                      <Text style={styles.done}>✓</Text>
                    ) : (
                      <>
                        {item.deck.counts.newCount > 0 ? <Text style={styles.newCount}>{item.deck.counts.newCount}</Text> : null}
                        {item.deck.counts.learnCount > 0 ? <Text style={styles.learnCount}>{item.deck.counts.learnCount}</Text> : null}
                        {item.deck.counts.dueCount > 0 ? <Text style={styles.due}>{item.deck.counts.dueCount}</Text> : null}
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
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },
    listBody: { padding: space(4), flexGrow: 1 },
    // Decks are just names now (owner call) — the trailing counts + a '›' trail.
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    // Nested under a folder header — indented like a file tree's children.
    rowNested: { paddingLeft: space(6) },
    rowPressed: { backgroundColor: c.surface },
    deckName: { ...type.body, color: c.text, flex: 1, minWidth: 0 },
    due: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },
    // "New" and "Learn" are distinct from "due" so the three counts read apart.
    newCount: { ...type.small, fontWeight: "700", color: c.info, fontVariant: ["tabular-nums"] },
    learnCount: { ...type.small, fontWeight: "700", color: c.warn, fontVariant: ["tabular-nums"] },
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
