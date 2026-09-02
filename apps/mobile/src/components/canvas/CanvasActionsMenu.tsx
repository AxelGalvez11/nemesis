import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@/components/GlassSurface";
import type { Folder } from "@/lib/canvases";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The canvas screen's "…" dropdown — same fade+rise, transparent tap-catcher, and single
// GlassSurface panel as chat.tsx's ChatActionsPopup (mirrored rather than imported: that
// component is chat.tsx-local and chat.tsx is another agent's file). Two rows deep only:
// the main list, and — behind "Add to project ›" — a flat list of the learner's projects.
// Projects nest on the web (folders can hold folders); this menu deliberately shows only the
// flat list listFolders(uid) returns, since filing INTO a nested project is Slice 3's job
// (projects-model.ts's tree) and a flat list is still every project a canvas can be filed into.

export function CanvasActionsMenu({
  visible,
  onClose,
  topInset,
  pinned,
  onTogglePin,
  onRename,
  folders,
  currentFolderId,
  onPickProject,
  onRemoveFromProject,
  onNewProject,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  /** Safe-area top inset, so the panel lines up under the "…" button the same way
   *  ChatActionsPopup's `topInset + space(2) + 44 + space(1.5)` does. */
  topInset: number;
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  folders: readonly Folder[];
  currentFolderId: string | null;
  onPickProject: (folderId: string) => void;
  onRemoveFromProject: () => void;
  onNewProject: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [view, setView] = useState<"main" | "projects">("main");

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 170 : 130,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  // A menu reopened later must not still be showing the project list it was left on.
  useEffect(() => {
    if (visible) setView("main");
  }, [visible]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="canvas-actions-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        style={[
          styles.wrap,
          { top: topInset + space(2) + 44 + space(1.5), opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          {view === "main" ? (
            <>
              <Pressable
                testID="canvas-action-pin"
                onPress={() => pick(onTogglePin)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.label}>{pinned ? "Unpin" : "Pin"}</Text>
              </Pressable>
              <Pressable
                testID="canvas-action-rename"
                onPress={() => pick(onRename)}
                style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.label}>Rename</Text>
              </Pressable>
              <Pressable
                testID="canvas-action-project"
                onPress={() => setView("projects")}
                style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.label}>Add to project ›</Text>
              </Pressable>
              <Pressable
                testID="canvas-action-delete"
                onPress={() => pick(onDelete)}
                style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={[styles.label, styles.labelDanger]}>Delete</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                testID="canvas-action-project-back"
                onPress={() => setView("main")}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.label}>‹ Back</Text>
              </Pressable>
              {currentFolderId ? (
                <Pressable
                  testID="canvas-action-project-remove"
                  onPress={() => pick(onRemoveFromProject)}
                  style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.label}>Remove from project</Text>
                </Pressable>
              ) : null}
              <ScrollView style={styles.projectScroll} bounces={false} showsVerticalScrollIndicator={false}>
                {folders.map((folder) => (
                  <Pressable
                    key={folder.id}
                    testID={`canvas-action-project-${folder.id}`}
                    onPress={() => pick(() => onPickProject(folder.id))}
                    style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                    accessibilityRole="button"
                  >
                    <Text numberOfLines={1} style={[styles.label, folder.id === currentFolderId && styles.labelActive]}>
                      {folder.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                testID="canvas-action-project-new"
                onPress={() => pick(onNewProject)}
                style={({ pressed }) => [styles.row, styles.divider, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.label}>New project…</Text>
              </Pressable>
            </>
          )}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: "absolute", right: space(3), minWidth: 200 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    projectScroll: { maxHeight: 46 * 5 },
    row: { paddingVertical: space(3), paddingHorizontal: space(4) },
    rowPressed: { backgroundColor: c.surface },
    divider: { borderTopWidth: 1, borderTopColor: c.line },
    label: { ...type.body, color: c.text },
    labelActive: { color: c.accent, fontWeight: "600" },
    labelDanger: { color: c.danger },
  });
