import { useState } from "react";
import { Image, Pressable, Share, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import { CopyIcon, ShareBoxIcon, ThumbsIcon } from "@/components/icons-canvas";
import { hostnameOf } from "@/components/SourcesSheet";
import type { ThreadSource } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The row under every finished reply (IMG_6533): copy, a thumbs rate glyph, share, "…", and —
// only when the turn cited pages — three overlapping favicons plus the word "Sources".
// Measured off IMG_6533 (`actionrow_6533b.png`): glyphs at 18pt in text2, roughly evenly
// spaced; the favicon stack overlaps by ~6pt.
export function CanvasActionRow({
  reply,
  sources,
  onOpenMenu,
  onOpenSources,
}: {
  reply: string;
  sources: readonly ThreadSource[];
  /** "…" opens the SAME menu long-pressing the reply does (per the slice's brief) — the
   *  press coordinates go straight to CanvasTurn's existing long-press handler. */
  onOpenMenu: (x: number, y: number) => void;
  onOpenSources: () => void;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  // A no-op vote: the reference toggles its own glyph state with nothing behind it yet (no
  // rating endpoint exists on the phone today). Three states — none/up/down — mirroring the
  // reference's single combined icon rather than two independent buttons.
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  const copy = () => void Clipboard.setStringAsync(reply);
  const share = () => void Share.share({ message: reply }).catch(() => {});
  const toggleRating = () => setRating((prev) => (prev === "down" ? null : "down"));
  const openMenu = (e: GestureResponderEvent) => onOpenMenu(e.nativeEvent.pageX, e.nativeEvent.pageY);

  return (
    <View style={styles.row} testID="canvas-action-row">
      <Pressable onPress={copy} hitSlop={8} style={styles.glyph} accessibilityRole="button" accessibilityLabel="Copy" testID="canvas-action-copy">
        <CopyIcon size={18} color={c.text2} />
      </Pressable>
      <Pressable onPress={toggleRating} hitSlop={8} style={styles.glyph} accessibilityRole="button" accessibilityLabel="Rate this response" testID="canvas-action-rate">
        <ThumbsIcon size={18} color={rating ? c.text : c.text2} />
      </Pressable>
      <Pressable onPress={share} hitSlop={8} style={styles.glyph} accessibilityRole="button" accessibilityLabel="Share" testID="canvas-action-share">
        <ShareBoxIcon size={18} color={c.text2} />
      </Pressable>
      <Pressable onPress={openMenu} hitSlop={8} style={styles.glyph} accessibilityRole="button" accessibilityLabel="More" testID="canvas-action-more">
        <DotsGlyph color={c.text2} />
      </Pressable>
      {sources.length > 0 ? (
        <Pressable onPress={onOpenSources} style={styles.sourcesPill} accessibilityRole="button" accessibilityLabel={`Sources, ${sources.length}`} testID="canvas-action-sources">
          <View style={styles.faviconStack}>
            {sources.slice(0, 3).map((source, index) => (
              <Image
                key={`${source.url}-${index}`}
                source={{ uri: `https://www.google.com/s2/favicons?domain=${hostnameOf(source.url)}&sz=32` }}
                style={[styles.favicon, index > 0 && styles.faviconOverlap]}
              />
            ))}
          </View>
          <Text style={styles.sourcesLabel}>Sources</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Three small dots — the row's "…", drawn locally at the row's 18pt glyph scale rather than
 *  imported from canvas.tsx's header-sized one. */
function DotsGlyph({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 3.4, height: 3.4, borderRadius: 1.7, backgroundColor: color, marginHorizontal: 1.6 }} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space(4), paddingHorizontal: space(0.5), paddingTop: space(1) },
    glyph: { padding: 2 },
    sourcesPill: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginLeft: space(0.5) },
    faviconStack: { flexDirection: "row", alignItems: "center" },
    favicon: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.bg },
    faviconOverlap: { marginLeft: -6 },
    sourcesLabel: { ...type.micro, color: c.text2 },
  });
