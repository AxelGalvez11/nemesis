import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "./GlassSurface";
import { CAPABILITY_CARD_RADIUS, CAPABILITY_ICON, capabilityTint } from "./ComposerPlusMenu";
import { SlidersIcon } from "./icons-composer";
import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, type ComposerCapability } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { row, space, type } from "@/theme/tokens";

// The "@" capability picker (IMG_6529: typing "@" as the first character, or after a space,
// opens this card above the composer). The reference calls it "Plugins"; Nemesis calls the
// same seven rows "Capabilities" — same list ComposerPlusMenu's "+" button offers
// (COMPOSER_CAPABILITIES), same icon and tint per row (CAPABILITY_ICON / capabilityTint,
// exported from that file so the two pickers can never disagree about which glyph is Course).
//
// LearnHome.tsx owns the actual "@" parsing (src/lib/at-mention.ts, pure and Deno-tested) and
// passes down only what this card needs to render: whether it's open, what's been typed after
// "@" so far, and where to place a pick. This component never touches the TextInput itself.
//
// SAME WIDTH AS THE COMPOSER, not ComposerPlusMenu's narrower left-anchored card — measured on
// the reference, the "Plugins" card's left/right edges line up exactly with the composer
// below it (both ~13pt in from the screen edge at 3x). `insetHorizontal` is threaded through by
// the caller so the two stay pinned to the same edges as the keyboard/composer move.
export function CapabilityPicker({
  visible,
  onClose,
  bottomOffset,
  insetHorizontal,
  query,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  /** Distance from the screen's bottom edge to just above the composer card — the same number
   *  LearnHome computes for ComposerPlusMenu (they anchor off the same card). */
  bottomOffset: number;
  /** Left/right inset, matched to the composer card's own (see this file's header). */
  insetHorizontal: number;
  /** Whatever was typed after "@" so far, lowercased — see src/lib/at-mention.ts. Filters the
   *  seven rows by label; empty shows all seven. */
  query: string;
  onPick: (capability: ComposerCapability) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c, resolvedMode } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const filtered = COMPOSER_CAPABILITIES.filter((cap) => CAPABILITY_COPY[cap].label.toLowerCase().includes(query));

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.host]}
      pointerEvents={visible ? "auto" : "none"}
      testID="capability-picker"
    >
      {/* Same outside-tap-to-dismiss shape as ComposerPlusMenu — closing here just stops
          filtering; the typed "@…" text is left alone (LearnHome only strips it on a pick). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close capabilities" />
      <Animated.View
        style={[
          styles.wrap,
          { bottom: bottomOffset, left: insetHorizontal, right: insetHorizontal, opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <GlassSurface style={styles.card} fallbackColor={c.glassMenu} opaque>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Capabilities</Text>
            <SlidersIcon size={18} color={c.text2} />
          </View>
          <ScrollView style={styles.list} bounces={false} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={styles.empty}>No matches</Text>
            ) : (
              filtered.map((cap, index) => {
                const copy = CAPABILITY_COPY[cap];
                const Icon = CAPABILITY_ICON[cap];
                const tint = capabilityTint(cap, resolvedMode === "dark");
                return (
                  <Pressable
                    key={cap}
                    testID={`capability-picker-${cap}`}
                    onPress={() => onPick(cap)}
                    // The FIRST row reads as pre-selected — measured off the reference
                    // (#EDEDED on "Create image", IMG_6529). c.surface2 stands in for it: the
                    // two are a few points apart, well inside sampling noise, and the token
                    // keeps dark mode sane without a mode branch here.
                    style={({ pressed }) => [styles.row, index === 0 && styles.rowHighlight, pressed && styles.rowPressed]}
                    accessibilityRole="button"
                  >
                    <Icon size={20} color={tint} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {copy.label}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Below ComposerPlusMenu's zIndex 30: the two are mutually exclusive (LearnHome closes one
    // before opening the other), so this only needs to clear ordinary page content.
    host: { zIndex: 28 },
    wrap: { position: "absolute" },
    card: { borderRadius: CAPABILITY_CARD_RADIUS, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(1),
    },
    headerTitle: { ...type.small, color: c.text3 },
    // Capped so a long capability list scrolls inside the card rather than growing past the
    // keyboard — the reference itself shows the list fading out before "Build iOS Apps".
    list: { maxHeight: row.nav * 5.5 },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), minHeight: row.nav },
    rowHighlight: { backgroundColor: c.surface2 },
    rowPressed: { backgroundColor: c.surface2 },
    rowLabel: { ...type.label, color: c.text, flexShrink: 1 },
    empty: { ...type.small, color: c.text3, paddingHorizontal: space(4), paddingVertical: space(4) },
  });
