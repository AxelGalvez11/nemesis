import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SlideUpSheet } from "./StudySheet";
import { MessageBody } from "./MessageBody";
import { MissionButton } from "./mission-ui";
import { ChevronIcon, CloseIcon, FolderIcon, SearchIcon } from "./icons";
import {
  deleteStudyCard,
  setStudyCardFlag,
  setStudyCardSuspended,
  updateStudyCard,
  type CloudStudyCard,
  type CloudStudyDeck,
} from "@/api/cloudStudy";
import { pathLeaf } from "@/lib/study-tree";
import { fromEditText, hasCardImage, toEditText } from "@/lib/card-image-tokens";
import { normalizeCardText } from "@/lib/card-text";
import { previewOf } from "@/lib/note-tabs";
import {
  applyBrowseFilter,
  buildBrowseRows,
  buildBrowseSections,
  buildDeckTree,
  searchRevealed,
  type BrowseRowFilter,
  type BrowseSectionKey,
} from "@/lib/study-browse";
import { STUDY_FLAG_COLORS, studyFlagColor } from "@/lib/study-flags";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// The Study "Browse" sheet — THREE PAGES, not one filtered list (owner
// 2026-07-24: "screen should have 3 pages: decks, cards, the specific card …
// need a toggle for this centered up top below the search bar … users are
// brought to the page with decks, tags, and flags, these sections should all
// have collapsable ability, then when users click on a deck, the next page shows
// all the cards in the selected section").
//
// WHAT THIS REPLACES, and why it isn't a tweak. The old sheet was one flat list
// of every card with a segmented picker above it choosing whether you were
// filtering by Status, Decks or Tags — one group visible at a time, because all
// three at once ate the whole sheet before a card appeared. That worked but it
// inverted the shape of the job: you had to already know which deck you wanted
// before the screen would help you. Now Decks / Tags / Flags are the CONTENT of
// the page you land on, each collapsible, each row carrying its card count, and
// tapping one is navigation rather than filtering.
//
// Consequences worth naming:
//  - The filter-group picker is GONE. It occupied the exact slot the owner wants
//    the page toggle in, and keeping both would stack two segmented controls.
//  - The "active filters" summary line is gone with it. It existed only because
//    a filter could be set in a group you couldn't see; once the sections are
//    the page, page 2's header says where you are instead.
//  - Editing moved from expand-in-place to page 3. The [image 1] token handling
//    that keeps storage URLs off the screen came with it unchanged — see
//    saveEdit, which also refuses to save rather than silently dropping images
//    if the captured originals ever went missing.
//
// Still deliberately out of scope, as before: web's Anki .apkg export, AI
// auto-tag, card-type change, and image-occlusion editing.

// REVISED 2026-07-31 (owner). Three changes, and two of them had to land
// together:
//
//  - The Decks/Cards/Card toggle is GONE ("remove the 'decks, cards, card'
//    toggle"). 🔴 IT WAS ALSO THE ONLY WAY BACK. "All cards" widened the filter
//    but never changed the page, so dropping the toggle on its own would have
//    made tapping a deck a one-way door. Each page below the first now carries a
//    back chevron, and the sheet's title says where you are — which is what the
//    toggle was really being read for anyway.
//  - The search box hides until you pull the list down, the iOS convention
//    ("hide the search bar unless user swipes down to reveal it"). The rule is
//    in lib/study-browse.ts, where it is tested.
//  - Decks nest. See buildDeckTree, and the note there about why the flat list
//    was right until folder rows existed to indent under.

/** Which of the three pages is on screen. */
type BrowsePage = "sections" | "cards" | "card";

/** No row selected — page 2 then lists everything. */
const ALL_CARDS: BrowseRowFilter = { scope: "all", deckId: null, tag: null, flag: null };

/** Tags and Flags start folded so all three section headers are visible at once
 *  — the whole point of a section list. Decks is the landing content and stays
 *  open. */
const INITIAL_COLLAPSED: BrowseSectionKey[] = ["tags", "flags"];

