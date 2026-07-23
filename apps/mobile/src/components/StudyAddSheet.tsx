import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SlideUpSheet } from "./StudySheet";
import { MissionButton } from "./mission-ui";
import { FolderIcon, PlusIcon } from "./icons";
import { createStudyCard, createStudyDeck, type CloudStudyDeck } from "@/api/cloudStudy";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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
// New cards: pick a deck, type front/back, insert into study_cards. Mirrors
// apps/web/lib/workspace/study-cloud-store.ts's createCard (card_type "basic").

export type StudyAddStep = "menu" | "new-group" | "new-cards";

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
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<StudyAddStep>(initialStep);

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
    setFront("");
    setBack("");
    setSavingCard(false);
    setCardError(null);
    setCardSavedFlash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, step]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

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
          </ScrollView>
        )
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

    // Step: new cards — the deck picker.
    fieldLabel: { ...type.micro, color: c.text3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: space(1.5) },
    deckPickList: { borderWidth: 1, borderColor: c.line, borderRadius: radius.md, marginBottom: space(3) },
    deckPickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(2), paddingVertical: space(2.5), paddingHorizontal: space(3) },
    deckPickLabel: { ...type.small, color: c.text, flex: 1 },
    deckPickLabelActive: { color: c.accent, fontWeight: "600" },
    deckPickCheck: { color: c.accent, fontWeight: "700" },
  });
