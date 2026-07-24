import { useEffect, useRef } from "react";
import { Animated, type DimensionValue, StyleSheet, View, type ViewStyle } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// Skeleton loaders — the mobile twin of web's <Skeleton> (apps/web/components/ui/skeleton.tsx:
// "animate-pulse rounded-md bg-muted"). Same idea: a muted, pulsing placeholder in the shape of the
// content that's loading, instead of a bare spinner. Built on React Native's own Animated (no extra
// dep — the same zero-dep posture as AppDrawer; reanimated is reserved for gestures). Colors come
// from the live theme (useTheme/useThemedStyles), not the legacy static tokens — see
// components/states/index.tsx for the same conversion and why it matters for light/dark mode.

/** One pulsing bar. Width defaults to full; height/radius tuned per use. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius: r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: c.line2, opacity }, style]} />;
}

/** A Card-shaped skeleton: mirrors ui.tsx <Card> (border, radius.md, surface2) with a few text bars. */
export function SkeletonCard({ lines = 2, testID }: { lines?: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card} testID={testID}>
      <Skeleton width="70%" height={16} />
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Skeleton key={i} width={i % 2 === 0 ? "45%" : "55%"} height={12} />
      ))}
    </View>
  );
}

/**
 * A Study deck-row skeleton: mirrors study.tsx's `row` (surface2, radius.lg, the
 * same paddings) with the name over the retention line on the left and the
 * due-over-new count stack on the right.
 *
 * Shaped deliberately rather than reusing SkeletonCard: a deck row is a two-line
 * left block with a narrow right-hand stack, and a generic card silhouette would
 * settle into a visibly different layout the moment the decks arrived — which is
 * the one thing a skeleton exists to avoid.
 */
export function SkeletonDeckRow({ width = "62%", testID }: { width?: DimensionValue; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.deckRow} testID={testID}>
      <View style={styles.deckRowText}>
        <Skeleton width={width} height={15} />
        <Skeleton width="34%" height={11} />
      </View>
      <View style={styles.deckRowTrail}>
        <Skeleton width={18} height={11} />
        <Skeleton width={18} height={11} />
      </View>
    </View>
  );
}

/**
 * The Study list's loading state. Widths vary per row so it reads as a list of
 * different decks rather than a stack of identical bars.
 */
export function SkeletonDeckList({ count = 5, testID }: { count?: number; testID?: string }) {
  const widths: DimensionValue[] = ["58%", "72%", "44%", "66%", "51%"];
  return (
    <View testID={testID}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonDeckRow key={i} width={widths[i % widths.length]} testID={`${testID ?? "skeleton-deck"}-${i}`} />
      ))}
    </View>
  );
}

/** A list of N card skeletons — the loading state for the watch / report / list screens. */
export function SkeletonList({ count = 3, lines = 2, testID }: { count?: number; lines?: number; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.list} testID={testID}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} testID={`${testID ?? "skeleton"}-${i}`} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    list: { gap: space(2) },
    // Kept in step with study.tsx's `row` — same surface, radius and paddings, so
    // the placeholder and the real deck card occupy identical space.
    deckRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space(2),
      paddingVertical: space(3),
      paddingHorizontal: space(3.5),
      borderRadius: radius.lg,
      backgroundColor: c.surface2,
      marginBottom: space(2),
    },
    deckRowText: { flex: 1, minWidth: 0, gap: space(1.5) },
    deckRowTrail: { alignItems: "flex-end", gap: space(1) },
    card: {
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.md,
      padding: space(4),
      gap: space(2),
      backgroundColor: c.surface2,
    },
  });
