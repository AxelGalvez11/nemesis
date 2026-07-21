import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { CloseIcon, PlusIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The note screen's TAB VIEWER (owner 2026-07-21, matching their Obsidian
// mobile reference crop): the pill bar's numbered square opens this instead of
// a plain recents list. A grid of little note cards — title + a text preview —
// with an ✕ on each to close that tab, the active tab outlined in the accent,
// and a footer of [+ new note] · "N tabs" · [Done]. Same always-mounted
// slide-up + transparent tap-catcher pattern as NoteListSheet, so every bottom
// sheet in the app moves the same way.

export interface NoteTab {
  id: string;
  title: string;
  /** Markdown-stripped opening text (lib/note-tabs.ts previewOf). */
  preview: string;
}

export function NoteTabsSheet({
  visible,
  tabs,
  activeId,
  busy = false,
  onPick,
  onCloseTab,
  onNew,
  onClose,
}: {
  visible: boolean;
  /** Open tabs, most recently visited first (the active note leads). */
  tabs: NoteTab[];
  activeId: string | null;
  /** True while "+" is mid-create; dims the button and ignores re-taps. */
  busy?: boolean;
  onPick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="note-tabs-sheet">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close tabs" />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
        <GlassSurface style={[styles.sheet, { maxHeight: Math.round(height * 0.78) }]} fallbackColor={c.bg2}>
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {tabs.map((tab) => {
              const active = tab.id === activeId;
              return (
                <View key={tab.id} style={styles.cell}>
                  <Pressable
                    onPress={() => onPick(tab.id)}
                    style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && styles.cardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${tab.title}`}
                    accessibilityState={{ selected: active }}
                    testID={`note-tab-${tab.id}`}
                  >
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {tab.title}
                    </Text>
                    {tab.preview ? (
                      <Text style={styles.cardPreview} numberOfLines={7}>
                        {tab.preview}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => onCloseTab(tab.id)}
                      style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Close ${tab.title}`}
                      testID={`note-tab-close-${tab.id}`}
                    >
                      <CloseIcon size={12} color={c.text} strokeWidth={2.2} />
                    </Pressable>
                  </Pressable>
                  <Text style={[styles.cellLabel, active && styles.cellLabelActive]} numberOfLines={1}>
                    {tab.title}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
            <Pressable
              onPress={onNew}
              disabled={busy}
              style={({ pressed }) => [styles.footerBtn, pressed && !busy && styles.footerBtnPressed]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="New note"
              accessibilityState={{ disabled: busy }}
              testID="note-tabs-new"
            >
              <PlusIcon size={21} color={busy ? c.text3 : c.text} strokeWidth={1.8} />
            </Pressable>
            <Text style={styles.footerCount}>{tabs.length === 1 ? "1 tab" : `${tabs.length} tabs`}</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.footerBtn, pressed && styles.footerBtnPressed]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Done"
              testID="note-tabs-done"
            >
              <Text style={styles.footerDone}>Done</Text>
            </Pressable>
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
    sheet: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      borderBottomWidth: 0,
      paddingHorizontal: space(4),
      paddingTop: space(3),
    },
    sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.line2, marginBottom: space(3) },

    // Two-up card grid; each cell = the preview card plus its label underneath
    // (the reference crop's layout).
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingBottom: space(2) },
    cell: { width: "47.5%", marginBottom: space(4) },
    card: {
      aspectRatio: 0.9,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radius.lg,
      padding: space(3),
      overflow: "hidden",
    },
    cardActive: { borderColor: c.accent, borderWidth: 2 },
    cardPressed: { opacity: 0.7 },
    cardTitle: { ...type.small, fontWeight: "700", color: c.text, marginBottom: space(1.5), paddingRight: space(5) },
    cardPreview: { fontSize: 10, lineHeight: 14, color: c.text3 },
    // The little ✕ disc floating in the card's top-right corner.
    closeBtn: {
      position: "absolute",
      top: space(1.5),
      right: space(1.5),
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    closeBtnPressed: { backgroundColor: c.line2 },
    cellLabel: { ...type.small, color: c.text2, textAlign: "center", marginTop: space(2) },
    cellLabelActive: { color: c.text, fontWeight: "600" },

    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: space(2),
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    footerBtn: { minWidth: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space(2) },
    footerBtnPressed: { backgroundColor: c.surface },
    footerCount: { ...type.body, color: c.text, fontWeight: "600", fontVariant: ["tabular-nums"] },
    footerDone: { ...type.body, color: c.accent, fontWeight: "700" },
  });
