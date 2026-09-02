import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/GlassSurface";
import { CopyIcon, RetryIcon, SpeakerIcon } from "@/components/icons-canvas";
import type { MenuAnchor } from "@/components/MiniMenu";
import { turnTimestamp } from "@/lib/canvas-timestamp";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, row, space, type } from "@/theme/tokens";

// The long-press menu on a finished reply (IMG_6561): a 13pt grey timestamp line, then rows.
// A dedicated component rather than MiniMenu (canvas.tsx's existing copy-only popover) because
// MiniMenu has no header line and never renders a row's icon — bolting both onto a shared,
// widely-used component for one caller was more risk than a small sibling.
//
// Copy, Read Aloud and Retry today. The reference also shows "Branch in new chat" and "Search
// the web" (IMG_6561) — neither is asked for here, so they stay out rather than half-wiring a
// destination that doesn't exist yet.
const MENU_WIDTH = 220;
const ROW_HEIGHT = row.menu;
const EDGE_MARGIN = 12;
const TOUCH_GAP = 10;

export function CanvasReplyMenu({
  visible,
  anchor,
  at,
  onClose,
  onCopy,
  onReadAloud,
  onRetry,
  speaking,
}: {
  visible: boolean;
  anchor: MenuAnchor | null;
  /** The turn's own ISO timestamp — the menu's header line reads it, never the wall clock. */
  at: string | null;
  onClose: () => void;
  onCopy: () => void;
  /** Absent hides the row entirely — a caller that hasn't wired speech yet keeps the old menu. */
  onReadAloud?: () => void;
  onRetry: () => void;
  /** True while this reply's audio is playing; flips the row's label to "Stop reading". */
  speaking?: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  if (!visible || !anchor) return null;

  const rowsHeight = ROW_HEIGHT * (onReadAloud ? 3 : 2);
  const headerHeight = 44; // timestamp line + its padding, measured against IMG_6561's crop
  const menuHeight = headerHeight + rowsHeight;
  const left = Math.min(Math.max(anchor.x - MENU_WIDTH / 2, EDGE_MARGIN), Math.max(EDGE_MARGIN, width - MENU_WIDTH - EDGE_MARGIN));
  const roomBelow = height - insets.bottom - EDGE_MARGIN - (anchor.y + TOUCH_GAP);
  const top = menuHeight <= roomBelow ? anchor.y + TOUCH_GAP : Math.max(insets.top + EDGE_MARGIN, anchor.y - TOUCH_GAP - menuHeight);

  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="canvas-reply-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.wrap, { left, top, width: MENU_WIDTH }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassMenu} opaque shadow>
          {at ? (
            <View style={styles.header}>
              <Text style={styles.headerText}>{turnTimestamp(at)}</Text>
            </View>
          ) : null}
          <Pressable
            testID="canvas-reply-menu-copy"
            onPress={() => pick(onCopy)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <CopyIcon size={20} color={c.text} />
            <Text style={styles.label}>Copy</Text>
          </Pressable>
          {onReadAloud ? (
            <Pressable
              testID="canvas-reply-menu-read-aloud"
              onPress={() => pick(onReadAloud)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <SpeakerIcon size={20} color={c.text} />
              <Text style={styles.label}>{speaking ? "Stop reading" : "Read Aloud"}</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="canvas-reply-menu-retry"
            onPress={() => pick(onRetry)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <RetryIcon size={20} color={c.text} />
            <Text style={styles.label}>Retry</Text>
          </Pressable>
        </GlassSurface>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: "absolute" },
    menu: { borderRadius: radius.xl, borderWidth: 1, borderColor: c.line, overflow: "hidden", backgroundColor: c.surface },
    header: { paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(1) },
    headerText: { ...type.micro, color: c.text2 },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), height: ROW_HEIGHT, paddingHorizontal: space(4) },
    rowPressed: { backgroundColor: c.surface2 },
    label: { ...type.label, color: c.text },
  });
