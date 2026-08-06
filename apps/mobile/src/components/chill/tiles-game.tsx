// Tiles — port of apps/web/components/workspace/break/tiles-game.tsx. Each tile
// stacks a colour, a ring shape and a centre glyph; pick two that share any
// layer and every shared layer clears from both. The generator in
// @nemesis/shared guarantees a board that can always be cleared.
//
// The three fixes the web board earned on 2026-08-05 are carried over rather
// than re-learned: the colour block IS the tile (no white card behind it), the
// ring and glyph are one ink at two weights, and picking a tile dims everything
// it cannot clear against — which is the whole game made visible.

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path, Polygon, Rect } from "react-native-svg";

import {
  boardCleared,
  generateTilesBoard,
  hashSeed,
  matchableWith,
  matchTiles,
  TILE_LAYERS,
  tileEmpty,
  type Tile,
} from "@nemesis/shared";

import { ChillPill } from "@/components/chill/chill-ui";
import { useChillDayState } from "@/components/chill/use-chill-day";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/** Pale fills, so one fixed dark ink reads on every one of them in both
 *  appearances — these are the game's language, like Wordle's judge colours. */
const LAYER_COLORS = ["#f2c94c", "#7fc8a9", "#a9c1ef", "#e8927c", "#c39bd3"];
const INK_ON_COLOR = "#141518";

interface TilesState {
  tiles: Tile[];
  combo: number;
  best: number;
}

