import type { ComponentType } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import type { RowAction } from "./RowActionSheets";
import { ChevronIcon, type IconProps } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

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
// row.menu (42) — measured off IMG_6536 (crop `menu_zoom.png`): six of seven action-row gaps
// land at exactly 126px/3 = 42pt.
const ROW_HEIGHT = 42;
const MENU_PADDING = 8;
/** Kept clear of the screen edges so the panel never looks glued to the side. */
const EDGE_MARGIN = 12;
/** Below the finger, so the menu isn't opening under the hand that opened it. */
const TOUCH_GAP = 10;
/** One nesting step for an indented row (a note's heading outline). */
const INDENT_STEP = 12;
/** Estimate for a two-line grey `title` block, used only for the fits-below/above guess. */
const TITLE_BLOCK_ESTIMATE = 54;
/** A bold `sectionTitle` row plus its divider — same row height as an action row. */
const SECTION_HEADER_HEIGHT = ROW_HEIGHT + 1;

export interface MenuAnchor {
  x: number;
  y: number;
}

/** A row that can carry an indent level — a note's heading outline, where
 *  nesting is the whole point. Plain actions leave it undefined. */
export interface MenuRow extends RowAction {
  /** Indent steps; each is one nesting level (h2 under h1, and so on). */
  indent?: number;
  /** A leading glyph (IMG_6536: every row in the sidebar's row-actions menu carries one).
   *  Optional and additive — existing callers (Study's outline, note.tsx's heading picker,
   *  …) that never set this keep rendering label-only, unchanged. */
  icon?: ComponentType<IconProps>;
  /** A right-aligned "›" — a row that drills into a submenu ("Add to project", IMG_6536).
   *  Replaces appending the glyph to the label text by hand. */
  chevron?: boolean;
}

