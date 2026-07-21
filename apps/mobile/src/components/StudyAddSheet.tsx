import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon, SearchIcon } from "./icons";
import { createStudyCard, createStudyDeck, type CloudStudyCard, type CloudStudyDeck } from "@/api/cloudStudy";
import { buildBrowseRows, filterBrowseRows } from "@/lib/study-browse";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The Study page's lower-left "add" sheet (owner 2026-07-20: "add a button
// lower left corner in study page so users can add 'group or cards or
// browse' ... a popup that pops out from the bottom"). ONE SlideUpSheet (the
// same idiom UpgradeSheet.tsx and calendar's EventSheet already use) that
// walks a small internal step stack — menu -> new-group / new-cards / browse
// -> back to menu — rather than three separate sheets, so there's exactly one
// add-entry point as asked.
//
// New group: a deck named EXACTLY what the student types, no cards. Study
// has no server-side "group" row — deckGroupInfo (api/cloudStudy.ts) reads
// folders purely off a "Group::Subgroup::Leaf" deck-name prefix — so an
// "empty group" IS an empty, ungrouped deck the student can grow into a
// folder later by adding another deck whose name shares that prefix.
//
// New cards: pick a deck, type front/back, insert into study_cards. Mirrors
// apps/web/lib/workspace/study-cloud-store.ts's createCard exactly (same
// insert columns; card_type always "basic" here — the mobile flow doesn't
// expose web's reversed/cloze/image-occlusion picker).
//
// Browse: every card, searchable by its front text or deck name, tap to
// reveal the back. VIEW-ONLY — apps/web/components/workspace/study/
// study-browser.tsx has no per-card delete (only "Delete deck" in its kebab
// menu), so this mirrors that rather than inventing a delete affordance web
// doesn't have.

type Step = "menu" | "new-group" | "new-cards" | "browse";

function titleForStep(step: Step): string {
  switch (step) {
    case "new-group":
      return "New group";
    case "new-cards":
      return "New cards";
    case "browse":
      return "Browse cards";
    default:
      return "Add to Study";
  }
}

