import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  InputAccessoryView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import { GlassSurface } from "./GlassSurface";
import { MiniMenu, type MenuAnchor, type MenuRow } from "./MiniMenu";
import { ChevronIcon, FolderIcon, PlusIcon } from "./icons";
import { createStudyCard, createStudyDeck, type CloudStudyDeck, type NewCardType } from "@/api/cloudStudy";
import { hasClozeDeletion, wrapCloze } from "@/lib/cloze-edit";
import { pathLeaf } from "@/lib/study-tree";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// The Study page's "add" sheet. ONE SlideUpSheet that walks a small internal
// step stack — menu -> new-group / new-cards -> back to menu.
//
// Owner 2026-07-23: the lower-left "+" was replaced by a top-right "…" menu
// whose "Create folder" / "New card" rows open this sheet DIRECTLY on the right
// step (see `initialStep`). Browsing moved out of here into its own full
// StudyBrowseSheet (search + filters + edit), so this sheet no longer carries a
// Browse step.
//
// New group: a deck named EXACTLY what the student types, no cards. Study has no
// server-side "group" row — deckGroupInfo (api/cloudStudy.ts) reads folders
// purely off a "Group::Subgroup::Leaf" deck-name prefix — so an "empty group" IS
// an empty deck the student can grow into a folder by adding another deck whose
// name shares that prefix.
//
// New cards: pick a deck, pick a card TYPE, type the card, insert into
// study_cards. Mirrors apps/web/lib/workspace/study-cloud-store.ts's createCard.
//
// Owner 2026-07-24, three changes to this step:
//
//  - "the deck selector should be minimenu dropdown". It was an inline scrolling
//    list capped at 22% of the screen — a second scroll area inside a scrolling
//    form, which on a long deck list meant scrolling within scrolling, and which
//    took up that space permanently even though the deck is picked once.
//  - "users should be able to select card type for adding new cards" — Basic or
//    Cloze, which changes what the form asks for. A cloze card is ONE piece of
//    text with deletions in it, not a front and a back, so the fields change
//    with the type rather than being labelled differently.
//  - "there should be an editing toolbar above the keyboard when editing cards
//    for cloze" — the cloze buttons ride the keyboard the way the note editor's
//    formatting pill does. It is a SEPARATE accessory view from the note
//    editor's: that toolbar writes markdown, and this one writes Anki syntax
//    into a specific field.

export type StudyAddStep = "menu" | "new-group" | "new-cards";

/** The cloze toolbar's accessory-view id. Distinct from the note editor's — the
 *  two write different syntax into different fields and must never share. */
const CLOZE_TOOLBAR_ID = "study-cloze-toolbar";

const CARD_TYPES: { id: NewCardType; label: string; hint: string }[] = [
  { hint: "A question on the front, its answer on the back.", id: "basic", label: "Basic" },
  { hint: "One passage with blanks — each blank becomes its own card.", id: "cloze", label: "Cloze" },
];

function titleForStep(step: StudyAddStep): string {
  switch (step) {
    case "new-group":
      return "New group";
    case "new-cards":
      return "New cards";
    default:
      return "Add to Study";
  }
}

