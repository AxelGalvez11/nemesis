import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronIcon, FolderIcon, PlusIcon } from "@/components/icons";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { TOP_BAR_BUTTON, TOP_BAR_PAD_TOP } from "@/components/TopBar";
import { StudyAddSheet } from "@/components/StudyAddSheet";
import {
  StudyModeMenu,
  StudyModePopup,
  FAB_SIZE,
  TRIGGER_HEIGHT,
  type StudyModeKey,
} from "@/components/StudyModeMenu";
import {
  countsForCards,
  deckGroupInfo,
  fetchCloudStudy,
  type CloudStudyCard,
  type CloudStudyDeck,
  type DeckCounts,
} from "@/api/cloudStudy";
import { allGroupPaths, buildDeckTree, flattenDeckTree, type DeckTreeRow } from "@/lib/deck-tree";
import { deckRetention } from "@/lib/study-progress";
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
// "Group::Subgroup::Leaf" convention — replacing the old Mac-authored
// "# course:" header the desktop card-generation skill used to write.
// Group-less decks render ungrouped at the list's end.
//
// The tree is NESTED, every level of it (lib/deck-tree.ts, owner bug
// 2026-07-22). This screen used to flatten everything above the leaf into one
// label, so "Pharm::Cardio::Beta blockers" sat under a single folder called
// "Pharm::Cardio" with no "Pharm" parent at all. Now each segment is its own
// folder, missing parents are auto-created, a folder's counts sum every
// descendant (not just the decks directly inside it), and collapsing takes the
// whole subtree with it. Collapse state keys off the FULL path, never the
// label, since two parents can each hold a "Cardio".
//
// Folders start COLLAPSED the first time this screen loads data (owner
// 2026-07-20, "same in library") — a one-time seed keyed off the FIRST
// successful load, not every focus/pull-to-refresh, so a folder the student
// just opened never re-collapses under them mid-session. The seed covers every
// ancestor path (allGroupPaths), or expanding a root would reveal inner
// folders that were never collapsed.
//
// Deck rows are Anki-style CARDS now (owner 2026-07-21, matching their
// AnkiMobile reference crop): title + a "percent retention" line underneath,
// with the deck's due (green) and new (blue) counts stacked on the right —
// both always shown, zeros included, in Anki's own color language (owner
// picked it over brand colors). Retention is REAL math, not a guess
// (lib/study-progress.ts deckRetention): the grade RPC counts every review in
// `repetitions` and every "again" in `lapses`, so correct/total falls
// straight out of already-fetched card data. Counts stay the exact web
// cards-tab.tsx math (countsForCards); the amber "learn" number and the old
// mature-ratio bar left with this restyle (git history has both).
//
// The Cards/Tests/Mindmaps switcher is a liquid-glass DROPDOWN (owner
// 2026-07-22) whose trigger reads out the section you're in — "Cards ⌄" — so
// the control stays one tap wide. It IS this screen's header: it's published
// into the TopBar's center slot, where the word "Study" used to sit (same
// owner, later the same day), so the list gets that whole row back.
// Tests/Mindmaps aren't built yet, so selecting them swaps the deck list for
// an inline "coming soon" panel rather than routing anywhere. Stats rides in
// the same menu as a trailing row; tapping it still opens the same
// numbers-only SlideUpSheet as before (due/new/total/decks — no invented
// streak metric).
//
// The one remaining FAB (lower-left) opens StudyAddSheet — New group / New
// cards / Browse, all backed by real study_decks/study_cards inserts mirrored
// from the web workspace (see StudyAddSheet.tsx's own header for specifics).

interface DeckRow {
  deck: CloudStudyDeck;
  leaf: string;
  counts: DeckCounts;
  /** Percent of reviews answered correctly (0..1), null before any review. */
  retention: number | null;
  cardCount: number;
}

/** One indent step per tree level. Read by both row kinds so a folder and the
 *  decks inside it line up on the same left edge. */
