// Library — the CANVAS MANAGER (the phone's half of §L, owner 2026-08-20).
//
// 🔴 LIBRARY'S PRIMARY OBJECTS ARE CANVASES, NOT FILES. Folders organise canvases. That is the
// whole object model, and it is deliberately smaller than a file browser: "avoid a full desktop
// file explorer unless usage proves the complexity is necessary." The web app made this change on
// 2026-08-13 (`apps/web/components/workspace/library/canvas-manager.tsx`) and this is the same
// decision, on the device the students carry. `/library` stays exactly where it is because it is
// one of the four destinations the product has — see `lib/nav-destinations.ts` and the web's
// `lib/workspace/sidebar-nav.ts`, which must stay literally aligned.
//
// 🔴 FILING IS NOT EVIDENCE. Nothing on this surface may change what Nemesis asks next. This file
// and everything under `components/library/` import the canvas STORE and nothing from the policy
// runtime — no diagnosis, no objectives, no evidence. Moving a canvas into a folder is a fact
// about the student's shelf, not about the student.
//
// 🔴 THIS FILE IS THE FRAME AND NOTHING ELSE — the `(tabs)/stats.tsx` + `StudyStatsBody.tsx`
// precedent, followed exactly. Shell padding, the TopBar title, and the header-right "…".
// `components/library/CanvasManagerBody.tsx` owns the data and the rows and owns no chrome.
// The three controls the "…" opens are split along that same seam: this file owns WHETHER each
// one is open, because that is chrome a button toggles; the body owns what each one does, because
// the folder a new folder is created in and the sort a query runs under are parts of the query.
//
// 🔴 THE PHONE'S ROW IS ONE LINE SHORTER THAN THE WEB'S, AND THAT IS AN HONESTY DECISION RATHER
// THAN A LAYOUT ONE. The web draws four columns at 1440 — name · Last opened · Created · "…" —
// and its own file argues hard for the third. Read the argument and it is a MEASUREMENT: with
// three columns "Name runs 462px and the date column lands 486px from the frame's left edge,
// against 368 and 384 there… ours read as the stretched one". Column-width balance measured at
// 1440 does not transfer to 390pt, where three text columns do not fit at all. So a row here is a
// title plus ONE secondary line, and that line shows the thing you sorted by. The next reader's
// instinct will be to restore the second column; it would re-stretch the row for a reason that was
// never about a phone.
//
// 🔴 THE FILE MANAGER IS NOT DELETED, IT IS UNLINKED. The 1,500-line notes-and-folders tree that
// used to be this file lives at `components/library/ClassicLibraryBody.tsx`, with its own
// reasoning rewritten rather than thrown away, exactly as the web kept `/library/classic`.
// `lib/retired-surfaces.ts` carries the flag and the door: this route renders that
// body instead of the canvas manager when it is opened with `?classic=1`, and nothing in the
// product writes that link. Notes still live in `readable_library_documents` and nothing else on
// the phone lists them, so the code stays.

import { useCallback, useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useShell } from "@/components/AppDrawer";
import { GlassSurface } from "@/components/GlassSurface";
import { useShellPadding } from "@/components/shell-chrome";
import { SearchIcon, type IconProps } from "@/components/icons";
import { CanvasManagerBody } from "@/components/library/CanvasManagerBody";
import { ClassicLibraryBody } from "@/components/library/ClassicLibraryBody";
import { CLASSIC_LIBRARY_PARAM } from "@/lib/retired-surfaces";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

export default function LibraryScreen() {
  // A repeated query key arrives as an array; taking the first is what every other reader of
  // expo-router params here does, and the value only ever has one meaning.
  const params = useLocalSearchParams();
  const raw = params[CLASSIC_LIBRARY_PARAM] as string | string[] | undefined;
  const classic = (Array.isArray(raw) ? raw[0] : raw) === "1";

  // 🔴 THE FRAME STEPS ASIDE FOR THE CLASSIC BODY RATHER THAN WRAPPING IT. That component was a
  // whole screen until this pass and still sets the shell's title and its own header-right "…";
  // two components writing the shell's one title slot is a race, not a layout. Rendering it here
  // — before this frame's own hooks — is safe precisely because it is an early return on a value
  // that cannot change without the route changing.
  if (classic) return <ClassicLibraryBody />;
  return <CanvasLibraryScreen />;
}

/** The canvas manager's frame. Split out of the route so the early return above cannot put this
 *  file's hooks behind a condition. */
function CanvasLibraryScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle, setHeaderRight } = useShell();

  const [actionsOpen, setActionsOpen] = useState(false);
  // Chrome state for the three controls "…" opens. What they DO belongs to the body.
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  useEffect(() => {
    setHeaderTitle("Library");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  // The "…" itself, top-right — the same slot and the same glass button the classic Library and
  // Study both use, so "the page's own actions" means one thing everywhere on this phone.
  useEffect(() => {
    setHeaderRight(
      <GlassSurface
        style={styles.kebabBtn}
        fallbackColor={c.glassPanel}
        tint={actionsOpen ? c.accentFaint : undefined}
        shadow
      >
        <Pressable
          style={styles.kebabInner}
          onPress={() => setActionsOpen((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Library actions"
          accessibilityState={{ expanded: actionsOpen }}
          testID="library-actions-btn"
        >
          <DotsIcon size={20} color={actionsOpen ? c.accent : c.text2} />
        </Pressable>
      </GlassSurface>,
    );
    return () => setHeaderRight(null);
  }, [actionsOpen, c, styles, setHeaderRight]);

  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeSort = useCallback(() => setSortOpen(false), []);
  const closeNewFolder = useCallback(() => setNewFolderOpen(false), []);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]} testID="library-page">
      <CanvasManagerBody
        paddingTop={contentTop}
        paddingBottom={contentBottom}
        searchOpen={searchOpen}
        onCloseSearch={closeSearch}
        sortOpen={sortOpen}
        onCloseSort={closeSort}
        newFolderOpen={newFolderOpen}
        onCloseNewFolder={closeNewFolder}
        testID="canvas-manager"
      />

      {/* 🔴 THREE ITEMS, AND THE TWO THAT ARE GONE WERE NOT DROPPED FOR ROOM. "New note" belonged
          to a surface whose objects were notes; there is nothing on a canvas manager for it to
          create. "Select" drove multi-select over notes and folders, which this surface has no
          bulk action for — a checkbox that leads nowhere is the invisible-control defect wearing
          a different costume. Both live on, working, in the classic body. */}
      <LibraryActionsMenu
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        searchActive={searchOpen}
        onSearch={() => setSearchOpen((open) => !open)}
        onNewFolder={() => setNewFolderOpen(true)}
        onSort={() => setSortOpen(true)}
        top={contentTop}
      />
    </View>
  );
}

/** The "…" dropdown. Same always-mounted fade-and-rise plus transparent tap-catcher as the classic
 *  Library's and Study's, so the three feel like one family; the trigger lives in the TopBar via
 *  `setHeaderRight`, so the open state is owned by the screen. */
function LibraryActionsMenu({
  open,
  onClose,
  searchActive,
  onSearch,
  onNewFolder,
  onSort,
  top,
}: {
  open: boolean;
  onClose: () => void;
  searchActive: boolean;
  onSearch: () => void;
  onNewFolder: () => void;
  onSort: () => void;
  top: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      duration: open ? 170 : 130,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      toValue: open ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  const items = [
    { icon: <SearchIcon size={17} color={searchActive ? c.accent : c.text2} />, key: "search", label: "Search", onPress: onSearch },
    { icon: <FolderPlusIcon size={17} color={c.text2} />, key: "new-folder", label: "New folder", onPress: onNewFolder },
    { icon: <SortIcon size={17} color={c.text2} />, key: "sort", label: "Sort", onPress: onSort },
  ];

  return (
    <>
      {open ? <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" /> : null}
      <Animated.View
        style={[styles.actionsMenuWrap, { opacity: progress, top: top + space(1), transform: [{ translateY }] }]}
        pointerEvents={open ? "auto" : "none"}
        testID="library-actions-menu"
      >
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.glassPanel} opaque shadow>
          {items.map((item, i) => (
            <Pressable
              key={item.key}
              testID={`library-action-${item.key}`}
              onPress={() => pick(item.onPress)}
              style={({ pressed }) => [styles.actionsRow, i > 0 && styles.actionsDivider, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              {item.icon}
              <Text style={[styles.actionsLabel, item.key === "search" && searchActive && styles.actionsLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </GlassSurface>
      </Animated.View>
    </>
  );
}

// Inline glyphs the shared icon set does not carry yet — thin strokes and round caps to match its
// language. Local on purpose, the same way every other screen here keeps its own.

function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

function FolderPlusIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 7.4a1.6 1.6 0 0 1 1.6-1.6h3.1l1.6 1.9h6.5a1.6 1.6 0 0 1 1.6 1.6v7.3a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 16.6Z"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="12" y1="10.6" x2="12" y2="15.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="9.7" y1="12.9" x2="14.3" y2="12.9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

function SortIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4.6" y1="7.4" x2="14.4" y2="7.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="4.6" y1="12" x2="11.6" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="4.6" y1="16.6" x2="8.8" y2="16.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path
        d="M17.8 6.2v11.6m0 0 2.4-2.4m-2.4 2.4-2.4-2.4"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    kebabBtn: { borderRadius: radius.pill, overflow: "hidden" },
    kebabInner: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    actionsMenuWrap: { position: "absolute", right: space(4), zIndex: 40 },
    actionsMenu: { minWidth: 196, borderRadius: radius.lg, overflow: "hidden", paddingVertical: space(1) },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      paddingHorizontal: space(4),
      minHeight: 46,
    },
    actionsDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    actionsLabel: { ...type.small, color: c.text },
    actionsLabelActive: { color: c.accent },
    rowPressed: { opacity: 0.6 },
  });