export function StudyAddSheet({
  visible,
  onClose,
  userId,
  decks,
  onChanged,
  initialStep = "menu",
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  decks: CloudStudyDeck[];
  /** Fired after any successful create — the caller re-fetches from the cloud
   *  rather than this sheet threading optimistic state back up. */
  onChanged: () => void;
  /** Which step to open on (owner 2026-07-23: the "…" menu opens straight to
   *  "Create folder" / "New card"). Defaults to the little menu. */
  initialStep?: StudyAddStep;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [step, setStep] = useState<StudyAddStep>(initialStep);

  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [cardDeckId, setCardDeckId] = useState<string | null>(null);
  const [deckMenuAnchor, setDeckMenuAnchor] = useState<MenuAnchor | null>(null);
  const [cardType, setCardType] = useState<NewCardType>("basic");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSavedFlash, setCardSavedFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The front field's live selection, so the cloze buttons know what to wrap.
  const frontSelection = useRef({ end: 0, start: 0 });
  // Set by a toolbar action to move the caret; cleared as soon as the field
  // reports back, or the field would be stuck unable to move its own caret.
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(null);

  // Open straight onto the requested step (owner 2026-07-23) — the "…" menu
  // sends us to new-group / new-cards directly, the FAB used to always land on
  // the menu. Setting it on each open also serves as the reset-to-start.
  useEffect(() => {
    if (visible) setStep(initialStep);
  }, [visible, initialStep]);

  // Fresh fields every time the sheet opens (or the student switches steps) — a
  // stale "Added" flash or half-typed card from last visit shouldn't bleed in.
  useEffect(() => {
    if (!visible) return;
    setGroupName("");
    setCreatingGroup(false);
    setGroupError(null);
    setCardDeckId(decks[0]?.id ?? null);
    setCardType("basic");
    setFront("");
    setBack("");
    setSavingCard(false);
    setCardError(null);
    setCardSavedFlash(null);
    setForcedSelection(null);
    frontSelection.current = { end: 0, start: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // The deck dropdown's rows. Deck names carry their folder as a "Group::Leaf"
  // prefix, so the row shows the leaf with the group underneath it rather than
  // one long "Pharm::Cardio::Beta blockers" that truncates to nothing useful.
  const deckRows = useMemo<MenuRow[]>(
    () =>
      decks.map((deck) => ({
        key: deck.id,
        label: pathLeaf(deck.name),
        onPress: () => {
          setCardDeckId(deck.id);
          setDeckMenuAnchor(null);
        },
      })),
    [decks],
  );
  const selectedDeck = decks.find((deck) => deck.id === cardDeckId) ?? null;

  /** Wrap the front field's selection in a cloze deletion. Pure transform in
   *  lib/cloze-edit.ts; this only moves the result back into the field. */
  function applyCloze(opts?: { sameNumber?: boolean }) {
    const next = wrapCloze({ ...frontSelection.current, text: front }, opts);
    setFront(next.text);
    frontSelection.current = { end: next.end, start: next.start };
    setForcedSelection({ end: next.end, start: next.start });
  }

  const clozeReady = cardType !== "cloze" || hasClozeDeletion(front);
  const canSubmitCard =
    !!cardDeckId && !!front.trim() && (cardType === "cloze" ? clozeReady : !!back.trim()) && !savingCard;

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
      await createStudyCard(userId, cardDeckId, front, back, cardType);
      onChanged();
      setFront("");
      setBack("");
      frontSelection.current = { end: 0, start: 0 };
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
    // Full screen on the FORM steps (owner 2026-07-23: "the add new card should
    // be full screen") — the part-screen sheet left the Front and Back fields
    // under the keyboard the moment you tapped one. The little two-row menu
    // stays small; a half-empty full-screen sheet for two rows would be worse.
    <SlideUpSheet
      visible={visible}
      onClose={onClose}
      title={titleForStep(step)}
      fullScreen={step !== "menu"}
      testID="study-add-sheet"
    >
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
          // The form now has the whole screen, so it scrolls within it — with
          // the keyboard up there is still less room than the fields need.
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollInner}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            testID="study-add-new-cards"
          >
            <BackRow onPress={() => setStep("menu")} />
            {cardError ? <Text style={styles.sheetError}>{cardError}</Text> : null}

            {/* Deck — a dropdown, not an inline list (owner 2026-07-24). */}
            <Text style={styles.fieldLabel}>Deck</Text>
            <Pressable
              onPress={(event) => setDeckMenuAnchor({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
              style={({ pressed }) => [styles.dropdown, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Choose a deck"
              testID="study-add-deck-trigger"
            >
              <View style={styles.dropdownText}>
                <Text style={styles.dropdownLabel} numberOfLines={1}>
                  {selectedDeck ? pathLeaf(selectedDeck.name) : "Choose a deck"}
                </Text>
                {/* The folder the deck sits in, when it has one — two decks in
                    different units can share a leaf name. */}
                {selectedDeck && selectedDeck.name !== pathLeaf(selectedDeck.name) ? (
                  <Text style={styles.dropdownHint} numberOfLines={1}>
                    {selectedDeck.name.slice(0, selectedDeck.name.length - pathLeaf(selectedDeck.name).length - 2)}
                  </Text>
                ) : null}
              </View>
              {/* Chevron down — the dropdown affordance. */}
              <View style={styles.dropdownChevron}>
                <ChevronIcon size={14} color={c.text2} strokeWidth={2.2} />
              </View>
            </Pressable>

            {/* Card type — what the form below asks for depends on it. */}
            <Text style={styles.fieldLabel}>Card type</Text>
            <View style={styles.typeRow} testID="study-add-card-type">
              {CARD_TYPES.map((option) => {
                const on = option.id === cardType;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setCardType(option.id)}
                    style={({ pressed }) => [styles.typeBtn, on && styles.typeBtnOn, pressed && styles.rowPressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    testID={`study-add-card-type-${option.id}`}
                  >
                    <Text style={[styles.typeLabel, on && styles.typeLabelOn]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.stepHint}>{CARD_TYPES.find((o) => o.id === cardType)?.hint}</Text>

            <TextInput
              style={[styles.sheetInput, styles.sheetNoteInput, cardType === "cloze" && styles.clozeInput]}
              value={front}
              onChangeText={setFront}
              onSelectionChange={(e) => {
                frontSelection.current = e.nativeEvent.selection;
                if (forcedSelection) setForcedSelection(null);
              }}
              selection={forcedSelection ?? undefined}
              placeholder={cardType === "cloze" ? "Type the passage, then blank out the parts to test" : "Front"}
              placeholderTextColor={c.text3}
              multiline
              // The cloze toolbar belongs to THIS field only — it writes into
              // the passage, so it must not appear over the Extra field.
              inputAccessoryViewID={Platform.OS === "ios" && cardType === "cloze" ? CLOZE_TOOLBAR_ID : undefined}
              testID="study-add-card-front"
            />
            {/* Android has no accessory view, so the toolbar pins under the
                field instead — same placement rule the note editor uses. */}
            {Platform.OS !== "ios" && cardType === "cloze" ? (
              <ClozeToolbar onCloze={() => applyCloze()} onClozeSame={() => applyCloze({ sameNumber: true })} />
            ) : null}
            <TextInput
              style={[styles.sheetInput, styles.sheetNoteInput]}
              value={back}
              onChangeText={setBack}
              placeholder={cardType === "cloze" ? "Extra (optional)" : "Back"}
              placeholderTextColor={c.text3}
              multiline
              testID="study-add-card-back"
            />
            {cardType === "cloze" && front.trim() && !clozeReady ? (
              <Text style={styles.stepHint}>
                Select a word and tap "Blank" — a cloze card needs at least one blank.
              </Text>
            ) : null}
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
                disabled={!canSubmitCard}
                onPress={() => void submitNewCard()}
                testID="study-add-card-submit"
              />
            </View>
          </ScrollView>
        )
      ) : null}

      {/* The deck dropdown, opening at the trigger. `portal` because this is
          the one MiniMenu inside a panel rather than at a screen root: the
          anchor is a window coordinate, and without it the menu would open the
          sheet's own top offset (~120pt) below the finger. */}
      <MiniMenu
        visible={deckMenuAnchor !== null}
        anchor={deckMenuAnchor}
        actions={deckRows}
        emptyText="No decks yet."
        onClose={() => setDeckMenuAnchor(null)}
        portal
        testID="study-add-deck-menu"
      />

      {/* The cloze toolbar riding the keyboard (iOS). */}
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={CLOZE_TOOLBAR_ID} backgroundColor="transparent">
          <ClozeToolbar onCloze={() => applyCloze()} onClozeSame={() => applyCloze({ sameNumber: true })} />
        </InputAccessoryView>
      ) : null}
    </SlideUpSheet>
  );
}

/** The cloze buttons above the keyboard. "Blank" hides the selection as a new
 *  card; "Same blank" hides it along with the previous one — Anki's two cloze
 *  actions, in the words a student would use rather than "c1"/"c2". */
function ClozeToolbar({ onCloze, onClozeSame }: { onCloze: () => void; onClozeSame: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.toolbarRail} pointerEvents="box-none">
      <GlassSurface style={styles.toolbarPill} fallbackColor={c.glassMenu} opaque shadow>
        <View style={styles.toolbarRow}>
          <Pressable
            onPress={onCloze}
            style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Blank out the selection"
            testID="study-cloze-new"
          >
            <Text style={styles.toolLabel}>Blank</Text>
          </Pressable>
          <Pressable
            onPress={onClozeSame}
            style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Blank out the selection on the same card"
            testID="study-cloze-same"
          >
            <Text style={styles.toolLabel}>Same blank</Text>
          </Pressable>
        </View>
      </GlassSurface>
    </View>
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
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.menuText}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

/** A "‹ Back" affordance for the sheet's non-menu steps — SlideUpSheet's own
 *  header only has a title + close X, so this lives inside the body. */
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

    // flexShrink (not a fixed height) so the sheet body stays the one owner of
    // "how tall" — the app-wide contract for a sheet's scroll area.
    formScroll: { flexShrink: 1 },
    formScrollInner: { paddingBottom: space(2) },

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

    // Step: new cards — the deck dropdown + the card-type picker.
    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1.5) },
    // The deck trigger reads like a field, so the form has one visual language.
    dropdown: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      marginBottom: space(3),
    },
    dropdownText: { flex: 1, minWidth: 0, gap: 1 },
    dropdownLabel: { ...type.body, color: c.text },
    dropdownHint: { ...type.micro, color: c.text3 },
    dropdownChevron: { transform: [{ rotate: "90deg" }] },

    typeRow: { flexDirection: "row", gap: space(2), marginBottom: space(2) },
    typeBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      height: control.lg,
      borderRadius: control.lg / 2,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    typeBtnOn: { backgroundColor: c.accentFaint, borderColor: c.accent },
    typeLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    typeLabelOn: { color: c.accent },
    // A cloze passage is the whole card, so it gets more room to start with.
    clozeInput: { minHeight: 120 },

    // The cloze toolbar — same floating-pill shape as the note editor's
    // formatting bar, so the two read as one idea in two places.
    toolbarRail: { alignItems: "center", paddingBottom: space(2), paddingHorizontal: space(3) },
    toolbarPill: { borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, overflow: "hidden", maxWidth: "100%" },
    toolbarRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(1.5) },
    toolBtn: { height: control.lg, paddingHorizontal: space(3.5), borderRadius: control.lg / 2, alignItems: "center", justifyContent: "center" },
    toolBtnPressed: { backgroundColor: c.surface2 },
    toolLabel: { ...type.small, color: c.text, fontWeight: "600" },
  });
