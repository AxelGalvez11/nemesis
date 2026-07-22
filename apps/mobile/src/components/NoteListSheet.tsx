import { useEffect, useRef } from "react";
import { Animated, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { SearchIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The note pill bar's shared half-sheet (owner 2026-07-21): one bottom sheet
// that lists tappable rows — the Search-notes sheet (with a filter field), the
// Recent-notes switcher, and the heading Outline all ride this. Same
// always-mounted slide + transparent tap-catcher pattern as the Library tab's
// SortSheet, so every bottom sheet in the app moves the same way.

export interface NoteSheetRow {
  key: string;
  label: string;
  /** Small second line under the label (e.g. a note's folder path). */
  sublabel?: string;
  /** Indent steps (heading depth in the outline). */
  indent?: number;
  /** Highlights the row (the note you're already on). */
  active?: boolean;
}

export function NoteListSheet({
  visible,
  title,
  rows,
  emptyText,
  onPick,
  onClose,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  testID,
}: {
  visible: boolean;
  title: string;
  rows: NoteSheetRow[];
  emptyText: string;
  onPick: (key: string) => void;
  onClose: () => void;
  /** Provide BOTH search props to render the filter field (the Search sheet). */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const sheetH = Math.round(height * 0.5);

  useEffect(() => {
    // Inline sheet, not a native modal — the keyboard would sit ABOVE it, so
    // drop any open keyboard first (owner 2026-07-21). The searchable
    // variant re-focuses its own input 260ms later (effect below), which
    // brings the keyboard back cleanly UNDER-then-over the landed sheet.
    if (visible) Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  const searchable = onSearchChange !== undefined;

  // The sheet stays mounted (its close animation needs that), so a TextInput
  // `autoFocus` would fire once at screen mount — never when the sheet actually
  // opens. Focus explicitly each time `visible` flips true, after the slide-in
  // has mostly landed so iOS doesn't fight the animation for the keyboard.
  useEffect(() => {
    if (!visible || !searchable) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [visible, searchable]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID={testID}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={`Close ${title.toLowerCase()}`} />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
        <GlassSurface style={[styles.sheet, { minHeight: sheetH, maxHeight: Math.round(height * 0.72) }]} fallbackColor={c.bg2}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {searchable ? (
            <View style={styles.searchField}>
              <SearchIcon size={16} color={c.text3} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                value={searchValue ?? ""}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder ?? "Search"}
                placeholderTextColor={c.text3}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                testID={testID ? `${testID}-input` : undefined}
              />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space(4) }}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>{emptyText}</Text>
            ) : (
              rows.map((row) => (
                <Pressable
                  key={row.key}
                  onPress={() => onPick(row.key)}
                  style={({ pressed }) => [
                    styles.row,
                    row.indent ? { paddingLeft: space(1) + row.indent * space(4) } : null,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!row.active }}
                  testID={testID ? `${testID}-row-${row.key}` : undefined}
                >
                  <View style={styles.rowTextCol}>
                    <Text style={[styles.rowLabel, row.active && styles.rowLabelActive]} numberOfLines={1}>
                      {row.label}
                    </Text>
                    {row.sublabel ? (
                      <Text style={styles.rowSublabel} numberOfLines={1}>
                        {row.sublabel}
                      </Text>
                    ) : null}
                  </View>
                  {row.active ? <Text style={styles.rowCheck}>✓</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
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
    sheetTitle: { ...type.title, color: c.text, marginBottom: space(2) },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      paddingHorizontal: space(3),
      height: 40,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      marginBottom: space(2),
    },
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space(2),
      paddingVertical: space(2.75),
      paddingHorizontal: space(1),
      borderRadius: radius.sm,
    },
    rowPressed: { backgroundColor: c.surface },
    rowTextCol: { flex: 1 },
    rowLabel: { ...type.body, color: c.text },
    rowLabelActive: { color: c.accent, fontWeight: "600" },
    rowSublabel: { ...type.micro, color: c.text3, marginTop: 2 },
    rowCheck: { color: c.accent, fontSize: type.small.fontSize + 1, fontWeight: "700" },
    emptyText: { ...type.small, color: c.text3, paddingVertical: space(4), textAlign: "center" },
  });
