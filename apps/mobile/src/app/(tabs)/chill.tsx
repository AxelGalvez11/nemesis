// Chill — the phone's brain-break page. Port of the web's /chill
// (apps/web/components/workspace/break/break-workspace.tsx): the same eight
// games, the same daily rotation, the same "play another" extras.
//
// Two structural differences from the web page, both forced by the device:
//  - The web keeps the open game in the URL (?game=wordle). Expo Router has no
//    equivalent query state here, so the open game is screen state and the
//    header's "Chill /" breadcrumb is the way back — which is also how Study
//    and Library get out of their sub-screens.
//  - Nothing renders until the day store has been read from disk. The web can
//    read localStorage synchronously; a file read is a promise, and mounting a
//    game against an empty store would let the first move race the load and be
//    overwritten by it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { dateKeyLabel } from "@nemesis/shared";

import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { BeeGame } from "@/components/chill/bee-game";
import { ChillPill } from "@/components/chill/chill-ui";
import { ConnectionsGame } from "@/components/chill/connections-game";
import { CrosswordGame } from "@/components/chill/crossword-game";
import { GameHelp, loadChillHelpSeen } from "@/components/chill/game-help";
import { LetterBoxedGame } from "@/components/chill/letterboxed-game";
import { SudokuGame } from "@/components/chill/sudoku-game";
import { TilesGame } from "@/components/chill/tiles-game";
import { useChillDateKey, useChillPick, useChillStore } from "@/components/chill/use-chill-day";
import { WordleGame } from "@/components/chill/wordle-game";
import { CHILL_GAMES, chillPuzzlesForDay, type ChillGameId } from "@/lib/chill-games";
import { chillCardStatus } from "@/lib/chill-status";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/** Dark ink on the bright card blocks — the web's glyph ink. */
const GLYPH_INK = "#101112";
const GLYPH_PAPER = "rgba(255,255,255,0.85)";