export function TilesGame({ puzzleKey, onPlayAnother }: { puzzleKey: string; onPlayAnother: () => void }) {
  const styles = useThemedStyles(createStyles);
  const initial = useMemo<TilesState>(
    () => ({ tiles: generateTilesBoard(hashSeed(`tiles:${puzzleKey}`)).tiles, combo: 0, best: 0 }),
    [puzzleKey],
  );
  const [saved, update] = useChillDayState<TilesState>("tiles", puzzleKey, initial);
  const [selected, setSelected] = useState<number | null>(null);

  const cleared = boardCleared(saved.tiles);
  const remainingCount = saved.tiles.filter((tile) => !tileEmpty(tile)).length;
  // Progress counts LAYERS, not empty tiles: a match usually strips one layer
  // off two tiles and empties neither, so a tile-based bar sits at zero through
  // the whole opening and reads as "nothing is happening".
  const layerTotal = saved.tiles.length * TILE_LAYERS;
  const layersCleared = saved.tiles.reduce((total, tile) => total + tile.filter((value) => value === -1).length, 0);
  // Recomputed from the board rather than tracked beside it, so what is lit can
  // never disagree with what a tap does.
  const legal = useMemo(
    () => (selected === null ? null : new Set(matchableWith(saved.tiles, selected))),
    [saved.tiles, selected],
  );

  const pick = (index: number) => {
    if (cleared || tileEmpty(saved.tiles[index]!)) return;
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const result = matchTiles(saved.tiles, selected, index);
    if (result.cleared.length === 0) {
      setSelected(null);
      update((previous) => ({ ...previous, combo: 0 }));
      return;
    }
    setSelected(tileEmpty(result.tiles[index]!) ? null : index);
    update((previous) => {
      const combo = previous.combo + 1;
      return { tiles: result.tiles, combo, best: Math.max(previous.best, combo) };
    });
  };

  return (
    <View style={styles.wrap} testID="tiles-board">
      <View style={styles.statsRow}>
        <Stat label="Chain" value={saved.combo} testID="tiles-combo" />
        <Stat label="Best" value={saved.best} />
        <View style={styles.progressCol}>
          <Text style={styles.remaining} testID="tiles-remaining">
            {remainingCount} tiles left
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(layersCleared / layerTotal) * 100}%` }]} />
          </View>
        </View>
      </View>

      {cleared ? (
        <View style={styles.clearedBlock}>
          <Text style={styles.clearedText}>Board cleared — longest chain {saved.best}.</Text>
          <ChillPill label="Play another" onPress={onPlayAnother} testID="tiles-play-another" />
        </View>
      ) : (
        <View style={styles.grid}>
          {saved.tiles.map((tile, index) => {
            const empty = tileEmpty(tile);
            const color = tile[0];
            const hasColor = color !== undefined && color !== -1;
            const isSelected = selected === index;
            // Dim only while a pick is live, and never dim the pick itself.
            const dimmed = legal !== null && !isSelected && !legal.has(index);
            return (
              <Pressable
                key={index}
                onPress={() => pick(index)}
                disabled={empty}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: empty }}
                testID={`tiles-tile-${index}`}
                style={[
                  styles.tile,
                  hasColor ? { backgroundColor: LAYER_COLORS[color] } : styles.tileBare,
                  // An emptied tile keeps its slot so the grid never reflows
                  // under the thumb mid-chain.
                  empty && styles.tileEmpty,
                  isSelected && styles.tileSelected,
                  // Faded, not hidden: the board still has to be readable to
                  // plan the next pick.
                  dimmed && styles.tileDimmed,
                ]}
              >
                <TileArt tile={tile} />
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.hint}>
        {selected === null
          ? "Pick two tiles that share a colour, ring shape, or symbol — every layer they share clears from both."
          : "Lit tiles share a layer with your pick. Anything faded clears nothing and breaks the chain."}
      </Text>
    </View>
  );
}

/** The ring and the glyph, drawn in one ink at two weights. */
function TileArt({ tile }: { tile: Tile }) {
  const { colors: c } = useTheme();
  const [color, ring, glyph] = tile;
  const ink = color !== undefined && color !== -1 ? INK_ON_COLOR : c.text;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 48 48">
      {ring !== undefined && ring !== -1 ? (
        <G stroke={ink} strokeOpacity={0.55} strokeWidth={2.8} fill="none">
          {ring === 0 ? <Circle cx={24} cy={24} r={14.5} /> : null}
          {ring === 1 ? <Rect x={9.5} y={9.5} width={29} height={29} rx={5} /> : null}
          {ring === 2 ? <Polygon points="24,7.5 40.5,24 24,40.5 7.5,24" /> : null}
          {ring === 3 ? <Polygon points="24,8 38.5,16.5 38.5,31.5 24,40 9.5,31.5 9.5,16.5" /> : null}
          {ring === 4 ? <Polygon points="24,8.5 39.5,35.5 8.5,35.5" /> : null}
        </G>
      ) : null}
      {glyph !== undefined && glyph !== -1 ? (
        <G fill={ink}>
          {glyph === 0 ? <Circle cx={24} cy={25} r={4.6} /> : null}
          {glyph === 1 ? <Path d="M24 19 l6 6 -6 6 -6 -6 z" /> : null}
          {glyph === 2 ? <Path d="M21.6 19h4.8v4.8H31v4.8h-4.6V33h-4.8v-4.4H17v-4.8h4.6z" /> : null}
          {glyph === 3 ? <Path d="M24 18l2.1 4.7 5.1.5-3.9 3.4 1.2 5-4.5-2.7-4.5 2.7 1.2-5-3.9-3.4 5.1-.5z" /> : null}
          {glyph === 4 ? <Path d="M28.5 18.5a7.6 7.6 0 1 0 2 9.4 8.8 8.8 0 1 1-2-9.4z" /> : null}
        </G>
      ) : null}
    </Svg>
  );
}

function Stat({ label, value, testID }: { label: string; value: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: "center", gap: space(4), width: "100%" },

    statsRow: { flexDirection: "row", alignItems: "center", gap: space(2), width: "100%" },
    stat: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: space(1.5),
      borderRadius: radius.md,
      backgroundColor: c.glass,
      paddingHorizontal: space(2.5),
      paddingVertical: space(1),
    },
    statLabel: { ...type.micro, color: c.text2 },
    statValue: { ...type.small, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] },
    progressCol: { marginLeft: "auto", alignItems: "flex-end", gap: space(1) },
    remaining: { ...type.micro, color: c.text2 },
    progressTrack: { height: 4, width: 96, borderRadius: 2, backgroundColor: c.lineMuted, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 2, backgroundColor: c.text3 },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), width: "100%" },
    tile: {
      width: "15.4%",
      aspectRatio: 1,
      borderRadius: radius.lg,
      padding: space(1.5),
    },
    // A cleared colour layer leaves a live tile with nothing to stand on — a
    // neutral surface keeps it visible without pretending it still has one.
    tileBare: { backgroundColor: c.glass },
    tileEmpty: { opacity: 0, backgroundColor: "transparent" },
    tileSelected: { borderWidth: 2, borderColor: c.text, transform: [{ translateY: -4 }] },
    tileDimmed: { opacity: 0.35 },

    clearedBlock: { alignItems: "center", gap: space(2), paddingTop: space(6) },
    clearedText: { ...type.small, fontWeight: "600", color: c.good, textAlign: "center" },

    hint: { ...type.micro, color: c.text2, textAlign: "center" },
  });
