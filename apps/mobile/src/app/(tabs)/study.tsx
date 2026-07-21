import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronIcon, PlusIcon } from "@/components/icons";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { StudyAddSheet } from "@/components/StudyAddSheet";
import { StudyModeMenu, FAB_SIZE, type StudyModeKey } from "@/components/StudyModeMenu";
import {
  countsForCards,
  deckGroupInfo,
  fetchCloudStudy,
  type CloudStudyCard,
  type CloudStudyDeck,
  type DeckCounts,
} from "@/api/cloudStudy";
import { deckMastery, type DeckMastery } from "@/lib/study-progress";
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
// write. Group-less decks render ungrouped at the list's end. Folders start
// COLLAPSED the first time this screen loads data (owner 2026-07-20, "same in
// library") — a one-time seed keyed off the FIRST successful load, not every
// focus/pull-to-refresh, so a folder the student just opened never
// re-collapses under them mid-session.
//
// New/Learn/Due counts are the exact web cards-tab.tsx math (countsForCards),
// recomputed live from the fetched cards — nothing here is guessed. Each deck
// row also gets a thin "learned ratio" progress bar (lib/study-progress.ts) —
// Study's own PROGRESS identity, distinct from Library's plain document rows
// (owner 2026-07-20) — computed the same honest way: mature (repetitions>0,
// interval>=21d) over total cards in the deck, skipped entirely on an empty
// deck rather than showing a fake 0%.
//
// The Cards/Tests/Mindmaps switcher is now an INLINE segmented toggle
// (StudyModeMenu), not a popup — the owner asked it to "show which section
// user is in". Tests/Mindmaps aren't built yet, so selecting them swaps the
// deck list for an inline "coming soon" panel rather than routing anywhere.
// Stats moved OFF its own FAB and into that same toggle as a trailing
// icon-segment; tapping it still opens the same numbers-only SlideUpSheet as
// before (due/new/total/decks — no invented streak metric).
//
// The one remaining FAB (lower-left) opens StudyAddSheet — New group / New
// cards / Browse, all backed by real study_decks/study_cards inserts mirrored
// from the web workspace (see StudyAddSheet.tsx's own header for specifics).

interface DeckRow {
  deck: CloudStudyDeck;
  leaf: string;
  counts: DeckCounts;
  mastery: DeckMastery;
}

interface FolderGroup {
  group: string;
  decks: DeckRow[];
  /** Sum of newCount+dueCount across the folder's decks — "actionable right
   *  now" (Learn cards aren't due yet, so they don't count toward this). */
  actionable: number;
  /** Sum of every card across the folder's decks — "group headers with card
   *  totals" (owner 2026-07-20). Muted/informational rather than accent
   *  since a total isn't actionable on its own the way a due count is. */
  total: number;
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
      total: groupDecksList.reduce((sum, d) => sum + d.mastery.total, 0),
    }));
  return { folders, loose };
}

type StudyRow =
  | { type: "folder"; group: string; actionable: number; total: number; collapsed: boolean }
  | { type: "deck"; deck: DeckRow; nested: boolean };

/** Flatten folders + loose decks into the ScrollView's actual row list,
 *  skipping a folder's children while it's collapsed. Pure. */