export function StudyBrowseSheet({
  visible,
  onClose,
  userId,
  decks,
  cards,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  decks: CloudStudyDeck[];
  cards: CloudStudyCard[];
  /** Re-fetch after an edit/delete so the list reflects the change. */
  onChanged: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const cardStyles = useThemedStyles(createMarkdownStyles);
  const { colors: c } = useTheme();

  const [page, setPage] = useState<BrowsePage>("sections");
  const [query, setQuery] = useState("");
  const [rowFilter, setRowFilter] = useState<BrowseRowFilter>(ALL_CARDS);
  /** The label of the row page 2 came from, so its header can say so. Empty
   *  when nothing is selected. */
  const [fromLabel, setFromLabel] = useState("");
  const [collapsed, setCollapsed] = useState<Set<BrowseSectionKey>>(() => new Set(INITIAL_COLLAPSED));
  /** Deck FOLDERS that are folded shut, by path. Empty = everything open, which
   *  is deliberate: this list was flat until today, so starting folded would
   *  make decks the student could see yesterday disappear behind a chevron. */
  const [deckFolded, setDeckFolded] = useState<Set<string>>(() => new Set());
  /** Whether the search box is down. Pull the list past its top to bring it in;
   *  see searchRevealed. */
  const [searchShowing, setSearchShowing] = useState(false);
  /** 0 = the box is away and the "Search" caption is showing, 1 = the box is
   *  down. Everything about the reveal reads off this one value so the box and
   *  the caption can never both be mid-way through their own animation.
   *
   *  Owner 2026-08-01: "it does not have an animation to make it feel smooth".
   *  It was a bare conditional — the box and the caption swapped between two
   *  frames, and because they are different heights the whole list jumped a row
   *  with them. */
  const searchReveal = useSharedValue(0);
  /** The box's natural height, measured rather than assumed. The field is a
   *  minHeight row, so a hard-coded number would clip it the moment anything in
   *  it grew, and a reveal that clips is worse than one that cuts. */
  const [searchFieldH, setSearchFieldH] = useState(0);
  const [searchNudgeH, setSearchNudgeH] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editFlag, setEditFlag] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The images lifted out of the card being edited, so save can put them back
  // exactly as they were. Refs, not state: nothing renders from them, and a
  // re-render between opening the editor and saving must not lose them. They
  // survive moving between pages because all three pages live in THIS
  // component — nothing unmounts underneath them.
  const frontImages = useRef<string[]>([]);
  const backImages = useRef<string[]>([]);

  // Reset every time the sheet opens so a stale filter / open card from last
  // time doesn't linger.
  useEffect(() => {
    if (!visible) return;
    setPage("sections");
    setQuery("");
    setRowFilter(ALL_CARDS);
    setFromLabel("");
    setCollapsed(new Set(INITIAL_COLLAPSED));
    setDeckFolded(new Set());
    setSearchShowing(false);
    setOpenId(null);
    setEditing(false);
    setError(null);
  }, [visible]);

  const rows = useMemo(() => buildBrowseRows(cards, decks), [cards, decks]);
  // The query goes IN, so a row's number is the number of cards tapping it
  // produces. The search box lives above the toggle and therefore stays set when
  // you come back to this page — counting without it let a row read 12 and open
  // onto 3, with the cause sitting in a field you stopped looking at.
  const sections = useMemo(() => buildBrowseSections(rows, decks, query), [rows, decks, query]);
  const filtered = useMemo(() => applyBrowseFilter(rows, { ...rowFilter, query }), [rows, rowFilter, query]);
  const deckTree = useMemo(
    () => buildDeckTree(sections.find((section) => section.key === "decks")?.rows ?? [], deckFolded),
    [sections, deckFolded],
  );
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const deckLeafById = useMemo(() => new Map(decks.map((deck) => [deck.id, pathLeaf(deck.name)])), [decks]);
  const open = openId ? cardById.get(openId) ?? null : null;

  // The card page can outlive its card — a refetch after an edit somewhere else,
  // or the same card deleted from the web app — and page 3 with nothing to draw
  // is a blank sheet whose toggle has just greyed out the way back. Fall to the
  // list instead.
  useEffect(() => {
    if (page === "card" && !open) {
      setPage("cards");
      setEditing(false);
    }
  }, [page, open]);

  /** One step back up the three pages. The toggle used to be the only way, and
   *  the "All cards" link only ever cleared the filter — so page 2 could be
   *  entered and not left. */
  function goBack() {
    if (page === "card") {
      setPage("cards");
      setEditing(false);
      return;
    }
    setPage("sections");
    setRowFilter(ALL_CARDS);
    setFromLabel("");
  }

  /** Every list on this sheet reports its scroll position here, so the box
   *  behaves the same wherever you pull from. */
  function onListScroll(offsetY: number) {
    setSearchShowing((showing) => searchRevealed(showing, offsetY, query));
  }

  // The one place the animation is driven from. Deliberately a plain style
  // animation on a shared value rather than an entering/exiting layout
  // animation: this sheet can be rendered inside a native Modal (SlideUpSheet's
  // `portal`), where Reanimated's layout animations are unreliable — the same
  // reason MiniMenu opens with no entrance at all.
  useEffect(() => {
    searchReveal.value = withTiming(searchShowing ? 1 : 0, {
      duration: 220,
      easing: ReEasing.out(ReEasing.cubic),
    });
  }, [searchShowing, searchReveal]);

  // Height AND opacity together. Height alone slides the list without the box
  // ever appearing to arrive; opacity alone leaves a hole in the layout the
  // whole time. The small downward travel is what makes it read as the box
  // coming DOWN, which is the gesture that asked for it.
  const searchFieldStyle = useAnimatedStyle(() => ({
    height: searchFieldH * searchReveal.value,
    opacity: searchReveal.value,
    transform: [{ translateY: (searchReveal.value - 1) * 6 }],
  }));
  // The caption occupies the slot when the box does not, and gets out of the
  // way on exactly the same curve so the rows below move once, not twice.
  const searchNudgeStyle = useAnimatedStyle(() => ({
    height: searchNudgeH * (1 - searchReveal.value),
    opacity: 1 - searchReveal.value,
  }));

  function toggleDeckFolder(path: string) {
    setDeckFolded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleSection(key: BrowseSectionKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Tapping a Decks / Tags / Flags row: page 2, showing exactly that row's
   *  cards. The search box is left alone on purpose — narrowing inside a deck
   *  you just picked is the normal next move. */
  function openRow(filter: BrowseRowFilter, label: string) {
    setRowFilter(filter);
    setFromLabel(label);
    setError(null);
    setPage("cards");
  }

  function openCard(card: CloudStudyCard) {
    setOpenId(card.id);
    setEditing(false);
    setError(null);
    setPage("card");
  }

  /** Typing jumps to the Cards page. The box sits above the toggle, so it reads
   *  as searching the whole collection — and it does: a search is over cards,
   *  and the section list has nothing to show for one. Clearing the text leaves
   *  you on Cards rather than yanking you back mid-thought. */
  function onQueryChange(next: string) {
    setQuery(next);
    if (next.trim() && page === "sections") setPage("cards");
  }

  function startEdit(card: CloudStudyCard) {
    setEditing(true);
    setError(null);
    // A picture on a card is TEXT — a markdown image or an <img> tag whose src
    // is a ~130-character storage URL. Every other surface launders that before
    // you see it; the edit fields used to bind the raw string, so opening a
    // card with images gave you a wall of URL with your own sentence lost in it
    // (owner 2026-07-24: "users can see supabase url when editing cards"). Swap
    // each one for "[image 1]" here and swap it back on save — see
    // lib/card-image-tokens.ts, which is reversible by construction because
    // this text is what gets written back to the database.
    const frontEdit = toEditText(card.front);
    const backEdit = toEditText(card.back);
    setEditFront(frontEdit.text);
    setEditBack(backEdit.text);
    frontImages.current = frontEdit.images;
    backImages.current = backEdit.images;
    setEditFlag(card.flag);
  }

  async function run(work: () => Promise<unknown>, opts?: { closeAfter?: boolean }): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
      if (opts?.closeAfter) {
        setEditing(false);
        setOpenId(null);
        setPage("cards");
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function saveEdit(card: CloudStudyCard) {
    // REFUSE rather than strip. A card whose text holds pictures was shown to
    // you as "[image 1]"; the real URLs live only in the refs above. If those
    // ever came back empty while the stored card still has an image, writing
    // this text would delete the picture and there would be nothing to undo it
    // with — so stop, and say so, instead.
    if (
      (frontImages.current.length === 0 && hasCardImage(card.front)) ||
      (backImages.current.length === 0 && hasCardImage(card.back))
    ) {
      setError("Reopen this card before saving — its pictures weren't loaded.");
      return;
    }
    // Put the real images back BEFORE the empty check: a card that is nothing
    // but a picture reads as "[image 1]" in the field, and testing the token
    // text would be testing the wrong string.
    const front = fromEditText(editFront, frontImages.current).trim();
    const back = fromEditText(editBack, backImages.current).trim();
    if (!front || !back) {
      setError("Add both a front and a back.");
      return;
    }
    void run(async () => {
      await updateStudyCard(userId, card.id, front, back);
      if (editFlag !== card.flag) await setStudyCardFlag(userId, card.id, editFlag);
    }).then((ok) => {
      // Only leave edit mode on success — a failed save keeps the student's text
      // and the error visible instead of silently discarding both.
      if (ok) setEditing(false);
    });
  }

  function confirmDelete(card: CloudStudyCard) {
    Alert.alert("Delete this card?", "It's removed permanently, along with its review history.", [
      { style: "cancel", text: "Cancel" },
      {
        style: "destructive",
        text: "Delete",
        onPress: () => void run(() => deleteStudyCard(userId, card.id), { closeAfter: true }),
      },
    ]);
  }

  return (
    <SlideUpSheet
      visible={visible}
      onClose={onClose}
      // The title carries what the toggle used to: which of the three pages you
      // are on, and — on page 2 — which row you opened.
      title={page === "sections" ? "Browse cards" : page === "card" ? "Card" : fromLabel || "All cards"}
      page
      testID="study-browse-sheet"
    >
      {page !== "sections" ? (
        <Pressable onPress={goBack} hitSlop={8} style={styles.backRow} accessibilityRole="button" testID="study-browse-back">
          {/* The list chevron, turned to point back the way the Library's does. */}
          <View style={styles.chevronBack}>
            <ChevronIcon size={15} color={c.accent} />
          </View>
          <Text style={styles.backLabel}>{page === "card" ? fromLabel || "All cards" : "Decks"}</Text>
        </Pressable>
      ) : null}

      {/* Search — down only while it is wanted (see searchRevealed), and it
          ANIMATES in and out now rather than blinking between two frames.
          Both slots stay MOUNTED and collapse to nothing, which is what lets
          them be measured and what keeps their two curves in step; the old
          either/or swapped two different-height nodes and shunted the list. */}
      <Reanimated.View style={[styles.searchClip, searchFieldStyle]} pointerEvents={searchShowing ? "auto" : "none"}>
        <View
          style={styles.searchField}
          // Measured, not assumed. searchField is a minHeight row, so a constant
          // would clip it the day anything inside grows. Reported from an inner
          // View because the animated wrapper's height must not be what it
          // measures — the child lays out at its natural size and is clipped,
          // which is exactly the reading we want.
          onLayout={(e) => {
            const next = e.nativeEvent.layout.height;
            setSearchFieldH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
          }}
        >
          <SearchIcon size={16} color={c.textHint} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={onQueryChange}
            // Short enough to read whole in the field (owner 2026-07-24: "search
            // bar should not have text cutoff"), and in textHint, the app's one
            // genuinely faint tone — text3 was flattened to be identical to body
            // text, so the old placeholder looked like something already typed.
            placeholder="Search cards"
            placeholderTextColor={c.textHint}
            autoCorrect={false}
            autoCapitalize="none"
            testID="study-browse-search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <CloseIcon size={13} color={c.text3} />
            </Pressable>
          ) : null}
        </View>
      </Reanimated.View>
      {/* 🔴 TAPPABLE, NOT JUST A LABEL — this is the whole reachability of
          search on Android. Android's ScrollView clamps its offset to
          [0, max]: an overscroll draws the edge glow and NEVER reports a
          negative position, so searchRevealed's pull test can never fire there.
          With the page toggle gone there is no other way in, and a shipped
          surface whose search cannot be opened is not a smaller bug for being
          on the second platform. The unit tests cannot catch this: they feed
          synthetic negative offsets the platform will not produce.
          pointerEvents goes dead while the box is down so the collapsed
          caption can never swallow a tap meant for the field above it. */}
      <Reanimated.View style={[styles.searchClip, searchNudgeStyle]} pointerEvents={searchShowing ? "none" : "auto"}>
        <Pressable
          onPress={() => setSearchShowing(true)}
          hitSlop={8}
          accessibilityRole="button"
          testID="study-browse-search-nudge"
          onLayout={(e) => {
            const next = e.nativeEvent.layout.height;
            setSearchNudgeH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
          }}
        >
          <Text style={styles.searchNudge}>Search</Text>
        </Pressable>
      </Reanimated.View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* PAGE 1 — Decks / Tags / Flags, each collapsible. */}
      {page === "sections" ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listInner}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          testID="study-browse-sections"
        >
          {cards.length === 0 && decks.length === 0 ? (
            <Text style={styles.empty}>No decks yet.</Text>
          ) : (
            sections.map((section) => {
              const folded = collapsed.has(section.key);
              return (
                <View key={section.key} style={styles.sectionCard} testID={`study-browse-section-${section.key}`}>
                  <Pressable
                    onPress={() => toggleSection(section.key)}
                    style={({ pressed }) => [styles.sectionHead, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !folded }}
                    testID={`study-browse-section-${section.key}-toggle`}
                  >
                    {/* One chevron, rotated — pointing right when folded, down
                        when open, the same affordance as the Library tree. */}
                    <View style={folded ? undefined : styles.chevronOpen}>
                      <ChevronIcon size={14} color={c.text3} />
                    </View>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionCount}>{section.rows.length}</Text>
                  </Pressable>

                  {folded ? null : section.rows.length === 0 ? (
                    <Text style={styles.sectionEmpty}>{section.key === "decks" ? "No decks yet." : "Nothing here yet."}</Text>
                  ) : section.key === "decks" ? (
                    // Decks NEST (owner 2026-07-31). A deck's folder is a prefix
                    // inside its own name and has no row of its own in the
                    // database, so buildDeckTree makes those rows up — see the
                    // note there. The old path SUBLINE is gone with the change:
                    // the folder heading above the row says the same thing.
                    deckTree.map((entry) =>
                      entry.type === "folder" ? (
                        <Pressable
                          key={`folder:${entry.path}`}
                          onPress={() => toggleDeckFolder(entry.path)}
                          style={({ pressed }) => [styles.sectionRow, { paddingLeft: space(3) + entry.depth * space(4) }, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: !entry.collapsed }}
                          testID={`study-browse-deck-folder-${entry.path}`}
                        >
                          <View style={entry.collapsed ? undefined : styles.chevronOpen}>
                            <ChevronIcon size={13} color={c.text3} />
                          </View>
                          <FolderIcon size={20} color={c.text2} strokeWidth={1.8} />
                          <View style={styles.rowText}>
                            <Text style={styles.rowLabel} numberOfLines={1}>{entry.label}</Text>
                          </View>
                          <View style={styles.rowCountPill}>
                            <Text style={styles.rowCount}>{entry.count}</Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable
                          key={entry.row.id}
                          onPress={() => openRow(entry.row.filter, entry.row.label)}
                          style={({ pressed }) => [styles.sectionRow, { paddingLeft: space(3) + entry.depth * space(4) }, pressed && styles.pressed]}
                          accessibilityRole="button"
                          testID={`study-browse-row-${entry.row.id}`}
                        >
                          {/* A spacer the width of a folder row's chevron, so deck
                              names at the same depth line up with folder names
                              rather than sitting one glyph to the left. */}
                          <View style={styles.chevronGap} />
                          <View style={styles.rowText}>
                            <Text style={styles.rowLabel} numberOfLines={1}>{entry.row.label}</Text>
                          </View>
                          <View style={styles.rowCountPill}>
                            <Text style={styles.rowCount}>{entry.row.count}</Text>
                          </View>
                        </Pressable>
                      ),
                    )
                  ) : (
                    section.rows.map((row) => (
                      <Pressable
                        key={row.id}
                        onPress={() => openRow(row.filter, row.label)}
                        style={({ pressed }) => [styles.sectionRow, pressed && styles.pressed]}
                        accessibilityRole="button"
                        testID={`study-browse-row-${row.id}`}
                      >
                        {row.hex ? <View style={[styles.rowFlagDot, { backgroundColor: row.hex }]} /> : null}
                        <View style={styles.rowText}>
                          <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
                        </View>
                        <View style={styles.rowCountPill}>
                          <Text style={styles.rowCount}>{row.count}</Text>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : null}

      {/* PAGE 2 — the cards in whatever you tapped. */}
      {page === "cards" ? (
        <>
          <View style={styles.countRow}>
            {/* The row's NAME moved up to the sheet title, so this is just the
                tally. "All cards" is gone with it: the back chevron does that
                job, and does it without leaving you on a page whose heading no
                longer matches what it is showing. */}
            <Text style={styles.count} numberOfLines={1} testID="study-browse-count">
              {filtered.length} {filtered.length === 1 ? "card" : "cards"}
            </Text>
          </View>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listInner}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            testID="study-browse-list"
          >
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{cards.length === 0 ? "No cards yet." : "No cards match this."}</Text>
            ) : (
              filtered.map((row) => {
                // The full card (with scheduling fields the edit ops need) — the
                // filter rows carry only the browse subset. Every filtered id
                // came from `cards`, so a miss is purely defensive.
                const live = cardById.get(row.card.id);
                if (!live) return null;
                const flag = studyFlagColor(live.flag);
                return (
                  <Pressable
                    key={row.card.id}
                    onPress={() => openCard(live)}
                    style={({ pressed }) => [styles.cardRow, pressed && styles.pressed]}
                    accessibilityRole="button"
                    testID={`study-browse-card-${row.card.id}`}
                  >
                    <View style={styles.cardHeadText}>
                      <View style={styles.frontLine}>
                        {flag ? <View style={[styles.rowFlagDot, { backgroundColor: flag.hex }]} /> : null}
                        <Text style={styles.front} numberOfLines={1}>{previewOf(normalizeCardText(live.front), 200)}</Text>
                      </View>
                      <Text style={styles.deckName} numberOfLines={1}>
                        {row.deckName}
                        {live.suspended ? "  ·  Suspended" : ""}
                      </Text>
                    </View>
                    <ChevronIcon size={14} color={c.textHint} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </>
      ) : null}

      {/* PAGE 3 — one card, read then edit. */}
      {page === "card" && open ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listInner}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          testID="study-browse-card"
        >
          <Text style={styles.cardDeck} numberOfLines={1}>
            {deckLeafById.get(open.deckId) ?? ""}
            {open.suspended ? "  ·  Suspended" : ""}
          </Text>

          {!editing ? (
            <View testID="study-browse-card-read">
              <Text style={styles.fieldLabel}>Front</Text>
              <MessageBody content={normalizeCardText(open.front)} styles={cardStyles} />
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>Back</Text>
              <MessageBody content={normalizeCardText(open.back)} styles={cardStyles} />
              <View style={styles.actionRow}>
                <ActionText label="Edit" onPress={() => startEdit(open)} disabled={busy} testID="study-browse-edit" />
                <ActionText
                  label={open.suspended ? "Unsuspend" : "Suspend"}
                  onPress={() => void run(() => setStudyCardSuspended(userId, open.id, !open.suspended))}
                  disabled={busy}
                  testID="study-browse-suspend"
                />
                <ActionText label="Delete" danger onPress={() => confirmDelete(open)} disabled={busy} testID="study-browse-delete" />
              </View>
            </View>
          ) : (
            <View testID="study-browse-card-edit">
              <Text style={styles.fieldLabel}>Front</Text>
              <TextInput style={styles.editInput} value={editFront} onChangeText={setEditFront} multiline placeholderTextColor={c.textHint} testID="study-browse-edit-front" />
              <Text style={styles.fieldLabel}>Back</Text>
              <TextInput style={styles.editInput} value={editBack} onChangeText={setEditBack} multiline placeholderTextColor={c.textHint} testID="study-browse-edit-back" />
              <Text style={styles.fieldLabel}>Flag</Text>
              <View style={styles.flagRow}>
                <Pressable onPress={() => setEditFlag(0)} style={[styles.flagNone, editFlag === 0 && styles.flagNoneActive]} testID="study-browse-edit-flag-0">
                  <Text style={styles.flagNoneText}>None</Text>
                </Pressable>
                {STUDY_FLAG_COLORS.map((f) => (
                  <Pressable
                    key={f.value}
                    onPress={() => setEditFlag(f.value)}
                    hitSlop={6}
                    accessibilityLabel={`${f.name} flag`}
                    testID={`study-browse-edit-flag-${f.value}`}
                    style={[styles.flagDotWrap, editFlag === f.value && styles.flagDotWrapActive]}
                  >
                    <View style={[styles.flagDot, { backgroundColor: f.hex }]} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.editButtons}>
                <Pressable onPress={() => setEditing(false)} hitSlop={6} style={styles.cancelBtn} testID="study-browse-edit-cancel">
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <MissionButton
                  label={busy ? "Saving…" : "Save"}
                  variant="primary"
                  busy={busy}
                  disabled={busy || !editFront.trim() || !editBack.trim()}
                  onPress={() => saveEdit(open)}
                  testID="study-browse-edit-save"
                />
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}
    </SlideUpSheet>
  );
}

function ActionText({ label, onPress, danger, disabled, testID }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.actionText, pressed && styles.pressed]} testID={testID}>
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger, disabled && styles.actionLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingHorizontal: space(3),
      // minHeight, not height: the sheet's animated body cap could squeeze a
      // fixed 40 and clip the field along with it. flexShrink:0 for the same
      // reason.
      minHeight: control.lg,
      flexShrink: 0,
      backgroundColor: c.surface2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: space(2.5),
    },
    // The cutoff (owner 2026-07-24): a bare fontSize with `padding: 0` and no
    // lineHeight left RN measuring the line box at about the font size, so
    // descenders — the tails on g, y, p — were shaved off inside the 40pt row.
    // Spelling out lineHeight and zeroing only the paddings is the shape the
    // chat composer already uses.
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: type.small.fontSize,
      lineHeight: type.small.lineHeight,
      paddingVertical: 0,
      paddingHorizontal: 0,
    },

    // The way back, in place of the toggle that used to be the only one.
    backRow: { flexDirection: "row", alignItems: "center", gap: space(1), paddingVertical: space(1), marginBottom: space(2), alignSelf: "flex-start" },
    chevronBack: { transform: [{ rotate: "180deg" }] },
    backLabel: { ...type.small, color: c.accent, fontWeight: "600" },
    // Where the search box sits when it is not down.
    // The animated slot both the box and the caption live in. overflow hidden is
    // what makes an animated height a REVEAL rather than a squash — without it
    // the field would compress towards nothing instead of sliding out of view.
    searchClip: { overflow: "hidden", flexShrink: 0 },
    searchNudge: { ...type.micro, color: c.textHint, textAlign: "center", marginBottom: space(2.5) },
    // As wide as the folder rows' chevron, so a deck name lines up with the
    // folder names beside it instead of hanging one glyph to the left.
    chevronGap: { width: 13 },

    // Section headers and rows (page 1).
    sectionCard: {
      backgroundColor: c.surface2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
      marginBottom: space(3),
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      minHeight: control.lg,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    sectionTitle: { ...type.bodyStrong, color: c.text, fontWeight: "600", marginRight: "auto" },
    sectionCount: { ...type.small, color: c.text3, fontVariant: ["tabular-nums"] },
    sectionEmpty: { ...type.small, color: c.textHint, paddingVertical: space(3), paddingHorizontal: space(4) },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      minHeight: control.lg + space(1),
      paddingVertical: space(2),
      paddingHorizontal: space(3),
      borderBottomWidth: 1,
      borderBottomColor: c.line2,
    },
    rowText: { flexShrink: 1, marginRight: "auto", gap: 1 },
    rowLabel: { ...type.body, color: c.text },
    rowCountPill: {
      minWidth: 32,
      height: 26,
      paddingHorizontal: space(2),
      borderRadius: radius.pill,
      backgroundColor: c.raised,
      alignItems: "center",
      justifyContent: "center",
    },
    rowCount: { ...type.micro, color: c.text2, fontWeight: "700", fontVariant: ["tabular-nums"] },

    flagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space(1.5), marginBottom: space(2) },
    flagDotWrap: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: "transparent", alignSelf: "center" },
    flagDotWrapActive: { borderColor: c.text2 },
    flagDot: { width: 16, height: 16, borderRadius: 8 },
    flagNone: { paddingVertical: space(1), paddingHorizontal: space(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
    flagNoneActive: { borderColor: c.accent, backgroundColor: c.accentFaint },
    flagNoneText: { ...type.micro, color: c.text2 },

    error: { ...type.small, color: c.danger, marginBottom: space(1.5) },
    countRow: { flexDirection: "row", alignItems: "center", marginBottom: space(1.5) },
    count: { ...type.micro, color: c.text3, flexShrink: 1 },

    // This is a full page now, so the list owns all remaining height.
    list: { flex: 1 },
    listInner: { paddingTop: space(1), paddingBottom: space(4) },
    empty: { ...type.small, color: c.text3, textAlign: "center", paddingVertical: space(8) },

    cardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      minHeight: control.lg + space(3),
      paddingVertical: space(3),
      paddingHorizontal: space(3),
      backgroundColor: c.surface2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: space(2),
    },
    pressed: { backgroundColor: c.surface },
    cardHeadText: { gap: 2, flexShrink: 1, marginRight: "auto" },
    frontLine: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
    rowFlagDot: { width: 9, height: 9, borderRadius: 5 },
    front: { ...type.bodyStrong, color: c.text, flexShrink: 1 },
    deckName: { ...type.micro, color: c.text3 },

    cardDeck: { ...type.micro, color: c.text3, marginTop: space(2) },
    divider: { height: 1, backgroundColor: c.line2, marginVertical: space(3) },
    actionRow: { flexDirection: "row", gap: space(4), marginTop: space(4) },
    actionText: { paddingVertical: space(1) },
    actionLabel: { ...type.small, color: c.accent, fontWeight: "600" },
    actionLabelDanger: { color: c.danger },
    actionLabelDisabled: { opacity: 0.4 },

    fieldLabel: { ...type.micro, color: c.textHint, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1), marginTop: space(3) },
    editInput: {
      ...type.body,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      minHeight: 64,
      textAlignVertical: "top",
    },
    editButtons: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space(3), marginTop: space(3) },
    cancelBtn: { paddingVertical: space(2), paddingHorizontal: space(2) },
    cancelText: { ...type.body, color: c.text2 },
  });
