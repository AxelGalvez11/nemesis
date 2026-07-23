import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { SlideUpSheet } from "./StudySheet";
import { FolderIcon } from "./icons";
import { useKeyboardHeight } from "./shell-chrome";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The three pieces behind "long hold to open up minimenu for rename, delete, or
// move" (owner 2026-07-22), shared by the Library tree and the Study deck tree
// because both asks were identical:
//
//   RowActionsSheet  — the menu itself, listing what you can do to the row
//   TextPromptSheet  — the one-field dialog Rename opens
//   FolderPickerSheet — the destination list Move opens
//
// The menu and the picker ride SlideUpSheet, so they inherit the drag-to-expand
// every bottom sheet in the app has. The PROMPT deliberately doesn't: it's a
// small centered dialog instead, because (a) a rename field that can be dragged
// to full screen is odd, and (b) these are inline views rather than native
// modals, so a bottom-anchored prompt would sit underneath the very keyboard it
// just raised. Centering it in the space above the keyboard avoids that outright.

export interface RowAction {
  key: string;
  label: string;
  /** Red label + confirm step. Delete uses it. */
  destructive?: boolean;
  onPress: () => void;
}

/** The long-press menu. `title` is the row you pressed, so there's never a doubt
 *  about which deck or note the actions are about to hit. */
export function RowActionsSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: RowAction[];
  onClose: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={title} testID={testID ?? "row-actions-sheet"}>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.actionList}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            testID={`row-action-${action.key}`}
          >
            <Text style={[styles.actionLabel, action.destructive && styles.actionLabelDestructive]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </SlideUpSheet>
  );
}

/** One-field dialog — Rename, and the Library's New folder. Autofocuses, selects
 *  nothing (the caret lands at the end so you can append), and disables Save
 *  while the field is empty or a write is in flight. */
export function TextPromptSheet({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel = "Save",
  busy = false,
  error,
  onConfirm,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState(initialValue);
  const progress = useRef(new Animated.Value(0)).current;

  // Reopening on a different row must not show the last row's name.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 130,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !busy;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID={testID ?? "text-prompt-sheet"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={`Cancel ${title}`} />
      <Animated.View
        style={[
          styles.promptCenter,
          {
            paddingBottom: keyboardHeight,
            opacity: progress,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          },
        ]}
        pointerEvents="box-none"
      >
        <GlassSurface style={styles.prompt} fallbackColor={c.glassPanel} opaque shadow>
          <Text style={styles.promptTitle}>{title}</Text>
          <TextInput
            style={styles.promptInput}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={c.text3}
            autoFocus={visible}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => canSave && onConfirm(trimmed)}
            editable={!busy}
            testID="text-prompt-input"
          />
          {error ? <Text style={styles.promptError}>{error}</Text> : null}
          <View style={styles.promptButtons}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.promptBtn, pressed && styles.rowPressed]}
              accessibilityRole="button"
              testID="text-prompt-cancel"
            >
              <Text style={styles.promptBtnLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => canSave && onConfirm(trimmed)}
              disabled={!canSave}
              style={({ pressed }) => [styles.promptBtn, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              testID="text-prompt-confirm"
            >
              <Text style={[styles.promptBtnLabel, styles.promptBtnPrimary, !canSave && styles.promptBtnDisabled]}>
                {busy ? "Saving…" : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Destination picker for Move. Always offers the top level first, then every
 *  folder; `disabledPaths` greys out the ones that would be illegal (a folder
 *  can't move into itself, and nothing can move to where it already is). */
export function FolderPickerSheet({
  visible,
  title,
  folders,
  currentFolder,
  disabledPaths,
  rootLabel = "Top level",
  onPick,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  folders: string[];
  /** Where the item lives now — shown as the current choice and not selectable. */
  currentFolder: string;
  disabledPaths?: ReadonlySet<string>;
  rootLabel?: string;
  onPick: (folder: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const rows = ["", ...folders];

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={title} testID={testID ?? "folder-picker-sheet"}>
      {/* No maxHeight here on purpose — SlideUpSheet's drag-to-expand owns how
          tall the body is (see useSheetExpand). */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {rows.map((folder) => {
          const isCurrent = folder === currentFolder;
          const disabled = isCurrent || (disabledPaths?.has(folder) ?? false);
          return (
            <Pressable
              key={folder || "__root__"}
              onPress={() => !disabled && onPick(folder)}
              disabled={disabled}
              style={({ pressed }) => [styles.folderRow, pressed && !disabled && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isCurrent }}
              testID={`folder-pick-${folder || "root"}`}
            >
              <FolderIcon size={16} color={disabled ? c.text3 : c.text2} strokeWidth={1.9} />
              <Text style={[styles.folderLabel, disabled && styles.folderLabelDisabled]} numberOfLines={1}>
                {folder || rootLabel}
              </Text>
              {isCurrent ? <Text style={styles.folderHere}>Here now</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    rowPressed: { backgroundColor: c.surface },
    subtitle: { ...type.micro, color: c.text3, marginBottom: space(1) },

    // Long-press menu.
    actionList: { paddingTop: space(1) },
    actionRow: { paddingVertical: space(3.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    actionLabel: { ...type.body, color: c.text },
    actionLabelDestructive: { color: c.danger },

    // Rename / new-folder dialog: centered in whatever the keyboard leaves.
    promptCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space(6) },
    prompt: {
      width: "100%",
      maxWidth: 420,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
      paddingHorizontal: space(4),
      paddingTop: space(4),
      paddingBottom: space(2),
    },
    promptTitle: { ...type.title, color: c.text, marginBottom: space(3) },
    // line2, not line: in light mode the panel is white and c.surface is very
    // nearly white, so a 10%-alpha hairline left the field with no visible edge
    // at all — it read as loose text rather than something you can type in.
    promptInput: {
      ...type.body,
      color: c.text,
      backgroundColor: c.bg2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line2,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
    },
    promptError: { ...type.small, color: c.danger, marginTop: space(2) },
    promptButtons: { flexDirection: "row", justifyContent: "flex-end", gap: space(1), marginTop: space(2) },
    promptBtn: { paddingVertical: space(2.5), paddingHorizontal: space(3), borderRadius: radius.sm },
    promptBtnLabel: { ...type.body, color: c.text2 },
    promptBtnPrimary: { color: c.accent, fontWeight: "600" },
    promptBtnDisabled: { color: c.text3, fontWeight: "400" },

    // Move destination list.
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(2), borderRadius: radius.sm },
    folderLabel: { ...type.body, color: c.text, flex: 1 },
    folderLabelDisabled: { color: c.text3 },
    folderHere: { ...type.micro, color: c.text3 },
  });
