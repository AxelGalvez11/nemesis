import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronIcon, FolderIcon } from "@/components/icons";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { SlideUpSheet } from "@/components/StudySheet";
import { TOP_BAR_BUTTON, TOP_BAR_PAD_TOP } from "@/components/TopBar";
import { StudyAddSheet, type StudyAddStep } from "@/components/StudyAddSheet";
import { StudyBrowseSheet } from "@/components/StudyBrowseSheet";
import {
  StudyModeMenu,
  StudyModePopup,
  TRIGGER_HEIGHT,
  type StudyModeKey,
} from "@/components/StudyModeMenu";
import { DragChip } from "@/components/DragChip";
import { FolderPickerSheet, RowActionsSheet, TextPromptSheet, type RowAction } from "@/components/RowActionSheets";
import { RootDropZone } from "@/components/RootDropZone";
import { useRowDrag } from "@/components/useRowDrag";
import {
  countsForCards,
  deckGroupInfo,
  deleteStudyDeck,
  deleteStudyGroup,
  fetchCloudStudy,
  moveStudyDeck,
  moveStudyGroup,
  renameStudyDeck,
  renameStudyGroup,
  type CloudStudyCard,
  type CloudStudyDeck,
  type DeckCounts,
} from "@/api/cloudStudy";
import { allGroupPaths, buildDeckTree, flattenDeckTree, type DeckSort, type DeckTreeRow } from "@/lib/deck-tree";
import { decksInGroup, isWithinGroup, pathLeaf, pathParent } from "@/lib/study-tree";
import { deckRetention } from "@/lib/study-progress";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

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

/** Which row a long press opened the actions menu for. A folder here is purely a
 *  "::"-prefix shared by some decks — it has no row of its own server-side — so
 *  its actions fan out across every deck beneath it (see lib/study-tree.ts). */
