import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import type { RowAction } from "./RowActionSheets";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// A small menu that opens WHERE YOU PRESSED (owner 2026-07-23: "in the sidebar,
// the holding down on chats should bring out a minimenu not a popup from the
// bottom").
//
// Holding a chat used to raise a full bottom sheet, which is a lot of ceremony
// for three short actions and puts them at the far end of the screen from the
// thumb that just pressed. This is the same shape as the Study "…" dropdown —
// tap-catcher plus a glass panel — but anchored to the touch instead of to a
// header button.
//
// It positions itself off the touch point and then keeps itself on screen:
// nudged in from either edge, and flipped ABOVE the finger when there isn't room
// below. Height is estimated from the row count rather than measured, because a
// menu that measures first would appear a frame late, right under the thumb, and
// visibly jump.

const MENU_WIDTH = 216;
const ROW_HEIGHT = 46;
const MENU_PADDING = 8;
/** Kept clear of the screen edges so the panel never looks glued to the side. */
const EDGE_MARGIN = 12;
/** Below the finger, so the menu isn't opening under the hand that opened it. */
const TOUCH_GAP = 10;

export interface MenuAnchor {
  x: number;
  y: number;
}

export function MiniMenu({
  visible,
  anchor,
  actions,
  onClose,
  testID,
}: {
  visible: boolean;
  /** Where the press landed, in window coordinates. */
  anchor: MenuAnchor | null;
  actions: RowAction[];
  onClose: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  if (!visible || !anchor) return null;

  const menuHeight = actions.length * ROW_HEIGHT + MENU_PADDING * 2;
  const left = Math.min(Math.max(anchor.x - MENU_WIDTH / 2, EDGE_MARGIN), Math.max(EDGE_MARGIN, width - MENU_WIDTH - EDGE_MARGIN));
  const below = anchor.y + TOUCH_GAP;
  const fitsBelow = below + menuHeight <= height - insets.bottom - EDGE_MARGIN;
  const top = fitsBelow
    ? below
    : Math.max(insets.top + EDGE_MARGIN, anchor.y - TOUCH_GAP - menuHeight);

  return (
    <View style={StyleSheet.absoluteFill} testID={testID ?? "mini-menu"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      {/* No entering animation. This renders inside a native Modal (see
          AppDrawer), and Reanimated's layout animations are unreliable in that
          context — a menu that fails to appear is a far worse trade than a menu
          that appears without a fade. It is under your finger already. */}
      <View style={[styles.menuWrap, { left, top, width: MENU_WIDTH }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassMenu} opaque shadow>
          {actions.map((action, index) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={`mini-menu-${action.key}`}
            >
              <Text style={[styles.label, action.destructive && styles.labelDestructive]}>{action.label}</Text>
            </Pressable>
          ))}
        </GlassSurface>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    menuWrap: { position: "absolute" },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden", paddingVertical: MENU_PADDING },
    row: { height: ROW_HEIGHT, justifyContent: "center", paddingHorizontal: space(4) },
    rowPressed: { backgroundColor: c.surface },
    divider: { borderTopWidth: 1, borderTopColor: c.line2 },
    label: { ...type.body, color: c.text },
    labelDestructive: { color: c.danger },
  });