function buildStudyRows(folders: FolderGroup[], loose: DeckRow[], collapsed: Set<string>): StudyRow[] {
  const rows: StudyRow[] = [];
  for (const folder of folders) {
    const isCollapsed = collapsed.has(folder.group);
    rows.push({ type: "folder", group: folder.group, actionable: folder.actionable, total: folder.total, collapsed: isCollapsed });
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

  // Folder collapse state — defaults to collapsed on first load (see
  // appliedDefaultCollapseRef in load() below); a tap on a folder's chevron
  // toggles membership from there.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const appliedDefaultCollapseRef = useRef(false);
  const toggleFolder = useCallback((group: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Cards/Tests/Mindmaps — an inline segmented toggle now (StudyModeMenu),
  // not a popup; `activeMode` decides which content area below renders.
  const [activeMode, setActiveMode] = useState<StudyModeKey>("cards");

  // The lower-left Add FAB — New group / New cards / Browse in one sheet.
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  // Stats — moved off its own FAB into the toggle's trailing icon-segment;
  // the sheet's own content is unchanged.
  const [statsOpen, setStatsOpen] = useState(false);

  const load = useCallback(async (uid: string) => {
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    setLoadError(null);
    try {
      const { decks: nextDecks, cards: nextCards } = await fetchCloudStudy(uid);
      setDecks(nextDecks);
      setCards(nextCards);
      setStatus("loaded");
      // Folders default to collapsed, ONCE per fresh open of this screen —
      // seeded off the first successful load's own folder set, never
      // reapplied on a later focus or pull-to-refresh, so it can't fight a
      // folder the student already opened this session.
      if (!appliedDefaultCollapseRef.current) {
        appliedDefaultCollapseRef.current = true;
        const groups = new Set(nextDecks.map((deck) => deckGroupInfo(deck.name).group).filter(Boolean));
        setCollapsedFolders(groups);
      }
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
      const deckCards = cards.filter((card) => card.deckId === deck.id);
      return { counts: countsForCards(deckCards), mastery: deckMastery(deckCards), deck, leaf };
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
      {/* Inline segmented toggle (owner ask 1) — always visible, clears the
          shared glass TopBar itself, then pushes the list down. Nothing
          scrolls behind it, so it's a plain bordered surface, not glass. */}
      <View style={[styles.toggleRow, { paddingTop: contentTop }]}>
        <StudyModeMenu active={activeMode} onSelect={setActiveMode} onStats={() => setStatsOpen(true)} />
      </View>

      {activeMode === "cards" ? (
        // A ScrollView (not FlatList) so reanimated's entering/exiting/layout animations
        // actually fire on collapse — every row renders (this list is small). Each deck row
        // fades + slides away when its folder collapses; folder rows just reflow.
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listBody, { paddingTop: space(1), paddingBottom: insets.bottom + FAB_SIZE + space(4) }]}
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
                body="Tap + below to start a new group or add cards — or create decks on the Nemesis web app and they'll show up here automatically."
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
                    {/* Chevron points right when collapsed, down when open (owner 2026-07-20). */}
                    <View style={item.collapsed ? null : styles.chevronOpen}>
                      <ChevronIcon size={13} color={c.text2} strokeWidth={2.2} />
                    </View>
                    <Text style={styles.folderName} numberOfLines={1}>{item.group}</Text>
                    <View style={styles.folderTrail}>
                      {/* Muted card total (owner ask 4: "group headers with card
                          totals"), then the existing accent due+new badge —
                          same bare-colored-number language the deck rows use. */}
                      <Text style={styles.folderTotal}>{item.total}</Text>
                      {item.actionable > 0 ? <Text style={styles.due}>{item.actionable}</Text> : null}
                    </View>
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
                    <View style={styles.deckRowTop}>
                      <Text style={styles.deckName} numberOfLines={1}>{item.deck.leaf}</Text>
                      {/* Trailing: New (text2) / Learn (amber) / Due (accent) — numbers only
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
                    </View>
                    {/* Study's own PROGRESS identity (owner ask 4): a thin learned-ratio
                        bar, skipped entirely on an empty deck (no cards = no honest ratio). */}
                    {item.deck.mastery.ratio !== null ? (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.round(item.deck.mastery.ratio * 100)}%` }]} />
                      </View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              ),
            )
          )}
        </ScrollView>
      ) : (
        <Animated.View key={activeMode} entering={FadeIn.duration(160)} style={styles.comingSoonWrap} testID={`study-mode-panel-${activeMode}`}>
          <EmptyBlock
            title={COMING_SOON_LABEL[activeMode]}
            body={`${COMING_SOON_LABEL[activeMode]} mode is coming soon. Cards has your due decks covered for now.`}
          />
        </Animated.View>
      )}

      {/* The one lower-left add entry point (owner ask 2) — New group / New
          cards / Browse, all inside StudyAddSheet's own step stack. */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + space(1) }]} pointerEvents="box-none">
        <Pressable onPress={() => setAddSheetOpen(true)} hitSlop={8} accessibilityLabel="Add to Study" testID="study-add-fab">
          <GlassSurface style={styles.fab} fallbackColor={c.glassPanel}>
            <View style={styles.fabInner}>
              <PlusIcon size={22} color={c.text} />
            </View>
          </GlassSurface>
        </Pressable>
      </View>

      <StudyAddSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        userId={userId}
        decks={decks}
        cards={cards}
        onChanged={() => void load(userId)}
      />

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
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },

    // Inline segmented toggle row (owner ask 1) — centered, sized to content.
    toggleRow: { alignItems: "center", paddingBottom: space(3) },

    listBody: { padding: space(4), flexGrow: 1 },
    // Column now: the name+trail row on top, an optional progress bar below it.
    row: { paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm, gap: space(1.5) },
    deckRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2) },
    // Nested under a folder header — indented like a file tree's children.
    rowNested: { paddingLeft: space(6) },
    rowPressed: { backgroundColor: c.surface },
    deckName: { ...type.body, color: c.text, flex: 1, minWidth: 0 },
    due: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },
    // "New" reads muted/informational (owner ask 4: "new counts in text2");
    // "Learn" keeps its own amber so the three counts still read apart.
    newCount: { ...type.small, fontWeight: "700", color: c.text2, fontVariant: ["tabular-nums"] },
    learnCount: { ...type.small, fontWeight: "700", color: c.warn, fontVariant: ["tabular-nums"] },
    done: { ...type.small, color: c.good },
    // The trailing cluster: counts (or ✓) then the '›' affordance.
    deckTrail: { flexDirection: "row", alignItems: "center", gap: space(2) },
    deckChevron: { ...type.body, color: c.text3, marginLeft: space(0.5) },
    emptyWrap: { paddingTop: space(10) },

    // Study's PROGRESS identity (owner ask 4) — a thin learned-ratio bar under
    // each deck row; skipped entirely when the deck has no cards to rate.
    progressTrack: { height: 3, borderRadius: 2, backgroundColor: c.line2, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 2, backgroundColor: c.accent },

    // Collapsible folder header row — now carries a muted card total
    // alongside the existing accent due+new badge (owner ask 4).
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    folderName: { ...type.bodyStrong, color: c.text2, flex: 1, minWidth: 0, textTransform: "uppercase", letterSpacing: 0.4, fontSize: type.micro.fontSize },
    folderTrail: { flexDirection: "row", alignItems: "center", gap: space(2) },
    folderTotal: { ...type.small, fontWeight: "600", color: c.text3, fontVariant: ["tabular-nums"] },

    // Inline Tests/Mindmaps placeholder (owner ask 1) — replaces the deck list
    // area while one of those two is the active segment.
    comingSoonWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },

    // The one lower-left "add" glass FAB (owner ask 2).
    fabWrap: { position: "absolute", left: space(4) },
    fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 1, borderColor: c.line },
    fabInner: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Stats sheet content (unchanged; only its trigger moved into the toggle).
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
    statTile: { width: "47%", backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingVertical: space(3.5), paddingHorizontal: space(3), gap: space(0.5) },
    statValue: { fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
    statLabel: { ...type.small, color: c.text2 },
    streakRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(4), paddingTop: space(3), borderTopWidth: 1, borderTopColor: c.line },
    streakLabel: { ...type.body, color: c.text2 },
    streakValue: { ...type.small, color: c.text3 },
  });
