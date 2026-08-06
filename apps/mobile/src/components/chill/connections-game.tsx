// Groups — port of apps/web/components/workspace/break/connections-game.tsx.
// The four categories, the shuffle order, the "one away" hint and the life
// count all come from @nemesis/shared, so the same grid is solvable the same
// way on both apps.
//
// The web waits for a CSS animation to end before letting a wrong four go; the
// phone drives the same pause from the animation's own completion callback, so
// the selection still clears exactly when the shake finishes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import {
  allConnectionsItems,
  connectionsStatus,
  CONNECTIONS_LIVES,
  evaluateGuess,
  hashSeed,
  mistakesUsed,
  remainingItems,
  seededShuffle,
  solvedGroups,
  type ConnectionsPuzzle,
} from "@nemesis/shared";

import { ChillPill, useNotice } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

const GROUP_TONES = ["#f5d76b", "#a8c66c", "#a9c1ef", "#c39bd3"];

interface ConnectionsState {
  guesses: string[][];
}

const EMPTY: ConnectionsState = { guesses: [] };

export function ConnectionsGame({
  puzzle,
  puzzleKey,
  onPlayAnother,
}: {
  puzzle: ConnectionsPuzzle;
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [saved, update] = useChillDayState<ConnectionsState>("connections", puzzleKey, EMPTY);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, say] = useNotice();
  const [shuffleSeed, setShuffleSeed] = useState(0);
  // A wrong four hops before the selection lets go — the pause is what makes
  // the mistake legible.
  const [wrongShake, setWrongShake] = useState<string[] | null>(null);

  const boardOrder = useMemo(
    () => seededShuffle(allConnectionsItems(puzzle), hashSeed(`connections:${puzzleKey}:${shuffleSeed}`)),
    [puzzle, puzzleKey, shuffleSeed],
  );

  const solved = solvedGroups(puzzle, saved.guesses);
  const mistakes = mistakesUsed(puzzle, saved.guesses);
  const status = connectionsStatus(puzzle, saved.guesses);
  const remaining = remainingItems(puzzle, saved.guesses, boardOrder);

  const toggle = (item: string) => {
    if (status !== "playing" || wrongShake) return;
    setSelected((now) => (now.includes(item) ? now.filter((entry) => entry !== item) : now.length < 4 ? [...now, item] : now));
  };

  const submit = () => {
    if (selected.length !== 4 || status !== "playing" || wrongShake) return;
    const result = evaluateGuess(puzzle, saved.guesses, selected);
    if (result.kind === "duplicate") {
      say("Already guessed");
      return;
    }
    update((previous) => ({ guesses: [...previous.guesses, [...selected]] }));
    if (result.kind === "solved") {
      setSelected([]);
      return;
    }
    if (result.kind === "one-away") say("One away…");
    setWrongShake([...selected]);
  };

  const releaseShake = useCallback(() => {
    setSelected([]);
    setWrongShake(null);
  }, []);

  // On a loss, reveal what was missed, in puzzle order.
  const revealed =
    status === "lost" ? puzzle.groups.map((_, index) => index).filter((index) => !solved.includes(index)) : [];

  return (
    <View style={styles.wrap} testID="connections-board">
      <Text style={styles.notice} numberOfLines={2} accessibilityLiveRegion="polite" testID="connections-notice">
        {notice ??
          (status === "won"
            ? "Solved — four for four."
            : status === "lost"
              ? "Out of tries. Tomorrow's grid awaits."
              : "Create four groups of four!")}
      </Text>

      <View style={styles.board}>
        {solved.map((groupIndex) => (
          <GroupBar key={`solved-${groupIndex}`} puzzle={puzzle} index={groupIndex} testID={`connections-solved-${groupIndex}`} />
        ))}

        {status !== "lost" && remaining.length > 0 ? (
          <View style={styles.grid}>
            {remaining.map((item) => {
              const picked = selected.includes(item);
              const shakeIndex = wrongShake?.indexOf(item) ?? -1;
              return (
                <TileButton
                  key={item}
                  label={item}
                  picked={picked}
                  shakeDelay={shakeIndex >= 0 ? shakeIndex * 90 : null}
                  // Only the LAST tile of the four reports the shake as over,
                  // so the selection is not released while three tiles are
                  // still mid-hop.
                  onShakeEnd={shakeIndex === 3 ? releaseShake : undefined}
                  onPress={() => toggle(item)}
                />
              );
            })}
          </View>
        ) : null}

        {revealed.map((groupIndex) => (
          <GroupBar key={`revealed-${groupIndex}`} puzzle={puzzle} index={groupIndex} />
        ))}
      </View>

      {status === "playing" ? (
        <>
          <View style={styles.lives} testID="connections-mistakes">
            <Text style={styles.livesLabel}>Mistakes remaining:</Text>
            {Array.from({ length: CONNECTIONS_LIVES }, (_, index) => (
              <View key={index} style={[styles.life, index < CONNECTIONS_LIVES - mistakes ? styles.lifeOn : styles.lifeSpent]} />
            ))}
          </View>
          <View style={styles.controls}>
            <ChillPill label="Shuffle" onPress={() => setShuffleSeed((seed) => seed + 1)} testID="connections-shuffle" />
            <ChillPill label="Deselect all" onPress={() => setSelected([])} disabled={selected.length === 0} testID="connections-deselect" />
            <ChillPill label="Submit" tone="loud" onPress={submit} disabled={selected.length !== 4} testID="connections-submit" />
          </View>
        </>
      ) : (
        <ChillPill label="Play another" onPress={onPlayAnother} testID="connections-play-another" />
      )}
    </View>
  );
}