const INDENT_STEP = 14;

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
  const { setHeaderCenter } = useShell();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decks, setDecks] = useState<CloudStudyDeck[]>([]);
  const [cards, setCards] = useState<CloudStudyCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Folder collapse state — a set of FULL folder paths ("Pharm",
  // "Pharm::Cardio"), never labels: sibling subtrees can both hold a "Cardio",
  // and collapsing one must not shut the other. Defaults to collapsed on first
  // load (see appliedDefaultCollapseRef in load() below); a tap on a folder's
  // chevron toggles membership from there.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const appliedDefaultCollapseRef = useRef(false);
  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Cards/Tests/Mindmaps — a glass dropdown (StudyModeMenu) whose trigger
  // reads out the current section; `activeMode` decides which content area
  // below renders.
  const [activeMode, setActiveMode] = useState<StudyModeKey>("cards");

  // The lower-left Add FAB — New group / New cards / Browse in one sheet.
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  // Stats — moved off its own FAB into the toggle's trailing icon-segment;
  // the sheet's own content is unchanged.
  const [statsOpen, setStatsOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  // The section dropdown IS this screen's header (owner 2026-07-22: "remove
  // 'study' text and move the toggle for 'cards/tests/mindmaps' in its place").
  // It goes into the TopBar's center slot — where the "Study" label used to sit
  // — instead of a row of its own beneath the bar, which hands a whole row of
  // vertical space back to the deck list. The trigger already reads out the
  // section you're on ("Cards ⌄"), so dropping the word "Study" costs nothing:
  // the drawer is what says which tab you're in. Cleared on unmount so it never
  // leaks onto another screen.
  useEffect(() => {
    setHeaderCenter(<StudyModeMenu active={activeMode} open={modeMenuOpen} onToggle={() => setModeMenuOpen((v) => !v)} />);
    return () => setHeaderCenter(null);
  }, [activeMode, modeMenuOpen, setHeaderCenter]);

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
      // folder the student already opened this session. allGroupPaths returns
      // EVERY ancestor, so opening a root doesn't spill already-expanded
      // inner folders.
      if (!appliedDefaultCollapseRef.current) {
        appliedDefaultCollapseRef.current = true;
        setCollapsedFolders(new Set(allGroupPaths(nextDecks.map((deck) => deck.name))));
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

  // Unsorted on purpose: buildDeckTree owns ordering now (folders alphabetical,
  // decks due-first within their own level), so sorting here would just be
  // thrown away a line later.
  const deckRows: DeckRow[] = decks.map((deck) => {
    const { leaf } = deckGroupInfo(deck.name);
    const deckCards = cards.filter((card) => card.deckId === deck.id);
    return { cardCount: deckCards.length, counts: countsForCards(deckCards), deck, leaf, retention: deckRetention(deckCards) };
  });

  const totalActionable = deckRows.reduce((sum, d) => sum + d.counts.newCount + d.counts.dueCount, 0);
  const totalNew = deckRows.reduce((sum, d) => sum + d.counts.newCount, 0);
  const rows: DeckTreeRow<DeckRow>[] = flattenDeckTree(
    buildDeckTree(
      deckRows.map((row) => ({
        actionable: row.counts.newCount + row.counts.dueCount,
        deck: row,
        name: row.deck.name,
        total: row.cardCount,
      })),
    ),
    collapsedFolders,
  );

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
      {/* The section switcher lives in the TopBar now (see the setHeaderCenter
          effect above), so the list starts straight under the glass bar. Its
          menu is still rendered at this screen's root below, so it can hang
          over the deck list. */}
      {activeMode === "cards" ? (
        // A ScrollView (not FlatList) so reanimated's entering/exiting/layout animations
        // actually fire on collapse — every row renders (this list is small). Each deck row
        // fades + slides away when its folder collapses; folder rows just reflow.
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listBody, { paddingTop: contentTop, paddingBottom: insets.bottom + FAB_SIZE + space(4) }]}
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
                <Animated.View key={`folder:${item.path}`} layout={LinearTransition.duration(220)}>
                  <Pressable
                    testID={`study-folder-${item.path}`}
                    onPress={() => toggleFolder(item.path)}
                    style={({ pressed }) => [
                      styles.folderRow,
                      { marginLeft: item.depth * INDENT_STEP },
                      pressed && styles.rowPressed,
                    ]}
                  >
                    {/* Chevron points right when collapsed, down when open (owner 2026-07-20). */}
                    <View style={item.collapsed ? null : styles.chevronOpen}>
                      <ChevronIcon size={13} color={c.text2} strokeWidth={2.2} />
                    </View>
                    {/* Folder glyph so groups read as folders at a glance (owner 2026-07-21). */}
                    <FolderIcon size={15} color={c.text2} strokeWidth={1.9} />
                    {/* This folder's OWN segment — "Cardio", not "Pharm::Cardio".
                        The full path lives on item.path and keys the collapse set. */}
                    <Text style={styles.folderName} numberOfLines={1}>{item.label}</Text>
                    <View style={styles.folderTrail}>
                      {/* Muted card total (owner ask 4: "group headers with card
                          totals"), then the existing accent due+new badge —
                          same bare-colored-number language the deck rows use. */}
                      <Text style={styles.folderTotal}>{item.total}</Text>
                      {item.actionable > 0 ? <Text style={styles.folderDue}>{item.actionable}</Text> : null}
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
                    style={({ pressed }) => [
                      styles.row,
                      { marginLeft: item.depth * INDENT_STEP },
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.deckText}>
                      <Text style={styles.deckName} numberOfLines={1}>{item.deck.leaf}</Text>
                      {/* Real retention (deckRetention: correct reviews / total reviews),
                          or an honest "No reviews yet" — never a fake 0%. */}
                      <Text style={styles.deckRetention} numberOfLines={1}>
                        {item.deck.retention === null ? "No reviews yet" : `${Math.round(item.deck.retention * 100)}% retention`}
                      </Text>
                    </View>
                    {/* Anki's own color language (owner picked it over brand colors):
                        due stacked over new, green over blue, zeros included. */}
                    <View style={styles.deckTrail}>
                      <View style={styles.countStack}>
                        <Text style={styles.dueStackCount}>{item.deck.counts.dueCount}</Text>
                        <Text style={styles.newStackCount}>{item.deck.counts.newCount}</Text>
                      </View>
                      <Text style={styles.deckChevron}>›</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              ),
            )
          )}
        </ScrollView>
      ) : (
        <Animated.View key={activeMode} entering={FadeIn.duration(160)} style={[styles.comingSoonWrap, { paddingTop: contentTop }]} testID={`study-mode-panel-${activeMode}`}>
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
          <GlassSurface style={styles.fab} fallbackColor={c.glassPanel} shadow>
            <View style={styles.fabInner}>
              <PlusIcon size={22} color={c.text} />
            </View>
          </GlassSurface>
        </Pressable>
      </View>

      <StudyModePopup
        visible={modeMenuOpen}
        active={activeMode}
        // Hangs just under the trigger, which now sits in the TopBar: the bar's
        // top padding, plus the gap above a TRIGGER_HEIGHT control centered in a
        // TOP_BAR_BUTTON-tall row, plus the trigger itself. Derived from the
        // bar's own exported numbers so the two can't drift apart.
        topOffset={insets.top + TOP_BAR_PAD_TOP + (TOP_BAR_BUTTON + TRIGGER_HEIGHT) / 2 + space(1.5)}
        onSelect={setActiveMode}
        onStats={() => setStatsOpen(true)}
        onClose={() => setModeMenuOpen(false)}
      />

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

    listBody: { padding: space(4), flexGrow: 1 },
    // Anki-style deck CARD (owner 2026-07-21): a soft rounded surface holding
    // title + retention on the left, stacked due/new counts on the right.
    row: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2),
      paddingVertical: space(3), paddingHorizontal: space(3.5),
      borderRadius: radius.lg, backgroundColor: c.surface2, marginBottom: space(2),
    },
    // Tree indent is applied inline per row (depth * INDENT_STEP) rather than
    // as a style, since it varies with how deep the folder nests.
    // Cards dim as a whole when pressed (a bg swap would erase the card fill).
    rowPressed: { opacity: 0.65 },
    deckText: { flex: 1, minWidth: 0, gap: 2 },
    deckName: { ...type.body, color: c.text },
    deckRetention: { ...type.micro, color: c.text2 },
    // The trailing cluster: the due-over-new stack, then the '›' affordance.
    // Anki's colors on purpose (owner 2026-07-21): green due, blue new — the
    // palette's contrast-guarded good/info, so both read on either mode.
    deckTrail: { flexDirection: "row", alignItems: "center", gap: space(2) },
    countStack: { alignItems: "flex-end" },
    dueStackCount: { ...type.small, fontWeight: "700", color: c.good, fontVariant: ["tabular-nums"] },
    newStackCount: { ...type.small, fontWeight: "700", color: c.info, fontVariant: ["tabular-nums"] },
    deckChevron: { ...type.body, color: c.text3, marginLeft: space(0.5) },
    emptyWrap: { paddingTop: space(10) },

    // Collapsible folder header row — chevron + folder glyph + name, with the
    // muted card total and the accent due+new badge trailing.
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    // Same text SIZE as a deck row's title (owner 2026-07-22: "consistent text
    // size for folders and decks") — it used to be micro-sized. The uppercase +
    // letterSpacing went with the size bump: those exist to keep tiny label
    // text legible, and at full body size they just shout. A folder still
    // reads as a folder from its chevron, its glyph and the muted tone.
    folderName: { ...type.bodyStrong, color: c.text2, flex: 1, minWidth: 0 },
    folderTrail: { flexDirection: "row", alignItems: "center", gap: space(2) },
    folderTotal: { ...type.small, fontWeight: "600", color: c.text3, fontVariant: ["tabular-nums"] },
    folderDue: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },

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
