import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { DocumentIcon, FileIcon, GlobeIcon, LibraryIcon, MapIcon, PdfIcon, SlidesIcon, TableIcon, TelescopeIcon } from "./icons";
import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, type ComposerCapability } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Composer "+" mini menu (chat.tsx) — same always-mounted fade+rise,
// anchored-above-a-control shape as StudyModeMenu.tsx (that screen's FAB, this
// screen's composer pill; GlassSurface `opaque` for the same page-bleed-through
// fix). Two rows:
//  - "Attach from Library" opens AttachLibrarySheet.tsx.
//  - "Add a file" opens the system picker for a lecture the student was given
//    (PDF / Word / PowerPoint). It fills the SAME one-shot chip: a deck and an
//    attached note are the same thing once they are text.
//  - "Take photo" opens PhotoCaptureSheet.tsx — the shot is uploaded, read by
//    the server, and lands in the SAME one-shot attachment chip the Library
//    picker fills, because a photograph and an attached note are the same thing
//    once they are text (owner 2026-07-24).
//
// A third row briefly opened Record from here (owner 2026-07-22, morning).
// Record moved OUT the same day: it's the round accent button on the composer
// itself now (Composer.tsx's file header has the layout), so recording is one
// tap from the card rather than two through a menu. Only the row left — record
// mode itself is untouched.
//
// The Instant/Medium/High intelligence dial spent one revision as three rows
// in here and moved straight back out (owner 2026-07-22: "move the
// intelligence picker out of the '+' menu, it should have its own pill box").
// It's ComposerEffortMenu.tsx now — a pill on the composer row itself. Don't
// re-add it here; the menu is for one-off actions, not the standing dial.
// The "Deep research" row was removed 2026-07-27 (owner). The CONTROL only:
// research itself is untouched, because routeForTurn already sends a question
// that needs current sources down the research lane on its own — which is what
// the toggle was forcing by hand.
//
// 🔴🔴 THE CAPABILITY SECTION (docs/design/ios-web-parity-2026-09.md, slice 1). The web's `+`
// menu offers COMPOSER_CAPABILITIES — Course, Deep research, Web search, Document, PDF,
// Spreadsheet, Presentation — as one-shot declarations on the next submission (§38: a
// capability says what THIS submission is, never a persistent mode; it clears on send). This
// menu now carries the same rows, built from the same list `COMPOSER_CAPABILITIES` re-exports
// (src/learn/web.ts) — never hand-written by name — for the exact reason the web's own
// add-menu-row.tsx gives: a hard-coded row cannot be wrong about itself, which is precisely
// why it silently stops being the whole menu the next time a capability is added there.
//
// `onAttach`/`onAddFile`/`onTakePhoto` are now OPTIONAL. LearnHome.tsx (the front door) opens
// this menu with ONLY `capabilities` set — no attach rows. Attachments on the front door are
// the next slice (see the doc); a row that opened a picker for nothing to receive it into
// would be exactly the "renders, hovers, accepts the click, nothing happens" control the web's
// own canvas-home.tsx describes fixing once already.
export function ComposerPlusMenu({
  visible,
  onClose,
  bottomOffset,
  onAttach,
  onAddFile,
  onTakePhoto,
  capabilities,
}: {
  visible: boolean;
  onClose: () => void;
  /** Distance from the screen's bottom edge to just above the composer pill —
   *  computed by the caller from the same padding/height numbers the composer
   *  row itself renders with (see Composer.tsx's COMPOSER_PILL_HEIGHT). */
  bottomOffset: number;
  onAttach?: () => void;
  /** Opens the system file picker for a PDF / Word / PowerPoint (api/documents.ts). */
  onAddFile?: () => void;
  onTakePhoto?: () => void;
  /** The composer-capability rows (Course, Deep research, …). Optional: chat.tsx doesn't
   *  offer them yet (attachments only, on this screen); LearnHome.tsx offers ONLY these. */
  capabilities?: {
    onSelect: (capability: ComposerCapability) => void;
  };
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c, resolvedMode } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
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
  // Every row hands off to a sheet, a system picker, or a staged capability, so every row
  // closes the menu on the way out.
  const pickAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  const hasAttachRows = Boolean(onAttach || onAddFile || onTakePhoto);
  // A cap on how tall this can grow before it scrolls — the web's own `min(60vh, 26rem)` rule
  // (add-menu-row.tsx's ADD_MENU), sized for a phone rather than a laptop window. Only the
  // capability list is long enough to ever need it (three attach rows never do).
  const menuMaxHeight = Math.min(windowHeight * 0.6, 420);

  return (
    <View style={[StyleSheet.absoluteFill, styles.host]} pointerEvents={visible ? "auto" : "none"} testID="composer-plus-menu">
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the
          page (owner: confine blur to the component), same as every other menu here. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={[styles.menuWrap, { bottom: bottomOffset, opacity: progress, transform: [{ translateY }] }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          <View style={{ maxHeight: menuMaxHeight }}>
            {onAttach && (
              <Pressable
                testID="composer-plus-attach"
                onPress={() => pickAndClose(onAttach)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <LibraryIcon size={17} color={c.text2} />
                <Text style={styles.rowLabel}>Attach from Library</Text>
              </Pressable>
            )}
            {onAddFile && (
              <Pressable
                testID="composer-plus-file"
                onPress={() => pickAndClose(onAddFile)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <FileIcon size={17} color={c.text2} />
                <Text style={styles.rowLabel}>Add a file</Text>
              </Pressable>
            )}
            {onTakePhoto && (
              <Pressable
                testID="composer-plus-camera"
                onPress={() => pickAndClose(onTakePhoto)}
                style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <CameraIcon size={17} color={c.text2} />
                <Text style={styles.rowLabel}>Take photo</Text>
              </Pressable>
            )}
            {capabilities &&
              COMPOSER_CAPABILITIES.map((cap, index) => {
                const copy = CAPABILITY_COPY[cap];
                const Icon = CAPABILITY_ICON[cap];
                const tint = capabilityTint(cap, resolvedMode === "dark");
                return (
                  <Pressable
                    key={cap}
                    testID={`composer-plus-cap-${cap}`}
                    onPress={() => pickAndClose(() => capabilities.onSelect(cap))}
                    style={({ pressed }) => [
                      styles.row,
                      index === 0 && hasAttachRows && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <Icon size={17} color={tint} />
                    <View style={styles.capTextCol}>
                      <Text style={styles.capLabel}>{copy.label}</Text>
                      <Text style={styles.capDetail} numberOfLines={1}>
                        {copy.detail}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Local camera glyph — components/icons.tsx has
 *  no camera, and a one-off glyph stays in the file that needs it. */
function CameraIcon({ size = 17, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

/** Which line-icon (icons.tsx) draws each capability — see that file's own "composer capability
 *  icons" section for why these are hand-drawn equivalents rather than ports of the web's
 *  Codicon names. */
const CAPABILITY_ICON: Record<ComposerCapability, typeof MapIcon> = {
  course: MapIcon,
  research: TelescopeIcon,
  search: GlobeIcon,
  document: DocumentIcon,
  pdf: PdfIcon,
  sheet: TableIcon,
  slides: SlidesIcon,
};

/**
 * The capability rows' tint, mapped from the web's own `--ui-kind-*` tokens
 * (composer-capability.ts's `tint` field, resolved in desktop-ui.css) onto fixed hex pairs —
 * the phone has no CSS custom properties, so this is the one place the two palettes meet.
 * Kept simple on purpose: six fixed swatches, not a synthesis off the student's accent colour,
 * because these are meant to read as distinct KINDS of output (§38's own point) rather than as
 * on-brand chrome.
 */
const CAPABILITY_KIND_HEX: Record<string, { light: string; dark: string }> = {
  purple: { light: "#7a6fc0", dark: "#a99bea" },
  cyan: { light: "#3f7d8c", dark: "#6f9ba6" },
  blue: { light: "#2f6fd0", dark: "#6aa5f5" },
  red: { light: "#cf2d56", dark: "#e75e78" },
  green: { light: "#1f8a65", dark: "#55a583" },
  amber: { light: "#c08532", dark: "#d9a44e" },
};

const CAPABILITY_KIND: Record<ComposerCapability, keyof typeof CAPABILITY_KIND_HEX> = {
  course: "purple",
  research: "cyan",
  search: "blue",
  document: "blue",
  pdf: "red",
  sheet: "green",
  slides: "amber",
};

function capabilityTint(capability: ComposerCapability, dark: boolean): string {
  const hex = CAPABILITY_KIND_HEX[CAPABILITY_KIND[capability]];
  return dark ? hex.dark : hex.light;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // See ComposerEffortMenu's `host` — iOS paints siblings in tree order and
    // ignores `position: absolute` for stacking, so this menu needs to say out
    // loud that it belongs on top (owner 2026-07-23: the "+" menu "clashed with
    // text behind it", which was the landing page's starter rows drawing over
    // the panel).
    host: { zIndex: 30 },
    // maxWidth added for the capability rows' two-line detail text: without a ceiling the menu
    // grows to fit the longest detail on one line, which for "Build a table you can open in
    // Excel" ran wider than comfortable. The three plain attach rows never approach it.
    menuWrap: { position: "absolute", left: space(3), minWidth: 224, maxWidth: 300 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
    capTextCol: { flexShrink: 1 },
    capLabel: { ...type.small, color: c.text, fontWeight: "600" },
    capDetail: { ...type.micro, color: c.text3, marginTop: 1 },
  });