/** A finished (or revealed) category: its title and its four items. */
function GroupBar({ puzzle, index, testID }: { puzzle: ConnectionsPuzzle; index: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const group = puzzle.groups[index]!;
  return (
    <View style={[styles.groupBar, { backgroundColor: GROUP_TONES[index] }]} testID={testID}>
      <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
      <Text style={styles.groupItems}>{group.items.join(", ")}</Text>
    </View>
  );
}

/** One of the sixteen. Owns its hop so a wrong four can stagger. */
function TileButton({
  label,
  picked,
  shakeDelay,
  onShakeEnd,
  onPress,
}: {
  label: string;
  picked: boolean;
  shakeDelay: number | null;
  onShakeEnd?: () => void;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const hop = useRef(new Animated.Value(0)).current;
  const done = useRef(onShakeEnd);
  done.current = onShakeEnd;

  useEffect(() => {
    if (shakeDelay === null) return;
    hop.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(shakeDelay),
      Animated.timing(hop, { toValue: -1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(hop, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      // A beat of stillness before the selection lets go, so the four that
      // were wrong are still readable as a group when they deselect.
      Animated.delay(260),
    ]);
    animation.start(({ finished }) => {
      if (finished) done.current?.();
    });
    return () => animation.stop();
  }, [hop, shakeDelay]);

  return (
    <Animated.View
      style={[styles.tileWrap, { transform: [{ translateY: hop.interpolate({ inputRange: [-1, 0], outputRange: [-10, 0] }) }] }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: picked }}
        testID="connections-tile"
        style={({ pressed }) => [styles.tile, picked && styles.tilePicked, pressed && styles.tilePressed]}
      >
        <Text style={[styles.tileText, picked && styles.tileTextPicked]} numberOfLines={3} adjustsFontSizeToFit>
          {label.toUpperCase()}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(3), width: "100%" },
    notice: { ...type.small, color: c.text2, textAlign: "center", minHeight: 22 },

    board: { width: "100%", gap: space(2) },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
    tileWrap: { width: "22.6%", aspectRatio: 1 },
    tile: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.lg,
      backgroundColor: c.glass,
      paddingHorizontal: space(1),
    },
    // The picked fill is the game's own dark chip, not the app accent: four
    // selected tiles must read as one block against the unselected twelve.
    tilePicked: { backgroundColor: "#55544a" },
    tilePressed: { opacity: 0.7 },
    tileText: { fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center", color: c.text },
    tileTextPicked: { color: "#ffffff" },

    groupBar: { alignItems: "center", borderRadius: radius.lg, paddingVertical: space(3), gap: space(0.5) },
    groupTitle: { ...type.micro, fontWeight: "700", letterSpacing: 1, color: "#000000" },
    groupItems: { ...type.micro, color: "#000000" },

    lives: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
    livesLabel: { ...type.small, color: c.text2 },
    life: { width: 12, height: 12, borderRadius: 6 },
    lifeOn: { backgroundColor: c.text },
    lifeSpent: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.lineMuted },

    controls: { flexDirection: "row", gap: space(2), justifyContent: "center", flexWrap: "wrap" },
  });