type StudyRowTarget = { kind: "deck"; id: string; name: string } | { kind: "folder"; path: string; label: string };

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
  const { setHeaderCenter, setHeaderRight } = useShell();
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

  // The top-right "…" menu (owner 2026-07-23, replacing the lower-left "+")
  // opens these. StudyAddSheet now opens straight to a step (Create folder /
  // New card); Browse is its own full sheet.
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addSheetStep, setAddSheetStep] = useState<StudyAddStep>("menu");
  const [browseOpen, setBrowseOpen] = useState(false);
  // The header "…" actions dropdown.
  const [actionsOpen, setActionsOpen] = useState(false);
  // Deck ordering (owner 2026-07-23 → Sorting) and its picker sheet.
  const [sortMode, setSortMode] = useState<DeckSort>("due");
  const [sortOpen, setSortOpen] = useState(false);
  // Multi-select mode (owner 2026-07-23 → Select / Move to): a set of row keys
  // ("deck:<id>" / "folder:<path>") the student has ticked, plus its move sheet.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [selectMoveOpen, setSelectMoveOpen] = useState(false);

  // Long-press row actions (owner 2026-07-22, same ask as the Library's).
  const [rowTarget, setRowTarget] = useState<StudyRowTarget | null>(null);
  const [rowSheet, setRowSheet] = useState<"actions" | "rename" | "move" | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

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

  // The "…" actions button, top-right (owner 2026-07-23) — only on Cards, since
  // Tests/Mindmaps have nothing to add/sort/browse yet. It toggles the actions
  // dropdown rendered at this screen's root below. Cleared on leaving Cards / on
  // unmount.
  useEffect(() => {
    setHeaderRight(
      activeMode === "cards" ? (
        <GlassSurface style={styles.kebabBtn} fallbackColor={c.glassPanel} tint={actionsOpen ? c.accentFaint : undefined} shadow>
          <Pressable
            style={styles.kebabInner}
            onPress={() => setActionsOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Study actions"
            accessibilityState={{ expanded: actionsOpen }}
            testID="study-actions-btn"
          >
            <DotsIcon size={20} color={actionsOpen ? c.accent : c.text2} />
          </Pressable>
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [activeMode, actionsOpen, c, styles, setHeaderRight]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

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

  // --- long-press row actions (owner 2026-07-22) ----------------------------
  // Rename / Move / Delete on decks and folders. A folder operation rewrites the
  // "::" prefix on every deck under it, so each one ends with a full reload
  // rather than trying to patch the tree in place.

  const closeRowSheets = useCallback(() => {
    setRowSheet(null);
    setRowTarget(null);
    setRowError(null);
  }, []);

  const applyRowChange = useCallback(
    async (work: () => Promise<unknown>, opts?: { inline?: boolean }) => {
      if (!userId) return;
      setRowBusy(true);
      setRowError(null);
      try {
        await work();
        closeRowSheets();
        await load(userId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "That didn't work.";
        if (opts?.inline) setRowError(message);
        else {
          closeRowSheets();
          Alert.alert("Couldn't do that", message);
        }
      } finally {
        setRowBusy(false);
      }
    },
    [userId, load, closeRowSheets],
  );

  // Study deletes are PERMANENT — study_cards cascades off study_decks, so the
  // cards and their review history go with the deck. The library's equivalent is
  // recoverable; this one isn't, and the wording says so.
  const confirmDelete = useCallback(
    (target: StudyRowTarget) => {
      setRowSheet(null);
      const doomed = target.kind === "folder" ? decksInGroup(decks, target.path) : [];
      const cardCount =
        target.kind === "deck"
          ? cards.filter((card) => card.deckId === target.id).length
          : cards.filter((card) => doomed.some((deck) => deck.id === card.deckId)).length;
      const label = target.kind === "deck" ? pathLeaf(target.name) : target.label;
      const scope =
        target.kind === "deck"
          ? `${cardCount} card${cardCount === 1 ? "" : "s"}`
          : `${doomed.length} deck${doomed.length === 1 ? "" : "s"} and ${cardCount} card${cardCount === 1 ? "" : "s"}`;
      Alert.alert(
        `Delete "${label}"?`,
        `This permanently removes ${scope}, along with their review history. It can't be undone.`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setRowTarget(null) },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              void applyRowChange(() =>
                target.kind === "deck"
                  ? deleteStudyDeck(userId ?? "", target.id)
                  : deleteStudyGroup(userId ?? "", decks, target.path),
              ),
          },
        ],
      );
    },
    [applyRowChange, userId, decks, cards],
  );

  const onRenameConfirm = useCallback(
    (value: string) => {
      const target = rowTarget;
      if (!target || !userId) return;
      void applyRowChange(
        () =>
          target.kind === "deck"
            ? renameStudyDeck(userId, decks, target.id, value)
            : renameStudyGroup(userId, decks, target.path, value),
        { inline: true },
      );
    },
    [rowTarget, userId, decks, applyRowChange],
  );

  const onMovePick = useCallback(
    (folder: string) => {
      const target = rowTarget;
      if (!target || !userId) return;
      void applyRowChange(() =>
        target.kind === "deck"
          ? moveStudyDeck(userId, decks, target.id, folder)
          : moveStudyGroup(userId, decks, target.path, folder),
      );
    },
    [rowTarget, userId, decks, applyRowChange],
  );

  // --- hold-to-drag (owner 2026-07-23) --------------------------------------
  // Row keys are "deck:<id>" / "folder:<group path>". Dropping onto a folder
  // runs the same move the menu's "Move to…" does.
  const openRowMenu = useCallback(
    (rowKey: string) => {
      const rest = rowKey.slice(rowKey.indexOf(":") + 1);
      if (rowKey.startsWith("folder:")) {
        setRowTarget({ kind: "folder", label: pathLeaf(rest), path: rest });
        setRowSheet("actions");
        return;
      }
      const deck = decks.find((d) => d.id === rest);
      if (!deck) return;
      setRowTarget({ kind: "deck", id: deck.id, name: deck.name });
      setRowSheet("actions");
    },
    [decks],
  );

  const onRowDrop = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (!userId) return;
      const source = sourceKey.slice(sourceKey.indexOf(":") + 1);
      const destination = targetKey.slice(targetKey.indexOf(":") + 1);
      if (sourceKey.startsWith("folder:")) {
        void applyRowChange(() => moveStudyGroup(userId, decks, source, destination));
        return;
      }
      void applyRowChange(() => moveStudyDeck(userId, decks, source, destination));
    },
    [userId, decks, applyRowChange],
  );

  const rowDrag = useRowDrag({ onDrop: onRowDrop, onHold: openRowMenu });

  // --- multi-select bulk actions (owner 2026-07-23 → Select / Move to) -------
  // Runs a batch of writes over the ticked rows, reloads, and leaves select
  // mode. Sequential so one failure surfaces cleanly rather than half-applying
  // silently. `decks` is a fixed snapshot for the batch (fine — each move only
  // needs the source's own leaf/path); the reload afterwards reconciles.
  const runSelected = useCallback(
    (work: () => Promise<unknown>) => {
      if (!userId) return;
      setSelectMoveOpen(false);
      setRowBusy(true);
      void (async () => {
        try {
          await work();
          await load(userId);
          exitSelect();
        } catch (e) {
          Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Try again.");
        } finally {
          setRowBusy(false);
        }
      })();
    },
    [userId, load, exitSelect],
  );

  const moveSelected = useCallback(
    (folder: string) => {
      if (!userId) return;
      const keys = [...selectedKeys];
      runSelected(async () => {
        for (const key of keys) {
          const rest = key.slice(key.indexOf(":") + 1);
          if (key.startsWith("folder:")) await moveStudyGroup(userId, decks, rest, folder);
          else await moveStudyDeck(userId, decks, rest, folder);
        }
      });
    },
    [userId, selectedKeys, decks, runSelected],
  );

  const deleteSelected = useCallback(() => {
    if (!userId || selectedKeys.size === 0) return;
    const keys = [...selectedKeys];
    Alert.alert(
      `Delete ${keys.length} item${keys.length === 1 ? "" : "s"}?`,
      "This permanently removes the selected decks and folders, along with their cards and review history. It can't be undone.",
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete",
          onPress: () =>
            runSelected(async () => {
              for (const key of keys) {
                const rest = key.slice(key.indexOf(":") + 1);
                if (key.startsWith("folder:")) await deleteStudyGroup(userId, decks, rest);
                else await deleteStudyDeck(userId, rest);
              }
            }),
        },
      ],
    );
  }, [userId, selectedKeys, decks, runSelected]);

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

  // Row-action derivations. Every folder is a move destination; for a FOLDER
  // being moved, its own subtree is struck out (a folder can't go inside itself).
  const groupOptions = allGroupPaths(decks.map((deck) => deck.name));
  const rowLabel = rowTarget ? (rowTarget.kind === "deck" ? pathLeaf(rowTarget.name) : rowTarget.label) : "";
  const rowActions: RowAction[] = rowTarget
    ? [
        { key: "rename", label: "Rename", onPress: () => setRowSheet("rename") },
        { key: "move", label: "Move to…", onPress: () => setRowSheet("move") },
        { key: "delete", label: "Delete", destructive: true, onPress: () => confirmDelete(rowTarget) },
      ]
    : [];
  const moveDisabled =
    rowTarget?.kind === "folder" ? new Set(groupOptions.filter((g) => isWithinGroup(g, rowTarget.path))) : undefined;
  const rowCurrentGroup = rowTarget ? pathParent(rowTarget.kind === "deck" ? rowTarget.name : rowTarget.path) : "";
  // What the drag chip reads while a row is in flight — a deck's leaf name, or
  // a folder's own segment, never the full "::" path.
  const dragLabel = (() => {
    const key = rowDrag.activeKey;
    if (!key) return "";
    const rest = key.slice(key.indexOf(":") + 1);
    if (key.startsWith("folder:")) return pathLeaf(rest);
    return pathLeaf(decks.find((d) => d.id === rest)?.name ?? "");
  })();

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
      sortMode,
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
          contentContainerStyle={[styles.listBody, { paddingTop: contentTop, paddingBottom: insets.bottom + (selectMode ? 88 : space(6)) }]}
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
                body="Use the … menu in the top right to start a new group or add cards — or create decks on the Nemesis web app and they'll show up here automatically."
              />
            </View>
          ) : (
            rows.map((item) =>
              item.type === "folder" ? (
                <Animated.View key={`folder:${item.path}`} layout={LinearTransition.duration(220)}>
                  <GestureDetector
                    gesture={rowDrag.gestureFor(`folder:${item.path}`, {
                      // A folder can't be dropped inside itself, and moving it
                      // back into its own parent would be a no-op.
                      canDropOn: (targetKey) => {
                        const destination = targetKey.slice(targetKey.indexOf(":") + 1);
                        return !isWithinGroup(destination, item.path) && destination !== pathParent(item.path);
                      },
                      // No dragging while ticking rows in select mode.
                      draggable: !selectMode,
                    })}
                  >
                  <Pressable
                    ref={rowDrag.registerRow(`folder:${item.path}`, true)}
                    testID={`study-folder-${item.path}`}
                    onPress={() => (selectMode ? toggleSelect(`folder:${item.path}`) : toggleFolder(item.path))}
                    style={({ pressed }) => [
                      styles.folderRow,
                      { marginLeft: item.depth * INDENT_STEP },
                      pressed && styles.rowPressed,
                      rowDrag.overKey === `folder:${item.path}` && styles.rowDropTarget,
                      rowDrag.activeKey === `folder:${item.path}` && styles.rowDragging,
                      selectMode && selectedKeys.has(`folder:${item.path}`) && styles.rowSelected,
                    ]}
                  >
                    {selectMode ? <SelectDot on={selectedKeys.has(`folder:${item.path}`)} /> : null}
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
                  </GestureDetector>
                </Animated.View>
              ) : (
                <Animated.View
                  key={`deck:${item.deck.deck.id}`}
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(140)}
                  layout={LinearTransition.duration(220)}
                >
                  <GestureDetector
                    gesture={rowDrag.gestureFor(`deck:${item.deck.deck.id}`, {
                      // Dropping a deck back into the folder it already sits in
                      // would do nothing, so that target never lights up.
                      canDropOn: (targetKey) =>
                        targetKey.slice(targetKey.indexOf(":") + 1) !== pathParent(item.deck.deck.name),
                      draggable: !selectMode,
                    })}
                  >
                  <Pressable
                    // A deck is never a drop TARGET — decks aren't containers —
                    // but it registers so the drag can pick it up.
                    ref={rowDrag.registerRow(`deck:${item.deck.deck.id}`, false)}
                    testID={`deck-${item.deck.deck.id}`}
                    onPress={() =>
                      selectMode
                        ? toggleSelect(`deck:${item.deck.deck.id}`)
                        : router.push({ pathname: "/review", params: { deckId: item.deck.deck.id } })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      { marginLeft: item.depth * INDENT_STEP },
                      pressed && styles.rowPressed,
                      rowDrag.activeKey === `deck:${item.deck.deck.id}` && styles.rowDragging,
                      selectMode && selectedKeys.has(`deck:${item.deck.deck.id}`) && styles.rowSelected,
                    ]}
                  >
                    {selectMode ? <SelectDot on={selectedKeys.has(`deck:${item.deck.deck.id}`)} /> : null}
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
                  </GestureDetector>
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

      {/* Drop here to pull a deck or folder out to the top level. The key's
          suffix is "" — the empty group moveStudyDeck/moveStudyGroup already
          read as top level — so it needs no special case in onRowDrop. */}
      <RootDropZone
        ref={rowDrag.registerRow("root:", true)}
        active={rowDrag.activeKey !== null}
        over={rowDrag.overKey === "root:"}
        top={contentTop}
      />

      {/* Rides the finger during a drag; the row itself stays put and dims. */}
      <DragChip
        visible={rowDrag.activeKey !== null}
        label={dragLabel}
        fingerX={rowDrag.fingerX}
        fingerY={rowDrag.fingerY}
      />

      {/* Long-press row actions (owner 2026-07-22) — the same three sheets the
          Library tree uses, so the two trees behave identically. */}
      <RowActionsSheet
        visible={rowSheet === "actions"}
        title={rowLabel}
        subtitle={rowTarget?.kind === "folder" ? "Folder" : "Deck"}
        actions={rowActions}
        onClose={closeRowSheets}
        testID="study-row-actions"
      />
      <TextPromptSheet
        visible={rowSheet === "rename"}
        title={rowTarget?.kind === "folder" ? "Rename folder" : "Rename deck"}
        placeholder={rowTarget?.kind === "folder" ? "Folder name" : "Deck name"}
        initialValue={rowLabel}
        busy={rowBusy}
        error={rowError}
        onConfirm={onRenameConfirm}
        onClose={closeRowSheets}
        testID="study-rename-prompt"
      />
      <FolderPickerSheet
        visible={rowSheet === "move"}
        title={rowTarget?.kind === "folder" ? "Move folder to" : "Move deck to"}
        folders={groupOptions}
        currentFolder={rowCurrentGroup}
        disabledPaths={moveDisabled}
        rootLabel="Top level"
        onPick={onMovePick}
        onClose={closeRowSheets}
        testID="study-move-picker"
      />

      {/* The top-right "…" actions dropdown (owner 2026-07-23), replacing the
          lower-left "+". Anchored under the header button off the TopBar's own
          exported metrics; zIndex above the drop zone (20) so it paints on top
          on iOS. */}
      <StudyActionsPopup
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        topOffset={insets.top + TOP_BAR_PAD_TOP + TOP_BAR_BUTTON + space(1.5)}
        onCreateFolder={() => {
          setActionsOpen(false);
          setAddSheetStep("new-group");
          setAddSheetOpen(true);
        }}
        onNewCard={() => {
          setActionsOpen(false);
          setAddSheetStep("new-cards");
          setAddSheetOpen(true);
        }}
        onSelect={() => {
          setActionsOpen(false);
          setSelectedKeys(new Set());
          setSelectMode(true);
        }}
        onMoveTo={() => {
          // "Move to" enters the same multi-select mode; the bottom bar's
          // "Move to…" then does the move once rows are ticked.
          setActionsOpen(false);
          setSelectedKeys(new Set());
          setSelectMode(true);
        }}
        onSorting={() => {
          setActionsOpen(false);
          setSortOpen(true);
        }}
        onBrowse={() => {
          setActionsOpen(false);
          setBrowseOpen(true);
        }}
      />

      {/* Multi-select action bar — the selection's Move to / Delete, plus Cancel. */}
      {selectMode ? (
        <View style={[styles.selectBar, { paddingBottom: insets.bottom + space(2) }]} testID="study-select-bar">
          <Text style={styles.selectCount}>{selectedKeys.size} selected</Text>
          <View style={styles.selectActions}>
            <Pressable onPress={exitSelect} hitSlop={6} style={styles.selectBtn} testID="study-select-cancel">
              <Text style={styles.selectBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => selectedKeys.size > 0 && setSelectMoveOpen(true)}
              disabled={selectedKeys.size === 0}
              hitSlop={6}
              style={styles.selectBtn}
              testID="study-select-move"
            >
              <Text style={[styles.selectBtnText, selectedKeys.size === 0 && styles.selectBtnDisabled]}>Move to…</Text>
            </Pressable>
            <Pressable onPress={deleteSelected} disabled={selectedKeys.size === 0} hitSlop={6} style={styles.selectBtn} testID="study-select-delete">
              <Text style={[styles.selectBtnText, styles.selectBtnDanger, selectedKeys.size === 0 && styles.selectBtnDisabled]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
        initialStep={addSheetStep}
        onChanged={() => void load(userId)}
      />

      <StudyBrowseSheet
        visible={browseOpen}
        onClose={() => setBrowseOpen(false)}
        userId={userId}
        decks={decks}
        cards={cards}
        onChanged={() => void load(userId)}
      />

      {/* Sorting picker (owner 2026-07-23). Reuses the row-actions sheet chrome;
          a "✓" marks the current mode. */}
      <RowActionsSheet
        visible={sortOpen}
        title="Sort decks"
        actions={[
          { key: "due", label: sortMode === "due" ? "Due first  ✓" : "Due first", onPress: () => { setSortMode("due"); setSortOpen(false); } },
          { key: "alpha", label: sortMode === "alpha" ? "Name (A–Z)  ✓" : "Name (A–Z)", onPress: () => { setSortMode("alpha"); setSortOpen(false); } },
          { key: "cards", label: sortMode === "cards" ? "Card count  ✓" : "Card count", onPress: () => { setSortMode("cards"); setSortOpen(false); } },
        ]}
        onClose={() => setSortOpen(false)}
        testID="study-sort-sheet"
      />

      {/* Bulk "Move to" destination for the selected rows. currentFolder is a
          sentinel that matches no real folder, so every destination (including
          Top level) stays pickable for a mixed selection. */}
      <FolderPickerSheet
        visible={selectMoveOpen}
        title={`Move ${selectedKeys.size} item${selectedKeys.size === 1 ? "" : "s"} to`}
        folders={groupOptions}
        currentFolder={" __multi__"}
        rootLabel="Top level"
        onPick={moveSelected}
        onClose={() => setSelectMoveOpen(false)}
        testID="study-select-move-picker"
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

// The "…" header dropdown (owner 2026-07-23): Create folder / New card / Select
// / Move to / Sorting / Browse. Modeled on chat.tsx's ChatActionsPopup — a
// transparent tap-catcher + a glass menu — but it MUST carry a zIndex above the
// RootDropZone's 20, or on iOS the (higher-zIndex) drop zone would paint over it
// even though this renders later in the tree.
function StudyActionsPopup({
  visible,
  onClose,
  topOffset,
  onCreateFolder,
  onNewCard,
  onSelect,
  onMoveTo,
  onSorting,
  onBrowse,
}: {
  visible: boolean;
  onClose: () => void;
  topOffset: number;
  onCreateFolder: () => void;
  onNewCard: () => void;
  onSelect: () => void;
  onMoveTo: () => void;
  onSorting: () => void;
  onBrowse: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  if (!visible) return null;
  const rows: { key: string; label: string; onPress: () => void }[] = [
    { key: "create-folder", label: "Create folder", onPress: onCreateFolder },
    { key: "new-card", label: "New card", onPress: onNewCard },
    { key: "select", label: "Select", onPress: onSelect },
    { key: "move-to", label: "Move to…", onPress: onMoveTo },
    { key: "sorting", label: "Sorting", onPress: onSorting },
    { key: "browse", label: "Browse", onPress: onBrowse },
  ];
  return (
    <View style={[StyleSheet.absoluteFill, styles.actionsOverlay]} testID="study-actions-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View entering={FadeIn.duration(150)} style={[styles.actionsMenuWrap, { top: topOffset }]}>
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.glassPanel} opaque>
          {rows.map((row, index) => (
            <Pressable
              key={row.key}
              testID={`study-action-${row.key}`}
              onPress={row.onPress}
              style={({ pressed }) => [styles.actionsRow, index > 0 && styles.actionsDivider, pressed && styles.actionsRowPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.actionsLabel}>{row.label}</Text>
            </Pressable>
          ))}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Horizontal "…" for the header actions button. */
function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

/** The tick shown at the start of each row while multi-select is active. */
function SelectDot({ on }: { on: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.selectDot, on && styles.selectDotOn]}>
      {on ? <Text style={styles.selectDotCheck}>✓</Text> : null}
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
    // Drag-and-drop feedback (owner 2026-07-23): the folder under your finger
    // lights up, and the row you picked up fades so it's clear it's in flight.
    rowDropTarget: { backgroundColor: c.accentFaint, borderWidth: 1, borderColor: c.accentLine },
    rowDragging: { opacity: 0.4 },
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

    // The "…" header actions button + its dropdown (owner 2026-07-23).
    kebabBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    kebabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    // zIndex ABOVE RootDropZone's 20 so the menu paints over it on iOS.
    actionsOverlay: { zIndex: 40 },
    actionsMenuWrap: { position: "absolute", right: space(3), minWidth: 190 },
    actionsMenu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    actionsRow: { paddingVertical: space(3), paddingHorizontal: space(4) },
    actionsRowPressed: { backgroundColor: c.surface },
    actionsDivider: { borderTopWidth: 1, borderTopColor: c.line },
    actionsLabel: { ...type.body, color: c.text },

    // Multi-select: the ticked-row highlight, the leading tick, and the bottom
    // action bar.
    rowSelected: { borderWidth: 1, borderColor: c.accent, backgroundColor: c.accentFaint },
    selectDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.line2, alignItems: "center", justifyContent: "center", marginRight: space(1) },
    selectDotOn: { backgroundColor: c.accent, borderColor: c.accent },
    selectDotCheck: { color: c.onAccent, fontSize: 13, fontWeight: "800", lineHeight: 15 },
    selectBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(3),
      backgroundColor: c.raised,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    selectCount: { ...type.small, color: c.text2, fontWeight: "600" },
    selectActions: { flexDirection: "row", alignItems: "center", gap: space(4) },
    selectBtn: { paddingVertical: space(1.5) },
    selectBtnText: { ...type.body, color: c.accent, fontWeight: "600" },
    selectBtnDanger: { color: c.danger },
    selectBtnDisabled: { opacity: 0.4 },

    // Stats sheet content (unchanged; only its trigger moved into the toggle).
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
    statTile: { width: "47%", backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingVertical: space(3.5), paddingHorizontal: space(3), gap: space(0.5) },
    statValue: { ...type.display, fontVariant: ["tabular-nums"] },
    statLabel: { ...type.small, color: c.text2 },
    streakRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(4), paddingTop: space(3), borderTopWidth: 1, borderTopColor: c.line },
    streakLabel: { ...type.body, color: c.text2 },
    streakValue: { ...type.small, color: c.text3 },
  });
