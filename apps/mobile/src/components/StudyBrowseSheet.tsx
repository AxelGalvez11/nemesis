import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SlideUpSheet } from "./StudySheet";
import { MessageBody } from "./MessageBody";
import { MissionButton } from "./mission-ui";
import { CloseIcon, SearchIcon } from "./icons";
import {
  deleteStudyCard,
  setStudyCardFlag,
  setStudyCardSuspended,
  updateStudyCard,
  type CloudStudyCard,
  type CloudStudyDeck,
} from "@/api/cloudStudy";
import { pathLeaf } from "@/lib/study-tree";
import { normalizeCardText } from "@/lib/card-text";
import { previewOf } from "@/lib/note-tabs";
import {
  applyBrowseFilter,
  browseTags,
  buildBrowseRows,
  EMPTY_BROWSE_FILTER,
  type StudyBrowseFilter,
  type StudyBrowseScope,
} from "@/lib/study-browse";
import { STUDY_FLAG_COLORS, studyFlagColor } from "@/lib/study-flags";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The Study "Browse" sheet (owner 2026-07-23: the "…" menu's Browse "should
// bring up a popup from the bottom … expanded to full screen … the same pages
// as in browse in the web app"). Rides SlideUpSheet, so it swipes up toward full
// screen like every other sheet; the card list uses flexShrink:1 (not a fixed
// maxHeight) so it actually grows into the space the drag reveals.
//
// Mirrors web's study-browser.tsx sections on a phone: a search box, the Filters
// (All / Flagged [+ each color] / Suspended / Leeches), a per-deck filter, a
// Tags filter, and — tapping a card — a view/edit panel (front/back text, flag
// color, suspend, delete). Web's heavier extras (Anki .apkg export, AI auto-tag,
// card-type change, image-occlusion editing) are a deliberate follow-up.

const SCOPES: { key: StudyBrowseScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Flagged" },
  { key: "suspended", label: "Suspended" },
  { key: "leeches", label: "Leeches" },
];

// ONE filter group on screen at a time (owner 2026-07-23: "browse popup should
// only show one column at a time"). Web's browser can afford a permanent
// sidebar listing Status, Decks and Tags side by side; stacking those three as
// separate chip rows on a phone ate most of the sheet before a single card
// showed, and the rows clipped each other into half-visible pills.
//
// So: a segmented picker chooses which group you're filtering by, and only that
// group's chips are drawn. Nothing is lost — the summary line under the picker
// names every filter that is currently on, including ones from a group you
// can't see, so a hidden filter can never quietly narrow the list.
type FilterGroup = "status" | "decks" | "tags";

/** A chip is one line of `type.small` (22) plus 5pt of air top and bottom plus
 *  its hairline border; the row adds a couple of points so the border isn't
 *  flush against the scroller's edge. Written out rather than left to intrinsic
 *  sizing — see the note on `chipScroll`. */
const CHIP_HEIGHT = 34;
const CHIP_ROW_HEIGHT = 36;

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

  const [filter, setFilter] = useState<StudyBrowseFilter>(EMPTY_BROWSE_FILTER);
  const [group, setGroup] = useState<FilterGroup>("status");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editFlag, setEditFlag] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the sheet opens so a stale filter / open card from last
  // time doesn't linger.
  useEffect(() => {
    if (!visible) return;
    setFilter(EMPTY_BROWSE_FILTER);
    setGroup("status");
    setOpenId(null);
    setEditing(false);
    setError(null);
  }, [visible]);

  const rows = useMemo(() => buildBrowseRows(cards, decks), [cards, decks]);
  const tags = useMemo(() => browseTags(rows), [rows]);
  const filtered = useMemo(() => applyBrowseFilter(rows, filter), [rows, filter]);

  const patch = (next: Partial<StudyBrowseFilter>) => setFilter((prev) => ({ ...prev, ...next }));

  // A deck with no tags left offers no Tags group, so a filter sitting on it
  // would strand the picker on an empty row.
  const groups: { key: FilterGroup; label: string }[] = [
    { key: "status", label: "Status" },
    { key: "decks", label: "Decks" },
    ...(tags.length > 0 ? [{ key: "tags" as const, label: "Tags" }] : []),
  ];
  const shownGroup: FilterGroup = group === "tags" && tags.length === 0 ? "status" : group;

  // Every filter currently narrowing the list, named — including ones set in a
  // group that isn't on screen. This is what makes showing one group at a time
  // safe rather than confusing.
  const activeFilters: string[] = [];
  if (filter.scope !== "all") {
    activeFilters.push(SCOPES.find((scope) => scope.key === filter.scope)?.label ?? filter.scope);
  }
  if (filter.flag !== null) {
    activeFilters.push(STUDY_FLAG_COLORS.find((flag) => flag.value === filter.flag)?.name ?? "Flag");
  }
  if (filter.deckId !== null) {
    const deck = decks.find((item) => item.id === filter.deckId);
    if (deck) activeFilters.push(pathLeaf(deck.name));
  }
  if (filter.tag !== null) activeFilters.push(`#${filter.tag}`);
  if (filter.query.trim()) activeFilters.push(`"${filter.query.trim()}"`);

  function startEdit(card: CloudStudyCard) {
    setEditing(true);
    setError(null);
    setEditFront(card.front);
    setEditBack(card.back);
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
    const front = editFront.trim();
    const back = editBack.trim();
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

  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Browse cards" testID="study-browse-sheet">
      {/* Search */}
      <View style={styles.searchField}>
        <SearchIcon size={16} color={c.text3} />
        <TextInput
          style={styles.searchInput}
          value={filter.query}
          onChangeText={(query) => patch({ query })}
          placeholder="Search cards, decks, tags"
          placeholderTextColor={c.text3}
          autoCorrect={false}
          autoCapitalize="none"
          testID="study-browse-search"
        />
        {filter.query ? (
          <Pressable onPress={() => patch({ query: "" })} hitSlop={8} accessibilityLabel="Clear search">
            <CloseIcon size={13} color={c.text3} />
          </Pressable>
        ) : null}
      </View>

      {/* Which group you're filtering by — one on screen at a time. */}
      <View style={styles.groupRow}>
        {groups.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setGroup(item.key)}
            style={[styles.groupTab, shownGroup === item.key && styles.groupTabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: shownGroup === item.key }}
            testID={`study-browse-group-${item.key}`}
          >
            <Text style={[styles.groupTabLabel, shownGroup === item.key && styles.groupTabLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* The chosen group's chips. One row, fixed height — a horizontal scroller
          with no height of its own gets squeezed by the sheet's animated body
          cap and clips its own pills in half (owner screenshot, 2026-07-23). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollInner}
        keyboardShouldPersistTaps="handled"
        testID={`study-browse-chips-${shownGroup}`}
      >
        {shownGroup === "status" ? (
          <>
            {SCOPES.map((scope) => (
              <Chip
                key={scope.key}
                label={scope.label}
                active={filter.scope === scope.key}
                onPress={() => patch({ scope: scope.key, flag: null })}
                testID={`study-browse-scope-${scope.key}`}
              />
            ))}
            {/* Flag colours live inside Status, and only once you're looking at
                flagged cards — a colour picker means nothing otherwise. */}
            {filter.scope === "flagged"
              ? STUDY_FLAG_COLORS.map((flag) => (
                  <Pressable
                    key={flag.value}
                    onPress={() => patch({ flag: filter.flag === flag.value ? null : flag.value })}
                    hitSlop={6}
                    accessibilityLabel={`${flag.name} flag`}
                    accessibilityRole="button"
                    testID={`study-browse-flag-${flag.value}`}
                    style={[styles.flagDotWrap, filter.flag === flag.value && styles.flagDotWrapActive]}
                  >
                    <View style={[styles.flagDot, { backgroundColor: flag.hex }]} />
                  </Pressable>
                ))
              : null}
          </>
        ) : null}

        {shownGroup === "decks" ? (
          <>
            <Chip label="All decks" active={filter.deckId === null} onPress={() => patch({ deckId: null })} testID="study-browse-deck-all" />
            {decks.map((deck) => (
              <Chip
                key={deck.id}
                label={pathLeaf(deck.name)}
                active={filter.deckId === deck.id}
                onPress={() => patch({ deckId: filter.deckId === deck.id ? null : deck.id })}
                testID={`study-browse-deck-${deck.id}`}
              />
            ))}
          </>
        ) : null}

        {shownGroup === "tags" ? (
          <>
            <Chip label="All tags" active={filter.tag === null} onPress={() => patch({ tag: null })} testID="study-browse-tag-all" />
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={`#${tag}`}
                active={filter.tag === tag}
                onPress={() => patch({ tag: filter.tag === tag ? null : tag })}
                testID={`study-browse-tag-${tag}`}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.countRow}>
        <Text style={styles.count} numberOfLines={1} testID="study-browse-count">
          {filtered.length} {filtered.length === 1 ? "card" : "cards"}
          {activeFilters.length > 0 ? `  ·  ${activeFilters.join("  ·  ")}` : ""}
        </Text>
        {activeFilters.length > 0 ? (
          <Pressable onPress={() => setFilter(EMPTY_BROWSE_FILTER)} hitSlop={8} testID="study-browse-clear">
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {/* The list — flexShrink:1 so SlideUpSheet's drag-to-expand grows it. */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listInner} keyboardShouldPersistTaps="handled" testID="study-browse-list">
        {filtered.length === 0 ? (
          <Text style={styles.empty}>{cards.length === 0 ? "No cards yet." : "No cards match these filters."}</Text>
        ) : (
          filtered.map((row) => {
            // The full card (with scheduling fields the edit ops need) — the
            // filter rows carry only the browse subset. Every filtered id came
            // from `cards`, so a miss is purely defensive.
            const live = cardById.get(row.card.id);
            if (!live) return null;
            const isOpen = openId === row.card.id;
            const flag = studyFlagColor(live.flag);
            return (
              <View key={row.card.id} style={styles.cardRow} testID={`study-browse-card-${row.card.id}`}>
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                    setOpenId(isOpen ? null : row.card.id);
                  }}
                  style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <View style={styles.cardHeadText}>
                    <View style={styles.frontLine}>
                      {flag ? <View style={[styles.rowFlagDot, { backgroundColor: flag.hex }]} /> : null}
                      <Text style={styles.front} numberOfLines={isOpen ? undefined : 1}>
                        {previewOf(normalizeCardText(live.front), 200)}
                      </Text>
                    </View>
                    <Text style={styles.deckName} numberOfLines={1}>
                      {row.deckName}
                      {live.suspended ? "  ·  Suspended" : ""}
                    </Text>
                  </View>
                </Pressable>

                {isOpen && !editing ? (
                  <View style={styles.cardBody} testID={`study-browse-card-${row.card.id}-body`}>
                    <View style={styles.divider} />
                    <MessageBody content={normalizeCardText(live.back)} styles={cardStyles} />
                    <View style={styles.actionRow}>
                      <ActionText label="Edit" onPress={() => startEdit(live)} disabled={busy} testID="study-browse-edit" />
                      <ActionText
                        label={live.suspended ? "Unsuspend" : "Suspend"}
                        onPress={() => void run(() => setStudyCardSuspended(userId, live.id, !live.suspended))}
                        disabled={busy}
                        testID="study-browse-suspend"
                      />
                      <ActionText label="Delete" danger onPress={() => confirmDelete(live)} disabled={busy} testID="study-browse-delete" />
                    </View>
                  </View>
                ) : null}

                {isOpen && editing ? (
                  <View style={styles.cardBody} testID={`study-browse-card-${row.card.id}-edit`}>
                    <View style={styles.divider} />
                    <Text style={styles.fieldLabel}>Front</Text>
                    <TextInput style={styles.editInput} value={editFront} onChangeText={setEditFront} multiline placeholderTextColor={c.text3} testID="study-browse-edit-front" />
                    <Text style={styles.fieldLabel}>Back</Text>
                    <TextInput style={styles.editInput} value={editBack} onChangeText={setEditBack} multiline placeholderTextColor={c.text3} testID="study-browse-edit-back" />
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
                        onPress={() => saveEdit(live)}
                        testID="study-browse-edit-save"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SlideUpSheet>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} testID={testID} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
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
      height: 40,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: space(2.5),
    },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },

    // Segmented picker for which filter group is on screen.
    groupRow: { flexDirection: "row", backgroundColor: c.surface, borderRadius: radius.pill, padding: 3, marginBottom: space(2) },
    groupTab: { flex: 1, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
    groupTabActive: { backgroundColor: c.bg },
    groupTabLabel: { ...type.small, color: c.text3 },
    groupTabLabelActive: { color: c.text, fontWeight: "600" },

    flagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space(1.5), marginBottom: space(2) },
    flagDotWrap: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: "transparent", alignSelf: "center" },
    flagDotWrapActive: { borderColor: c.text2 },
    flagDot: { width: 16, height: 16, borderRadius: 8 },
    flagNone: { paddingVertical: space(1), paddingHorizontal: space(2.5), borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
    flagNoneActive: { borderColor: c.accent, backgroundColor: c.accentFaint },
    flagNoneText: { ...type.micro, color: c.text2 },

    // Explicit heights, not padding-derived ones: a horizontal ScrollView has no
    // intrinsic height of its own, so inside the sheet's animated maxHeight body
    // it was being squeezed and cutting its pills off mid-letter.
    chipScroll: { height: CHIP_ROW_HEIGHT, flexGrow: 0, flexShrink: 0, marginBottom: space(2) },
    chipScrollInner: { alignItems: "center", gap: space(1.5), paddingRight: space(4) },
    chip: {
      height: CHIP_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: space(3),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipLabel: { ...type.small, color: c.text2, maxWidth: 180 },
    chipLabelActive: { color: c.onAccent, fontWeight: "600" },

    error: { ...type.small, color: c.danger, marginBottom: space(1.5) },
    countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3), marginBottom: space(1.5) },
    count: { ...type.micro, color: c.text3, flexShrink: 1 },
    clearLabel: { ...type.micro, color: c.accent, fontWeight: "600" },

    // flexShrink:1 (NOT a fixed height) so SlideUpSheet's drag-to-expand grows
    // the list — the app-wide contract for a sheet's scroll body.
    list: { flexShrink: 1, borderTopWidth: 1, borderTopColor: c.line },
    listInner: { paddingBottom: space(2) },
    empty: { ...type.small, color: c.text3, textAlign: "center", paddingVertical: space(8) },

    cardRow: { borderBottomWidth: 1, borderBottomColor: c.line },
    cardHead: { paddingVertical: space(2.5), paddingHorizontal: space(1) },
    pressed: { backgroundColor: c.surface },
    cardHeadText: { gap: 2 },
    frontLine: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
    rowFlagDot: { width: 9, height: 9, borderRadius: 5 },
    front: { ...type.small, color: c.text, flexShrink: 1 },
    deckName: { ...type.micro, color: c.text3 },

    cardBody: { paddingHorizontal: space(1), paddingBottom: space(3) },
    divider: { height: 1, backgroundColor: c.line2, marginBottom: space(2.5) },
    actionRow: { flexDirection: "row", gap: space(4), marginTop: space(3) },
    actionText: { paddingVertical: space(1) },
    actionLabel: { ...type.small, color: c.accent, fontWeight: "600" },
    actionLabelDanger: { color: c.danger },
    actionLabelDisabled: { opacity: 0.4 },

    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1), marginTop: space(2) },
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
