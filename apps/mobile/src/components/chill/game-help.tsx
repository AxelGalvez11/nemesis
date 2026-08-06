// How to play — port of apps/web/components/workspace/break/game-help.tsx.
//
// The copy is the web's, with ONE class of edit: any line that named a key or a
// click ("Space flips direction", "the N key", "click a square") describes a
// control this device does not have. Those lines name the phone's control
// instead. Everything else is word for word, so the two apps teach the same
// game the same way.
//
// The "don't show this again" flag lives in a file of its own rather than in
// the day store, because it outlives the day: the day store is wiped whenever
// the date changes, and being re-taught Sudoku every morning is not a feature.

import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { ChillPill } from "@/components/chill/chill-ui";
import type { ChillGameId } from "@/lib/chill-games";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

const SEEN_FILE = `${FileSystem.documentDirectory ?? ""}chill-help-seen-v1.json`;

let seen: Record<string, boolean> | null = null;

/** Which games have had their rules dismissed for good. Loaded once; a read
 *  before the file lands simply says "not seen", which shows the rules — the
 *  safe way round for something whose whole job is to explain the game. */
export async function loadChillHelpSeen(): Promise<Record<string, boolean>> {
  if (seen) return seen;
  try {
    const info = await FileSystem.getInfoAsync(SEEN_FILE);
    const raw = info.exists ? JSON.parse(await FileSystem.readAsStringAsync(SEEN_FILE)) : null;
    seen = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {};
  } catch {
    seen = {};
  }
  return seen;
}

function markSeen(game: ChillGameId): void {
  seen = { ...(seen ?? {}), [game]: true };
  void FileSystem.writeAsStringAsync(SEEN_FILE, JSON.stringify(seen)).catch(() => {});
}

const HELP: Record<ChillGameId, { title: string; intro: string; points: string[] }> = {
  wordle: {
    title: "How to play Word Guess",
    intro: "Guess the five-letter word in six tries.",
    points: [
      "Tap out a real five-letter word and press Enter.",
      "After each guess the tiles change colour to show how close you are: green is the right spot, yellow is the wrong spot, grey is not in the word.",
      "The keyboard remembers what you've learned — grey keys are dead ends.",
      "One word per day; everyone gets the same one.",
    ],
  },
  bee: {
    title: "How to play Honeycomb",
    intro: "Make as many words as you can from today's seven letters.",
    points: [
      "Words need at least 4 letters, and must use the centre letter.",
      "Letters can repeat — 'noon' is fine if the letters are there.",
      "Longer words score more. Use all seven letters at once for a pangram bonus.",
      "Ranks climb from Beginner to Genius as your score grows.",
    ],
  },
  connections: {
    title: "How to play Groups",
    intro: "Sixteen words hide four groups of four.",
    points: [
      "Select four words that share something, then press Submit.",
      "“One away…” means exactly three of your four belong together.",
      "You have four mistakes. Duplicate guesses don't cost one.",
      "Watch for traps — a word often looks like it fits two groups.",
      "Yellow is the easiest group, purple the trickiest.",
    ],
  },
  mini: {
    title: "How to play the Mini",
    intro: "A five-by-five crossword you can finish before class.",
    points: [
      "Tap a square and use the letters below. Tapping the same square again flips between Across and Down — so does tapping the clue.",
      "The ‹ and › arrows jump to the next clue, or tap any clue in the list.",
      "Check marks any wrong letters in red. Reveal fills the answer if you're truly stuck.",
      "The clock is just for bragging rights.",
    ],
  },
  crossword: {
    title: "How to play the Crossword",
    intro: "The Mini's bigger sibling — seven by seven, with two long answers each way.",
    points: [
      "Same controls as the Mini: tap a square to type, tap the clue to flip direction, ‹ and › to change clue.",
      "The long answers cross everything — crack one and the corners open up.",
      "Check marks wrong letters; Reveal is there if a corner defeats you.",
    ],
  },
  sudoku: {
    title: "How to play Sudoku",
    intro: "Fill the grid so every row, column, and box holds 1 through 9 exactly once.",
    points: [
      "Tap a square, then a digit on the pad below.",
      "Notes mode pencils small candidates into a square.",
      "Clashing digits turn red on their own; Check compares against the answer.",
      "Today's board has exactly one solution — no guessing ever needed.",
    ],
  },
  letterboxed: {
    title: "How to play Letter Box",
    intro: "Spell words around the square until all 12 letters are used.",
    points: [
      "Consecutive letters must come from different sides of the box.",
      "Each new word starts with the last letter of the one before it.",
      "Letters can repeat. Fewer words is better — today's box has a 2-word answer.",
      "Restart clears the chain if you paint yourself into a corner.",
    ],
  },
  tiles: {
    title: "How to play Tiles",
    intro: "Clear the board by matching layers, not whole tiles.",
    points: [
      "Every tile stacks a colour, a ring, and a symbol.",
      "Pick two tiles that share any layer — the shared layers vanish from both.",
      "A pick with nothing in common breaks your chain and resets the counter.",
      "Empty tiles disappear. Clear everything; chase a longer chain tomorrow.",
    ],
  },
};

export function GameHelp({
  game,
  open,
  onClose,
}: {
  game: ChillGameId;
  open: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [hideNextTime, setHideNextTime] = useState(false);
  const content = HELP[game];

  // A fresh game means a fresh checkbox — otherwise ticking it once silences
  // the rules for whatever game happens to open next.
  useEffect(() => setHideNextTime(false), [game]);

  const close = () => {
    if (hideNextTime) markSeen(game);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" testID="chill-help-scrim">
        {/* The card swallows taps so a tap inside it never dismisses. */}
        <Pressable style={styles.card} onPress={() => {}} testID="chill-help">
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.intro}>{content.intro}</Text>
          <ScrollView style={styles.points} contentContainerStyle={styles.pointsInner}>
            {content.points.map((point) => (
              <View key={point} style={styles.point}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={styles.checkRow}
            onPress={() => setHideNextTime((now) => !now)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: hideNextTime }}
            testID="chill-help-hide"
          >
            <View style={[styles.checkbox, hideNextTime && styles.checkboxOn]}>
              {hideNextTime ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>Don&apos;t show this again</Text>
          </Pressable>
          <View style={styles.actions}>
            <ChillPill label="Got it" tone="loud" onPress={close} testID="chill-help-close" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center", padding: space(5) },
    card: {
      width: "100%",
      maxWidth: 420,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.glassMenu,
      padding: space(5),
      gap: space(2),
    },
    title: { ...type.title, color: c.text },
    intro: { ...type.small, color: c.text2 },
    points: { maxHeight: 260 },
    pointsInner: { gap: space(2), paddingTop: space(1) },
    point: { flexDirection: "row", gap: space(2) },
    bullet: { ...type.small, color: c.text3 },
    pointText: { ...type.small, color: c.text2, flex: 1 },

    checkRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingTop: space(1) },
    // Square by convention — a checkbox is one of the shapes the control
    // scale deliberately leaves out.
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.line2,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: c.accent, borderColor: c.accent },
    checkMark: { ...type.micro, fontWeight: "700", color: c.onAccent },
    checkLabel: { ...type.small, color: c.text2 },

    actions: { flexDirection: "row", justifyContent: "flex-end", paddingTop: space(1) },
  });
