import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { SlideUpSheet } from "./StudySheet";
import { FolderIcon, PlusIcon } from "./icons";
import { useKeyboardHeight } from "./shell-chrome";
import { pathLeaf, pathParent, safeLeafName } from "@/lib/study-tree";
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
  allowCreate = false,
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
  /** Offer a "New folder…" row. Study only — a Study folder is just a name
   *  prefix, so picking a name that doesn't exist yet CREATES it (see below).
   *  Library folders are real directories and need their own call. */
  allowCreate?: boolean;
  onPick: (folder: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const rows = ["", ...folders];
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Nothing to create, in the end. A Study folder has no row of its own — it
  // exists precisely because some deck's name carries it as a prefix — so
  // "move this into a folder called Pharm" and "make a folder called Pharm" are
  // the same act: hand the caller the new path and its existing move does it.
  function submitNewFolder() {
    const leaf = safeLeafName(newName);
    if (!leaf) return;
    onPick(leaf);
  }

  // A fresh picker every time: a half-typed folder name from the last item
  // shouldn't be sitting there when this opens against a different one.
  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setNewName("");
    }
  }, [visible]);

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title={title} testID={testID ?? "folder-picker-sheet"}>
      {/* No maxHeight here on purpose — SlideUpSheet's drag-to-expand owns how
          tall the body is (see useSheetExpand). */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {rows.map((folder) => {
          const isCurrent = folder === currentFolder;
          const disabled = isCurrent || (disabledPaths?.has(folder) ?? false);
          // Its own name, indented by how deep it sits — not the stored
          // "Pharm::Exam 1::Cardio" path (owner 2026-07-24: folders are not a
          // syntax the student should ever have to read). The indent carries the
          // nesting that the "::" used to spell out, and the parent's name goes
          // underneath for the case where two units share a leaf name.
          const parent = pathParent(folder);
          const depth = folder ? folder.split("::").length - 1 : 0;
          return (
            <Pressable
              key={folder || "__root__"}
              onPress={() => !disabled && onPick(folder)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.folderRow,
                { paddingLeft: space(2) + depth * space(4) },
                pressed && !disabled && styles.rowPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: isCurrent }}
              testID={`folder-pick-${folder || "root"}`}
            >
              <FolderIcon size={16} color={disabled ? c.text3 : c.text2} strokeWidth={1.9} />
              <View style={styles.folderText}>
                <Text style={[styles.folderLabel, disabled && styles.folderLabelDisabled]} numberOfLines={1}>
                  {folder ? pathLeaf(folder) : rootLabel}
                </Text>
                {parent ? (
                  <Text style={styles.folderParent} numberOfLines={1}>
                    in {pathLeaf(parent)}
                  </Text>
                ) : null}
              </View>
              {isCurrent ? <Text style={styles.folderHere}>Here now</Text> : null}
            </Pressable>
          );
        })}

        {/* Making the destination you actually want, from the picker itself
            (owner 2026-07-24: "users should just drag and drop, or add a drop
            down or use the 'move' function"). Without this, Move could only ever
            offer folders that already existed — and since a folder only exists
            because some deck was named with a "::" in it, the one way to get a
            new one was to type that syntax, which is what this batch removes. */}
        {allowCreate ? (
          creating ? (
            <View style={styles.newFolderRow}>
              <TextInput
                style={styles.newFolderInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Folder name"
                placeholderTextColor={c.textHint}
                autoFocus
                onSubmitEditing={submitNewFolder}
                returnKeyType="done"
                testID="folder-pick-new-name"
              />
              <Pressable
                onPress={submitNewFolder}
                disabled={!safeLeafName(newName)}
                hitSlop={6}
                style={styles.newFolderGo}
                testID="folder-pick-new-submit"
              >
                <Text style={[styles.newFolderGoLabel, !safeLeafName(newName) && styles.folderLabelDisabled]}>Create</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setCreating(true)}
              style={({ pressed }) => [styles.folderRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              testID="folder-pick-new"
            >
              <PlusIcon size={16} color={c.text2} strokeWidth={1.9} />
              <Text style={styles.folderLabel}>New folder…</Text>
            </Pressable>
          )
        ) : null}
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
    // paddingLeft is applied inline per row (nesting depth), so it is left out
    // of the base style rather than being overridden by it.
    folderRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingRight: space(2), borderRadius: radius.sm },
    folderText: { flex: 1, minWidth: 0, gap: 1 },
    folderLabel: { ...type.body, color: c.text, flex: 1 },
    folderLabelDisabled: { color: c.text3 },
    folderParent: { ...type.micro, color: c.textHint },
    folderHere: { ...type.micro, color: c.text3 },

    // The inline "New folder…" field, sharing the row's rhythm so it doesn't
    // read as a different kind of control once it opens.
    newFolderRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2), paddingHorizontal: space(2) },
    newFolderInput: {
      ...type.body,
      flex: 1,
      color: c.text,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
    newFolderGo: { paddingHorizontal: space(2), paddingVertical: space(1.5) },
    newFolderGoLabel: { ...type.small, color: c.accent, fontWeight: "600" },
  });