export function MiniMenu({
  visible,
  anchor,
  actions,
  onClose,
  emptyText,
  title,
  sectionTitle,
  portal = false,
  testID,
}: {
  visible: boolean;
  /** Where the press landed, in window coordinates. */
  anchor: MenuAnchor | null;
  actions: MenuRow[];
  onClose: () => void;
  /** A grey, up-to-two-line header naming what the menu acts on (IMG_6536: the canvas/project
   *  title above the row list). No divider under it — the reference has none. Additive; every
   *  existing caller leaves this unset and gets the old title-less menu. */
  title?: string;
  /** A bold header row WITH a divider under it, for a drill-in submenu (IMG_6537's "Add to
   *  project ⌄"). Mutually exclusive with `title` in practice (a submenu replaces the title,
   *  it doesn't stack under it) but nothing here enforces that — callers just pass one. */
  sectionTitle?: string;
  /** Lift the menu out of its parent and onto the WINDOW.
   *
   *  The anchor is a window coordinate (pageX/pageY), and the layout below is
   *  absoluteFill — which is only the window when this renders at a screen or
   *  Modal root, as every original caller does. Rendered inside a panel that is
   *  itself inset from the top of the screen (SlideUpSheet's body), absoluteFill
   *  is that PANEL, so every window coordinate is read as a panel-relative one
   *  and the menu opens roughly the panel's own offset below the finger — and
   *  the fit/flip maths, computed against the window's height, goes with it.
   *  Pass this from inside such a panel. */
  portal?: boolean;
  /** Shown instead of rows when there are none — a menu that opens empty
   *  otherwise reads as broken. Without it, an empty menu doesn't open at all. */
  emptyText?: string;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  if (!visible || !anchor) return null;
  if (actions.length === 0 && !emptyText) return null;

  // Tall menus (a long note's outline) scroll rather than run off the screen.
  // The cap is computed against the room actually available on the side the
  // menu ends up on, so a flipped-above menu can't overrun the status bar.
  const roomBelow = height - insets.bottom - EDGE_MARGIN - (anchor.y + TOUCH_GAP);
  const roomAbove = anchor.y - TOUCH_GAP - insets.top - EDGE_MARGIN;
  // Header estimate only — the ScrollView handles real overflow either way, this just keeps
  // the fits-below/above guess honest when a title or section header is riding along.
  const headerEstimate = title ? TITLE_BLOCK_ESTIMATE : sectionTitle ? SECTION_HEADER_HEIGHT : 0;
  const wanted = Math.max(actions.length, 1) * ROW_HEIGHT + MENU_PADDING * 2 + headerEstimate;
  const fitsBelow = wanted <= roomBelow;
  // Whichever side is used, never taller than that side allows.
  const menuHeight = Math.max(ROW_HEIGHT, Math.min(wanted, fitsBelow ? roomBelow : Math.max(roomAbove, roomBelow)));
  const left = Math.min(Math.max(anchor.x - MENU_WIDTH / 2, EDGE_MARGIN), Math.max(EDGE_MARGIN, width - MENU_WIDTH - EDGE_MARGIN));
  const below = anchor.y + TOUCH_GAP;
  const top = fitsBelow
    ? below
    : Math.max(insets.top + EDGE_MARGIN, anchor.y - TOUCH_GAP - menuHeight);

  const body = (
    <View style={StyleSheet.absoluteFill} testID={testID ?? "mini-menu"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      {/* No entering animation. This renders inside a native Modal (see
          AppDrawer), and Reanimated's layout animations are unreliable in that
          context — a menu that fails to appear is a far worse trade than a menu
          that appears without a fade. It is under your finger already. */}
      <View style={[styles.menuWrap, { left, top, width: MENU_WIDTH, maxHeight: menuHeight }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassMenu} opaque shadow>
          <ScrollView
            // bounces off so a short menu doesn't wobble under a tap; the
            // scroll only matters for the long ones.
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            {/* Grey title (IMG_6536) — no divider under it, the reference has none. */}
            {title ? (
              <Text style={styles.titleLabel} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {/* Bold submenu header (IMG_6537) — a divider DOES sit under this one. */}
            {sectionTitle ? (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderLabel} numberOfLines={1}>
                    {sectionTitle}
                  </Text>
                  <View style={styles.sectionChevron}>
                    <ChevronIcon size={13} color={c.text2} strokeWidth={2} />
                  </View>
                </View>
                <View style={styles.divider} />
              </>
            ) : null}
            {actions.length === 0 ? (
              <Text style={styles.emptyLabel}>{emptyText}</Text>
            ) : (
              // No hairlines between plain rows — IMG_6536's action list has none; only a
              // submenu's OWN header (above) carries a divider.
              actions.map((action) => (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  testID={`mini-menu-${action.key}`}
                >
                  {action.icon ? (
                    <action.icon size={20} color={action.destructive ? c.danger : c.text2} strokeWidth={1.7} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      action.destructive && styles.labelDestructive,
                      action.indent ? { marginLeft: action.indent * INDENT_STEP } : null,
                      // Nested rows read as subordinate, the way a heading
                      // outline should.
                      action.indent ? styles.labelNested : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                  {action.chevron ? <ChevronIcon size={15} color={c.text3} strokeWidth={2} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </GlassSurface>
      </View>
    </View>
  );

  // animationType none: the menu is already under the finger, and a slide would
  // read as the panel behind it moving.
  return portal ? (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {body}
    </Modal>
  ) : (
    body
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    menuWrap: { position: "absolute" },
    // 20 — measured off IMG_6536's card corner (no exact token match: sm 8/md 10/lg 16/xl 24
    // all miss it), same card everywhere a MiniMenu opens now.
    menu: { borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    scrollBody: { paddingVertical: MENU_PADDING },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      height: ROW_HEIGHT,
      paddingHorizontal: space(4),
    },
    // surface2, not surface: the card's own fill (c.glassMenu) already renders close to
    // c.surface, so a c.surface pressed state was invisible — this is a deliberate fix,
    // not a reference detail.
    rowPressed: { backgroundColor: c.surface2 },
    divider: { borderTopWidth: 1, borderTopColor: c.line2 },
    label: { ...type.body, color: c.text, flex: 1 },
    labelNested: { ...type.small, color: c.text2 },
    labelDestructive: { color: c.danger },
    emptyLabel: { ...type.small, color: c.text3, paddingHorizontal: space(4), paddingVertical: space(3) },
    // The grey title (IMG_6536) — up to two lines, no divider under it.
    titleLabel: { ...type.small, color: c.text3, paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(1.5) },
    // The bold submenu header (IMG_6537) — same row height/inset as an action row so its
    // divider lines up with the list below.
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      height: ROW_HEIGHT,
      paddingHorizontal: space(4),
      paddingTop: space(1),
    },
    sectionHeaderLabel: { ...type.body, color: c.text, fontWeight: "700", flex: 1 },
    // ChevronIcon points right by default; rotated down for "this expands below".
    sectionChevron: { transform: [{ rotate: "90deg" }] },
  });