export default function ChillScreen() {
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle } = useShell();

  const dateKey = useChillDateKey();
  const { store, ready } = useChillStore(dateKey);
  const [game, setGame] = useState<ChillGameId | null>(null);
  const [pick, setPick] = useChillPick(game, dateKey);
  const [helpOpen, setHelpOpen] = useState(false);

  const dailyPuzzles = useMemo(() => chillPuzzlesForDay(dateKey, 0), [dateKey]);
  const activePuzzles = useMemo(() => chillPuzzlesForDay(dateKey, pick), [dateKey, pick]);

  const card = game ? CHILL_GAMES.find((entry) => entry.id === game)! : null;

  useEffect(() => {
    setHeaderTitle(card ? card.name : "Chill");
    return () => setHeaderTitle(null);
  }, [card, setHeaderTitle]);

  // First visit to a game shows its rules once; the sheet's checkbox silences
  // it for good and the ? button brings it back. Tied to `game` only, not to
  // `pick` — switching puzzle number should not re-explain the game.
  useEffect(() => {
    if (!game) return;
    let alive = true;
    void loadChillHelpSeen().then((seen) => {
      if (alive && !seen[game]) setHelpOpen(true);
    });
    return () => {
      alive = false;
    };
  }, [game]);

  const advance = useCallback(() => setPick(pick + 1), [pick, setPick]);

  if (!ready) {
    return <View style={styles.flex} testID="chill-loading" />;
  }

  if (game && card) {
    return (
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.gameBody, { paddingTop: contentTop + space(1), paddingBottom: contentBottom + space(6) }]}
          testID={`chill-game-${game}`}
        >
          <View style={styles.crumbRow}>
            <Pressable
              onPress={() => setGame(null)}
              accessibilityRole="button"
              accessibilityLabel="Back to Chill"
              testID="chill-back"
              style={({ pressed }) => [styles.crumbBack, pressed && styles.pressed]}
            >
              <Text style={styles.crumbBackText}>‹ Chill</Text>
            </Pressable>
            <View style={styles.crumbRight}>
              {pick > 0 ? (
                <Pressable onPress={() => setPick(0)} accessibilityRole="button" testID="chill-back-to-daily">
                  <Text style={styles.crumbMeta}>Puzzle {pick + 1} · Back to daily</Text>
                </Pressable>
              ) : (
                <Text style={styles.crumbMeta} testID="chill-date-label">
                  {dateKeyLabel(dateKey).split(",")[0]}
                </Text>
              )}
              <ChillPill label="New" onPress={advance} testID="chill-new-puzzle" />
              <ChillPill label="?" onPress={() => setHelpOpen(true)} testID="chill-help-open" />
            </View>
          </View>

          {/* Keying each game on `pick` remounts it on every puzzle switch —
              the clean way to reset a game's own UI state (typed letters,
              cursor position, animation values) without a bespoke reset
              effect in each one. */}
          {game === "wordle" ? (
            <WordleGame key={pick} answer={activePuzzles.wordleAnswer} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          ) : null}
          {game === "bee" ? (
            <BeeGame key={pick} puzzle={activePuzzles.bee} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          ) : null}
          {game === "connections" ? (
            <ConnectionsGame key={pick} puzzle={activePuzzles.connections} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          ) : null}
          {game === "mini" ? (
            <CrosswordGame key={pick} puzzle={activePuzzles.mini} puzzleKey={activePuzzles.puzzleKey} storageKey="mini" onPlayAnother={advance} />
          ) : null}
          {game === "crossword" ? (
            <CrosswordGame key={pick} puzzle={activePuzzles.midi} puzzleKey={activePuzzles.puzzleKey} storageKey="crossword" onPlayAnother={advance} />
          ) : null}
          {game === "sudoku" ? <SudokuGame key={pick} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} /> : null}
          {game === "letterboxed" ? (
            <LetterBoxedGame key={pick} puzzle={activePuzzles.letterbox} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          ) : null}
          {game === "tiles" ? <TilesGame key={pick} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} /> : null}
        </ScrollView>

        <GameHelp game={game} open={helpOpen} onClose={() => setHelpOpen(false)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.hubBody, { paddingTop: contentTop + space(2), paddingBottom: contentBottom + space(6) }]}
      testID="chill-hub"
    >
      <Text style={styles.dateLabel}>{dateKeyLabel(dateKey)}</Text>

      <View style={styles.cards}>
        {CHILL_GAMES.map((entry) => {
          const status = chillCardStatus(store, entry.id, dailyPuzzles);
          return (
            <Pressable
              key={entry.id}
              onPress={() => setGame(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={`${entry.name}. ${status ?? entry.tagline}`}
              testID={`chill-card-${entry.id}`}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.cardArt, { backgroundColor: entry.accent }]}>
                <GameGlyph game={entry.id} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  {status ? (
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{status}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardTagline}>{entry.tagline}</Text>
                <Text style={styles.cardAction}>{status ? "Continue" : "Play"}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** The web's card glyphs, redrawn with react-native-svg. Same geometry. */
function GameGlyph({ game }: { game: ChillGameId }) {
  if (game === "wordle") {
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <Rect
              key={`${row}${col}`}
              x={4 + col * 14}
              y={4 + row * 14}
              width={12}
              height={12}
              rx={2}
              fill={row === 2 || (row === 1 && col === 1) ? GLYPH_INK : GLYPH_PAPER}
              stroke={GLYPH_INK}
              strokeWidth={1.6}
            />
          )),
        )}
      </Svg>
    );
  }
  if (game === "bee") {
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        <Polygon points="24,7 38.5,15.5 38.5,32.5 24,41 9.5,32.5 9.5,15.5" fill={GLYPH_PAPER} stroke={GLYPH_INK} strokeWidth={2.4} />
        <Polygon points="24,16 31,20 31,28 24,32 17,28 17,20" fill={GLYPH_INK} />
      </Svg>
    );
  }
  if (game === "connections") {
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        {[0, 1, 2, 3].map((row) => (
          <Rect key={row} x={6} y={5 + row * 10} width={36} height={8} rx={2.5} fill={GLYPH_INK} opacity={0.25 + row * 0.25} />
        ))}
      </Svg>
    );
  }
  if (game === "mini" || game === "crossword") {
    const cells = game === "mini" ? 2 : 3;
    const size = game === "mini" ? 19 : 12.4;
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        <Rect x={5} y={5} width={38} height={38} rx={4} fill={GLYPH_PAPER} stroke={GLYPH_INK} strokeWidth={2.4} />
        {Array.from({ length: cells * cells }, (_, index) => {
          const row = Math.floor(index / cells);
          const col = index % cells;
          const dark = game === "mini" ? index === 2 : index === 0 || index === 8;
          return dark ? <Rect key={index} x={5 + col * size} y={5 + row * size} width={size} height={size} fill={GLYPH_INK} /> : null;
        })}
        <Line x1={5} y1={24} x2={43} y2={24} stroke={GLYPH_INK} strokeWidth={2} />
        <Line x1={24} y1={5} x2={24} y2={43} stroke={GLYPH_INK} strokeWidth={2} />
      </Svg>
    );
  }
  if (game === "sudoku") {
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        <Rect x={5} y={5} width={38} height={38} rx={4} fill={GLYPH_PAPER} stroke={GLYPH_INK} strokeWidth={2.4} />
        <Line x1={17.7} y1={5} x2={17.7} y2={43} stroke={GLYPH_INK} strokeWidth={1.4} />
        <Line x1={30.3} y1={5} x2={30.3} y2={43} stroke={GLYPH_INK} strokeWidth={1.4} />
        <Line x1={5} y1={17.7} x2={43} y2={17.7} stroke={GLYPH_INK} strokeWidth={1.4} />
        <Line x1={5} y1={30.3} x2={43} y2={30.3} stroke={GLYPH_INK} strokeWidth={1.4} />
        <SvgText x={11} y={15} fontSize={9} fontWeight="700" fill={GLYPH_INK}>
          7
        </SvgText>
        <SvgText x={23} y={28} fontSize={9} fontWeight="700" fill={GLYPH_INK}>
          3
        </SvgText>
        <SvgText x={35.5} y={40.5} fontSize={9} fontWeight="700" fill={GLYPH_INK}>
          9
        </SvgText>
      </Svg>
    );
  }
  if (game === "letterboxed") {
    return (
      <Svg width={40} height={40} viewBox="0 0 48 48">
        <Rect x={8} y={8} width={32} height={32} fill={GLYPH_PAPER} stroke={GLYPH_INK} strokeWidth={2.4} />
        <G fill="none" stroke={GLYPH_INK} strokeWidth={2}>
          <Polygon points="16,8 40,24 24,40 8,20" fill="none" />
        </G>
        {[
          [16, 8],
          [40, 24],
          [24, 40],
          [8, 20],
        ].map(([x, y]) => (
          <Circle key={`${x}-${y}`} cx={x} cy={y} r={3} fill={GLYPH_INK} />
        ))}
      </Svg>
    );
  }
  return (
    <Svg width={40} height={40} viewBox="0 0 48 48">
      <Rect x={6} y={10} width={26} height={26} rx={6} fill={GLYPH_PAPER} stroke={GLYPH_INK} strokeWidth={2.4} />
      <Rect x={16} y={16} width={26} height={26} rx={6} fill={GLYPH_INK} opacity={0.85} />
      <Circle cx={29} cy={29} r={5} fill="rgba(255,255,255,0.9)" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    hubBody: { paddingHorizontal: space(4), flexGrow: 1 },
    gameBody: { paddingHorizontal: space(4), flexGrow: 1, gap: space(3) },
    pressed: { opacity: 0.75 },

    dateLabel: { ...type.micro, color: c.text2, marginBottom: space(3) },

    cards: { gap: space(3) },
    card: {
      flexDirection: "row",
      overflow: "hidden",
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    cardArt: { width: 92, alignItems: "center", justifyContent: "center" },
    cardBody: { flex: 1, padding: space(3.5), gap: space(0.5) },
    cardTitleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space(2) },
    cardTitle: { ...type.bodyStrong, color: c.text, flexShrink: 1 },
    statusPill: { borderRadius: radius.pill, backgroundColor: c.glass, paddingHorizontal: space(2), paddingVertical: space(0.5) },
    statusText: { fontSize: 10.5, lineHeight: 14, color: c.text2 },
    cardTagline: { ...type.micro, color: c.text2 },
    cardAction: { ...type.small, fontWeight: "600", color: c.text, paddingTop: space(1.5) },

    crumbRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
    crumbBack: { paddingVertical: space(1), paddingRight: space(2) },
    crumbBackText: { ...type.small, fontWeight: "600", color: c.text2 },
    crumbRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: space(2) },
    crumbMeta: { ...type.micro, color: c.text2 },
  });
