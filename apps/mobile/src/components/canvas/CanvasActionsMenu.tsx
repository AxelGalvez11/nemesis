import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@/components/GlassSurface";
import { FolderIcon, PinIcon, SearchIcon, TrashIcon, type IconProps } from "@/components/icons";
import { ComposeIcon, FolderPlusIcon, PaperclipIcon, ShareBoxIcon } from "@/components/icons-canvas";
import type { Folder } from "@/lib/canvases";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, row, space, type } from "@/theme/tokens";

// The canvas screen's "…" dropdown (IMG_6536/6537): a #F9F9F9 panel under the header pill, a
// 13pt grey title line naming the canvas, then rows on row.menu (42pt) with a 20pt glyph at
// the left of each. Two rows deep only: the main list, and — behind "Add to project ›" — a
// flat list of the learner's projects plus "New project…" (IMG_6537). No Archive (not in this
// slice's brief, even though the reference itself still shows one).
export function CanvasActionsMenu({
  visible,
  onClose,
  topInset,
  title,
  pinned,
  onTogglePin,
  onRename,
  onShare,
  onFindInChat,
  onUploadedFiles,
  hasUploadedFiles,
  folders,
  currentFolderId,
  onPickProject,
  onRemoveFromProject,
  onNewProject,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  /** Safe-area top inset, so the panel lines up under the header pill the same way
   *  ChatActionsPopup's `topInset + space(2) + 44 + space(1.5)` does. */
  topInset: number;
  /** The canvas's own title, or a fallback — the menu's 13pt grey header line (IMG_6536). */
  title: string;
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  onShare: () => void;
  onFindInChat: () => void;
  onUploadedFiles: () => void;
  /** Greys the "Uploaded files" row out (still tappable — it opens to an explicit "no files"
   *  state rather than going dead, per the sheet it opens). */
  hasUploadedFiles: boolean;
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
        <GlassSurface style={styles.menu} fallbackColor={c.glassMenu} opaque shadow>
          {view === "main" ? (
            <>
              <View style={styles.titleRow}>
                <Text numberOfLines={2} style={styles.titleText}>{title}</Text>
              </View>
              <MenuRow testID="canvas-action-share" icon={ShareBoxIcon} label="Share" onPress={() => pick(onShare)} />
              <MenuRow
                testID="canvas-action-pin"
                icon={PinIcon}
                label={pinned ? "Unpin" : "Pin"}
                onPress={() => pick(onTogglePin)}
              />
              <MenuRow testID="canvas-action-project" icon={FolderIcon} label="Add to project ›" onPress={() => setView("projects")} />
              <MenuRow
                testID="canvas-action-uploaded-files"
                icon={PaperclipIcon}
                label="Uploaded files"
                dim={!hasUploadedFiles}
                onPress={() => pick(onUploadedFiles)}
              />
              <MenuRow testID="canvas-action-find" icon={SearchIcon} label="Find in chat" onPress={() => pick(onFindInChat)} />
              <MenuRow testID="canvas-action-rename" icon={ComposeIcon} label="Rename" onPress={() => pick(onRename)} />
              <MenuRow testID="canvas-action-delete" icon={TrashIcon} label="Delete" danger onPress={() => pick(onDelete)} />
            </>
          ) : (
            <>
              <MenuRow testID="canvas-action-project-back" label="‹ Back" onPress={() => setView("main")} />
              {currentFolderId ? (
                <MenuRow testID="canvas-action-project-remove" label="Remove from project" onPress={() => pick(onRemoveFromProject)} />
              ) : null}
              <ScrollView style={styles.projectScroll} bounces={false} showsVerticalScrollIndicator={false}>
                {folders.map((folder) => (
                  <MenuRow
                    key={folder.id}
                    testID={`canvas-action-project-${folder.id}`}
                    icon={FolderIcon}
                    label={folder.name}
                    active={folder.id === currentFolderId}
                    onPress={() => pick(() => onPickProject(folder.id))}
                  />
                ))}
              </ScrollView>
              <MenuRow testID="canvas-action-project-new" icon={FolderPlusIcon} label="New project…" onPress={() => pick(onNewProject)} />
            </>
          )}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  danger,
  active,
  dim,
  testID,
}: {
  icon?: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  dim?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const color = danger ? c.danger : active ? c.accent : dim ? c.text3 : c.text;
  return (
    // No hairlines between rows (IMG_6536/6537: the reference separates rows with padding
    // alone, no divider — unlike CanvasActionsMenu's old two-row list, which had them).
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button">
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon size={20} color={color} strokeWidth={1.6} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.label, danger && styles.labelDanger, active && styles.labelActive, dim && styles.labelDim]}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: "absolute", right: space(3), minWidth: 240, maxWidth: 280 },
    menu: { borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, overflow: "hidden", backgroundColor: c.surface },
    projectScroll: { maxHeight: row.menu * 5 },
    titleRow: { paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(1.5) },
    titleText: { ...type.micro, color: c.text2 },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), height: row.menu, paddingHorizontal: space(4) },
    rowIcon: { width: 20, alignItems: "center" },
    rowPressed: { backgroundColor: c.surface2 },
    label: { ...type.label, color: c.text, flex: 1 },
    labelActive: { color: c.accent, fontWeight: "600" },
    labelDanger: { color: c.danger },
    labelDim: { color: c.text3 },
  });