export function StudyAddSheet({
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
  /** Fired after any successful create — the caller re-fetches from the cloud
   *  rather than this sheet threading optimistic state back up. */
  onChanged: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<Step>("menu");

  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [cardDeckId, setCardDeckId] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSavedFlash, setCardSavedFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [browseQuery, setBrowseQuery] = useState("");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Fresh fields every time the sheet opens (or the student switches steps) —
  // a stale "Added" flash or half-typed card from last visit should never
  // bleed into a new one.
  useEffect(() => {
    if (!visible) return;
    setGroupName("");
    setCreatingGroup(false);
    setGroupError(null);
    setCardDeckId(decks[0]?.id ?? null);
    setFront("");
    setBack("");
    setSavingCard(false);
    setCardError(null);
    setCardSavedFlash(null);
    setBrowseQuery("");
    setExpandedCardId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step]);

  // Reset back to the menu step only AFTER the close animation finishes, so
  // the sheet doesn't visibly snap back to "menu" mid-close (SlideUpSheet's
  // own close animation runs ~200ms).
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setStep("menu"), 220);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const browseRows = useMemo(() => buildBrowseRows(cards, decks), [cards, decks]);
  const filteredBrowseRows = useMemo(() => filterBrowseRows(browseRows, browseQuery), [browseRows, browseQuery]);
  // Leaves room for the header/back row/search field/insets above and below.
  const browseListMaxHeight = Math.round(height * 0.42);
  const deckPickMaxHeight = Math.round(height * 0.22);

  async function submitNewGroup() {
    const name = groupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    setGroupError(null);
    try {
      await createStudyDeck(userId, name);
      onChanged();
      onClose();
    } catch (cause) {
      setGroupError(cause instanceof Error ? cause.message : "Couldn't create that group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function submitNewCard() {
    if (!cardDeckId) return;
    setSavingCard(true);
    setCardError(null);
    setCardSavedFlash(null);
    try {
      await createStudyCard(userId, cardDeckId, front, back);
      onChanged();
      setFront("");
      setBack("");
      setCardSavedFlash("Added");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setCardSavedFlash(null), 2000);
    } catch (cause) {
      setCardError(cause instanceof Error ? cause.message : "Couldn't add that card.");
    } finally {
      setSavingCard(false);
    }
  }

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={titleForStep(step)} testID="study-add-sheet">
      {step === "menu" ? (
        <View testID="study-add-menu">
          <AddMenuRow
            icon={<FolderIcon size={18} color={c.text2} />}
            label="New group"
            hint="Start a new, empty deck"
            onPress={() => setStep("new-group")}
            testID="study-add-menu-new-group"
          />
          <AddMenuRow
            icon={<PlusIcon size={18} color={c.text2} />}
            label="New cards"
            hint="Add front/back cards to a deck"
            onPress={() => setStep("new-cards")}
            testID="study-add-menu-new-cards"
          />
          <AddMenuRow
            icon={<SearchIcon size={18} color={c.text2} />}
            label="Browse"
            hint="Search every card you have"
            onPress={() => setStep("browse")}
            testID="study-add-menu-browse"
          />
        </View>
      ) : null}

      {step === "new-group" ? (
        <View testID="study-add-new-group">
          <BackRow onPress={() => setStep("menu")} />
          <Text style={styles.stepHint}>
            Decks whose name shares a "Group::" prefix nest under that folder — name this one to match an existing
            group, or start a new one.
          </Text>
          {groupError ? <Text style={styles.sheetError}>{groupError}</Text> : null}
          <TextInput
            style={styles.sheetInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="e.g. Pharmacology or Pharmacology::Exam 3"
            placeholderTextColor={c.text3}
            autoFocus
            testID="study-add-group-name"
          />
          <MissionButton
            label={creatingGroup ? "Creating…" : "Create"}
            variant="primary"
            busy={creatingGroup}
            disabled={!groupName.trim() || creatingGroup}
            onPress={() => void submitNewGroup()}
            testID="study-add-group-submit"
          />
        </View>
      ) : null}

      {step === "new-cards" ? (
        decks.length === 0 ? (
          <View testID="study-add-new-cards-empty">
            <BackRow onPress={() => setStep("menu")} />
            <Text style={styles.stepHint}>Create a group first, then come back to add cards to it.</Text>
            <MissionButton label="New group" onPress={() => setStep("new-group")} testID="study-add-new-cards-go-group" />
          </View>
        ) : (
          <View testID="study-add-new-cards">
            <BackRow onPress={() => setStep("menu")} />
            {cardError ? <Text style={styles.sheetError}>{cardError}</Text> : null}
            <Text style={styles.fieldLabel}>Deck</Text>
            <ScrollView style={[styles.deckPickList, { maxHeight: deckPickMaxHeight }]} nestedScrollEnabled testID="study-add-deck-list">
              {decks.map((deck) => {
                const isActive = deck.id === cardDeckId;
                return (
                  <Pressable
                    key={deck.id}
                    onPress={() => setCardDeckId(deck.id)}
                    style={({ pressed }) => [styles.deckPickRow, pressed && styles.rowPressed]}
                    testID={`study-add-deck-${deck.id}`}
                  >
                    <Text style={[styles.deckPickLabel, isActive && styles.deckPickLabelActive]} numberOfLines={1}>
                      {deck.name}
                    </Text>
                    {isActive ? <Text style={styles.deckPickCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              style={[styles.sheetInput, styles.sheetNoteInput]}
              value={front}
              onChangeText={setFront}
              placeholder="Front"
              placeholderTextColor={c.text3}
              multiline
              testID="study-add-card-front"
            />
            <TextInput
              style={[styles.sheetInput, styles.sheetNoteInput]}
              value={back}
              onChangeText={setBack}
              placeholder="Back"
              placeholderTextColor={c.text3}
              multiline
              testID="study-add-card-back"
            />
            <View style={styles.sheetActions}>
              {cardSavedFlash ? (
                <Text style={styles.savedFlash} accessibilityLiveRegion="polite">
                  {cardSavedFlash}
                </Text>
              ) : (
                <View />
              )}
              <MissionButton
                label={savingCard ? "Adding…" : "Add card"}
                variant="primary"
                busy={savingCard}
                disabled={!cardDeckId || !front.trim() || !back.trim() || savingCard}
                onPress={() => void submitNewCard()}
                testID="study-add-card-submit"
              />
            </View>
          </View>
        )
      ) : null}

      {step === "browse" ? (
        <View testID="study-add-browse">
          <BackRow onPress={() => setStep("menu")} />
          <View style={styles.searchField}>
            <SearchIcon size={16} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={browseQuery}
              onChangeText={setBrowseQuery}
              placeholder="Search front text or deck"
              placeholderTextColor={c.text3}
              autoCorrect={false}
              autoCapitalize="none"
              testID="study-add-browse-search"
            />
            {browseQuery ? (
              <Pressable onPress={() => setBrowseQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <CloseIcon size={13} color={c.text3} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={[styles.browseList, { maxHeight: browseListMaxHeight }]} nestedScrollEnabled testID="study-add-browse-list">
            {filteredBrowseRows.length === 0 ? (
              <Text style={styles.browseEmpty}>{cards.length === 0 ? "No cards yet." : "No matches."}</Text>
            ) : (
              filteredBrowseRows.map((row) => {
                const expanded = expandedCardId === row.card.id;
                return (
                  <Pressable
                    key={row.card.id}
                    onPress={() => setExpandedCardId(expanded ? null : row.card.id)}
                    style={({ pressed }) => [styles.browseRow, pressed && styles.rowPressed]}
                    testID={`study-add-browse-card-${row.card.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                  >
                    <Text style={styles.browseFront} numberOfLines={expanded ? undefined : 1}>
                      {row.card.front}
                    </Text>
                    <Text style={styles.browseDeck} numberOfLines={1}>
                      {row.deckName}
                    </Text>
                    {expanded ? (
                      <View style={styles.browseAnswerBlock} testID={`study-add-browse-card-${row.card.id}-answer`}>
                        <View style={styles.browseDivider} />
                        <Text style={styles.browseBack}>{row.card.back}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
    </SlideUpSheet>
  );
}

function AddMenuRow({
  icon,
  label,
  hint,
  onPress,
  testID,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.menuText}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuHint}>{hint}</Text>
      </View>
      <ChevronIcon size={14} color={c.text3} />
    </Pressable>
  );
}

/** A "‹ Back" affordance for the sheet's non-menu steps — SlideUpSheet's own
 *  header only has a title + close X (read-only component, no back slot), so
 *  this lives inside the body instead. Same literal "‹" glyph review.tsx's
 *  own back button already uses, for a consistent feel. */
function BackRow({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.backRow} testID="study-add-back" accessibilityLabel="Back" accessibilityRole="button">
      <Text style={styles.backChevron}>‹</Text>
      <Text style={styles.backLabel}>Back</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Step 1: the menu.
    menuRow: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), paddingHorizontal: space(1), borderRadius: radius.sm },
    menuIcon: { width: 28, alignItems: "center" },
    menuText: { flex: 1, gap: 1 },
    menuLabel: { ...type.body, color: c.text },
    menuHint: { ...type.micro, color: c.text3 },
    rowPressed: { backgroundColor: c.surface },

    // Back affordance shared by every non-menu step.
    backRow: { flexDirection: "row", alignItems: "center", marginBottom: space(3) },
    backChevron: { fontSize: 20, lineHeight: 22, color: c.text2, marginRight: space(0.5), marginTop: -1 },
    backLabel: { ...type.small, color: c.text2, fontWeight: "600" },

    stepHint: { ...type.small, color: c.text3, marginBottom: space(3) },

    // Shared form-field look — mirrors calendar.tsx's EventSheet fields.
    sheetError: { ...type.small, color: c.danger, backgroundColor: c.surface2, borderRadius: radius.sm, padding: space(2.5), marginBottom: space(2) },
    sheetInput: {
      ...type.body,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      marginBottom: space(2.5),
    },
    sheetNoteInput: { minHeight: 72, textAlignVertical: "top" },
    sheetActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(1) },
    savedFlash: { ...type.small, color: c.good, fontWeight: "600" },

    // Step: new cards — the deck picker.
    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1.5) },
    deckPickList: { borderWidth: 1, borderColor: c.line, borderRadius: radius.md, marginBottom: space(3) },
    deckPickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(3) },
    deckPickLabel: { ...type.small, color: c.text, flex: 1 },
    deckPickLabelActive: { color: c.accent, fontWeight: "600" },
    deckPickCheck: { color: c.accent, fontWeight: "700" },

    // Step: browse.
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
      marginBottom: space(3),
    },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    browseList: { borderWidth: 1, borderColor: c.line, borderRadius: radius.md },
    browseRow: { paddingVertical: space(2.5), paddingHorizontal: space(3), borderBottomWidth: 1, borderBottomColor: c.line },
    browseFront: { ...type.small, color: c.text },
    browseDeck: { ...type.micro, color: c.text3, marginTop: 2 },
    browseAnswerBlock: { marginTop: space(2) },
    browseDivider: { height: 1, backgroundColor: c.line2, marginBottom: space(2) },
    browseBack: { ...type.small, color: c.text2 },
    browseEmpty: { ...type.small, color: c.text3, textAlign: "center", paddingVertical: space(6) },
  });
