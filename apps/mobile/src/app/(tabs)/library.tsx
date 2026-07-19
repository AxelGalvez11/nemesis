import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useShellPadding } from "@/components/shell-chrome";
import { useShell } from "@/components/AppDrawer";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { CloseIcon, PlusIcon, SearchIcon, type IconProps } from "@/components/icons";
import {
  currentUserId,
  decryptLibrary,
  loadCachedRows,
  loadVaultKey,
  pullLibraryRows,
  subscribeLibrary,
} from "@/api/librarySync";
import { buildLibraryRows, type LibraryRow, type SyncCache } from "@/lib/library-sync";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Library (read-only, Phase 1): what the agent wrote on the Mac, on your phone.
// Shows cached notes instantly (offline included), pulls new rows behind that, and
// live-refreshes while the agent is writing. No editor anywhere on this screen by
// design — the Mac agent is the only author (single-writer architecture).
// Only kind:"note" docs render here — deck snapshots and the calendar doc ride the
// same encrypted pipe but belong to the Study/Calendar screens (Phases 2/3).
//
// Folders nest arbitrarily deep (mirrors the Mac vault's own folder structure) and
// each one collapses independently — buildLibraryRows() (lib/library-sync.ts) turns
// the flat doc-path list into a depth-tagged row list every render; `collapsed` (a
// Set of full folder paths, e.g. "PHCY 1205/Unit 1") is the only state that drives
// it, so collapsing a parent never disturbs a child's own remembered state.
//
// Read-only controls (this screen owns the UI, never the data): a Search that filters
// the list, a Sort half-sheet that reorders it, and New note / New folder buttons that
// only ever explain "create it on your Mac" — a phone write would be wiped by the next
// sync or corrupt the mirror, so those actions are deliberately inert.

// A–Z / Z–A sort by title; Modified sorts by the doc's mtime. There is deliberately
// no "created" key here: the read-only mirror carries no creation timestamp (see the
// disabled rows in SORT_OPTIONS), so we never fabricate one.
type SortKey = "az" | "za" | "mod-asc" | "mod-desc";

// The full menu the owner specced. The two "Created" rows are rendered but disabled:
// the synced doc format (lib/library-sync.ts LibraryDoc) has only `mtime`, no created
// date, so those orderings have no honest data to stand on.
const SORT_OPTIONS = [
  { key: "az", label: "A–Z" },
  { key: "za", label: "Z–A" },
  { key: "mod-asc", label: "Modified (old → new)" },
  { key: "mod-desc", label: "Modified (new → old)" },
  { key: "created-asc", label: "Created (old → new)", disabled: true },
  { key: "created-desc", label: "Created (new → old)", disabled: true },
] as const;

const CREATED_HINT = "Not synced to your phone";
const NEW_NOTE_HINT = "New notes are created on your Mac — this phone shows a read-only copy.";
const NEW_FOLDER_HINT = "New folders are created on your Mac — this phone shows a read-only copy.";

function sortLabel(key: SortKey): string {
  switch (key) {
    case "za":
      return "Sorted · Z–A";
    case "mod-asc":
      return "Sorted · Modified (old → new)";
    case "mod-desc":
      return "Sorted · Modified (new → old)";
    default:
      return "Sorted · A–Z";
  }
}

/** Pure reorder for the flat (search / non-default-sort) list. ISO mtimes compare
 * lexicographically (same assumption mergeRows relies on); notes with no mtime are
 * pushed to the end in title order so they land somewhere stable either direction. */
function sortNotes<T extends { title: string; mtime?: string }>(list: T[], key: SortKey): T[] {
  if (key === "az") return [...list].sort((a, b) => a.title.localeCompare(b.title));
  if (key === "za") return [...list].sort((a, b) => b.title.localeCompare(a.title));
  const timed = list.filter((n) => n.mtime);
  const untimed = list.filter((n) => !n.mtime).sort((a, b) => a.title.localeCompare(b.title));
  timed.sort((a, b) => (key === "mod-asc" ? a.mtime!.localeCompare(b.mtime!) : b.mtime!.localeCompare(a.mtime!)));
  return [...timed, ...untimed];
}

function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

export default function LibraryScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const insets = useSafeAreaInsets();
  const { setHeaderTitle } = useShell();
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [cache, setCache] = useState<SyncCache>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Read-only control state — all declared here, above the early returns, so the
  // hook order never changes between the loading / unpaired / paired renders.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [sortOpen, setSortOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulling = useRef(false);

  // Drive the TopBar's centered label (same slot chat.tsx uses); clear it on unmount
  // so the title never leaks onto another screen.
  useEffect(() => {
    setHeaderTitle("Library");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  // Transient inline note for the read-only actions (New note / New folder). Reuses
  // the same "flash then fade" shape as note.tsx's link notice.
  const flashHint = useCallback((message: string) => {
    setHint(message);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2800);
  }, []);

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) setQuery(""); // closing search clears the filter so the full list returns
      return !open;
    });
  }, []);

  // Toggle ONE folder by its full path — never mutates the previous Set, always
  // builds a fresh one, so a folder's collapsed-ness is independent of its
  // siblings and its ancestors' own toggles.
  const toggleFolder = useCallback((path: string) => {
    // Animate the child rows sliding in/out on collapse/expand (owner 2026-07-18).
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const pull = useCallback(async (base: SyncCache) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const merged = await pullLibraryRows(base);
      setCache(merged);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pulling.current = false;
    }
  }, []);

  // Re-check the key + freshen on every focus: this is the screen the user lands on
  // right after pairing, and after any stretch away from the app.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const k = await loadVaultKey();
        if (!alive) return;
        setKey(k);
        setKeyChecked(true);
        if (!k) return;
        const cached = await loadCachedRows();
        if (!alive) return;
        setCache(cached);
        void pull(cached);
      })();
      return () => {
        alive = false;
      };
    }, [pull]),
  );

  // Live updates while the agent writes on the Mac.
  useEffect(() => {
    if (!key) return;
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    void currentUserId().then((uid) => {
      if (!alive || !uid) return;
      unsubscribe = subscribeLibrary(uid, () => {
        setCache((current) => {
          void pull(current);
          return current;
        });
      });
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [key, pull]);

  if (!keyChecked) return <View style={styles.flex} testID="library-loading" />;

  if (!key) {
    return (
      <View
        style={[styles.pairWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="library-unpaired"
      >
        <EmptyBlock
          title="Pair with your Mac"
          body="Your library lives on your Mac. Pair once and everything the agent writes shows up here — readable anywhere, even offline. End-to-end encrypted: our servers can't read a word of it."
        />
        <MissionButton label="Scan pairing code" variant="primary" testID="goto-pair" onPress={() => router.push("/pair")} />
        <Text style={styles.pairHint}>On your Mac: Settings → Phone sync → Pair phone.</Text>
      </View>
    );
  }

  const { docs, failures } = decryptLibrary(cache, key);
  const notes = docs.filter((d) => d.kind === "note");
  const pathToHash = new Map(notes.map((d) => [d.path, d.pathHash]));

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const needle = trimmed.toLowerCase();
  // Flat, globally-sorted list whenever the user is searching OR has picked a sort
  // other than the default. Otherwise the familiar collapsible folder tree (A–Z is
  // exactly that tree, so choosing "A–Z" in the sheet is the way back to it).
  const flat = searching || sort !== "az";
  const filtered = searching
    ? notes.filter((n) => n.title.toLowerCase().includes(needle) || n.path.toLowerCase().includes(needle))
    : notes;
  const rows: LibraryRow[] = flat
    ? sortNotes(filtered, sort).map((n) => ({ type: "note", path: n.path, title: n.title, depth: 0 }))
    : buildLibraryRows(notes.map((d) => ({ path: d.path, title: d.title })), collapsed);

  const flatHeader = searching ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : sortLabel(sort);

  return (
    <View style={styles.flex} testID="library-screen">
      {/* Top band below the glass TopBar: just the search field + inline hint now — the
          Search / New note / New folder / Sort actions moved into the lower-left "…" glass
          menu (owner 2026-07-18). Carries the TopBar clearance; only pads at the bottom
          when it actually has a row to show. */}
      <View style={[styles.controls, { paddingTop: contentTop, paddingBottom: searchOpen || hint ? space(3) : 0 }]}>
        {searchOpen ? (
          <View style={styles.searchField}>
            <SearchIcon size={16} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes"
              placeholderTextColor={c.text3}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="library-search-input"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <CloseIcon size={14} color={c.text3} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {hint ? (
          <View style={styles.hint} testID="library-hint">
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        ) : null}
      </View>

      {failures > 0 ? (
        <Surface style={styles.warn} testID="library-decrypt-warning">
          <Text style={styles.warnText}>
            {failures} note{failures === 1 ? "" : "s"} couldn't be decrypted. If this persists, re-pair with your Mac
            (Settings → Phone sync).
          </Text>
        </Surface>
      ) : null}
      {error ? (
        <Surface style={styles.warn} testID="library-error">
          <Text style={styles.warnText}>Couldn't reach sync: {error}</Text>
        </Surface>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.type}:${item.path}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listBody, { paddingTop: space(1), paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void pull(cache).finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          flat ? (
            <Text style={styles.sectionHead} testID="library-list-header">
              {flatHeader}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const indent = item.depth > 0 ? { paddingLeft: space(2) + item.depth * space(4) } : null;
          if (item.type === "folder") {
            const isCollapsed = collapsed.has(item.path);
            return (
              <Pressable
                style={({ pressed }) => [styles.folderRow, indent, pressed && styles.rowPressed]}
                testID={`folder-${item.path}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} folder`}
                accessibilityState={{ expanded: !isCollapsed }}
                onPress={() => toggleFolder(item.path)}
              >
                <PlusMinusIcon size={13} color={c.text2} expanded={!isCollapsed} />
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
              </Pressable>
            );
          }
          const parent = flat ? folderOf(item.path) : "";
          return (
            <Pressable
              style={({ pressed }) => [styles.row, indent, pressed && styles.rowPressed]}
              testID={`note-${item.path}`}
              onPress={() => {
                const ph = pathToHash.get(item.path);
                if (ph) router.push({ pathname: "/note", params: { ph } });
              }}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              {parent ? (
                <Text style={styles.rowFolder} numberOfLines={1}>{parent}</Text>
              ) : null}
            </Pressable>
          );
        }}
        // rows.length === 0 iff no notes match: a top-level folder's own row (and every
        // root note) is always emitted regardless of collapse state in tree mode, so the
        // tree branch never falsely fires while notes merely sit behind a collapsed
        // folder. Keeping FlatList's own empty handling (rather than branching around
        // the list) is also what keeps pull-to-refresh alive on the just-paired,
        // nothing-synced-yet state, which is the moment a pull-to-refresh matters most.
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {searching ? (
              <EmptyBlock title="No matching notes" body={`Nothing in your synced library matches “${trimmed}”.`} />
            ) : (
              <EmptyBlock
                title="Nothing synced yet"
                body="Your Mac publishes notes as the agent writes them. Leave the Nemesis desktop app open and check back in a minute."
              />
            )}
          </View>
        }
      />

      {/* Lower-left "…" glass button → the Search / New note / New folder / Sort menu
          (owner 2026-07-18: those four combined into one three-dots control). */}
      <ActionsFab
        searchActive={searchOpen}
        onSearch={toggleSearch}
        onNewNote={() => flashHint(NEW_NOTE_HINT)}
        onNewFolder={() => flashHint(NEW_FOLDER_HINT)}
        onSort={() => setSortOpen(true)}
        insetBottom={insets.bottom + space(2)}
      />

      <SortSheet
        visible={sortOpen}
        current={sort}
        onClose={() => setSortOpen(false)}
        onSelect={(next) => {
          setSort(next);
          setSortOpen(false);
        }}
      />
    </View>
  );
}

// The lower-left three-dots glass button + the small glass popup it opens (owner
// 2026-07-18). Same always-mounted fade+rise + transparent tap-catcher pattern as
// StudyModeMenu, so it feels like one family. Picking an item closes the menu and
// runs its action; the page behind is NOT blurred — the menu's own glass is the
// only blur.
const FAB_SIZE = 48;

function ActionsFab({
  searchActive,
  onSearch,
  onNewNote,
  onNewFolder,
  onSort,
  insetBottom,
}: {
  searchActive: boolean;
  onSearch: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onSort: () => void;
  insetBottom: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 170 : 130,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const items: { key: string; label: string; icon: React.ReactNode; onPress: () => void }[] = [
    { key: "search", label: "Search", icon: <SearchIcon size={17} color={searchActive ? c.accent : c.text2} />, onPress: onSearch },
    { key: "new-note", label: "New note", icon: <PlusIcon size={17} color={c.text2} />, onPress: onNewNote },
    { key: "new-folder", label: "New folder", icon: <FolderPlusIcon size={17} color={c.text2} />, onPress: onNewFolder },
    { key: "sort", label: "Sort", icon: <SortIcon size={17} color={c.text2} />, onPress: onSort },
  ];

  return (
    <>
      {open ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
      ) : null}

      <Animated.View
        style={[
          styles.actionsMenuWrap,
          { bottom: insetBottom + FAB_SIZE + space(3), opacity: progress, transform: [{ translateY }] },
        ]}
        pointerEvents={open ? "auto" : "none"}
        testID="library-actions-menu"
      >
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.bg2}>
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

      <View style={[styles.actionsFabWrap, { bottom: insetBottom }]} pointerEvents="box-none">
        <GlassSurface style={styles.actionsFab} tint={open ? c.accentFaint : undefined}>
          <Pressable
            style={styles.actionsFabInner}
            onPress={() => setOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Library actions"
            accessibilityState={{ expanded: open }}
            testID="library-actions-fab"
          >
            <DotsIcon size={20} color={open ? c.accent : c.text2} />
          </Pressable>
        </GlassSurface>
      </View>
    </>
  );
}

/** The half-height SORT sheet. Always mounted (like SlideUpSheet / StudyModeMenu) so
 * both the open and close animations play; a transparent tap-catcher closes it and the
 * sheet's own glass supplies the blur (owner: no whole-screen blur behind popups). */
function SortSheet({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: SortKey;
  onSelect: (key: SortKey) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const sheetH = Math.round(height * 0.5);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  // Slide off the FULL window height so the sheet is always fully hidden when
  // closed, whatever its content height ends up being.
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="library-sort-sheet">
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the page.
          The sheet's own glass supplies the only blur (owner: confine blur to the component). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sort" />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
        {/* At LEAST half the screen tall (the "half sheet"), but grows to fit its rows
            on short devices so the last option never clips. */}
        <GlassSurface style={[styles.sheet, { minHeight: sheetH }]} fallbackColor={c.bg2}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Sort</Text>
          <View style={{ paddingBottom: insets.bottom + space(4) }}>
            {SORT_OPTIONS.map((opt) => {
              const disabled = "disabled" in opt && opt.disabled;
              if (disabled) {
                return (
                  <View key={opt.key} style={styles.sortRow} testID={`sort-option-${opt.key}`} accessibilityState={{ disabled: true }}>
                    <Text style={styles.sortLabelDisabled}>{opt.label}</Text>
                    <Text style={styles.sortHint}>{CREATED_HINT}</Text>
                  </View>
                );
              }
              const optKey = opt.key as SortKey;
              const isActive = current === optKey;
              return (
                <Pressable
                  key={opt.key}
                  testID={`sort-option-${opt.key}`}
                  onPress={() => onSelect(optKey)}
                  style={({ pressed }) => [styles.sortRow, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.sortLabel, isActive && styles.sortLabelActive]}>{opt.label}</Text>
                  {isActive ? <Text style={styles.sortCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

// Inline glyphs the shared icon set (components/icons.tsx) doesn't carry yet — thin
// strokes / round caps to match its language. Local to this screen on purpose.

/** Folder disclosure indicator — "+" collapsed, "−" expanded (owner 2026-07-18). The
 *  horizontal stroke always draws; the vertical only while collapsed. */
function PlusMinusIcon({ size = 13, color, expanded }: { size?: number; color: string; expanded: boolean }) {
  const mid = 12;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="5" y1={mid} x2="19" y2={mid} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      {expanded ? null : <Line x1={mid} y1="5" x2={mid} y2="19" stroke={color} strokeWidth={2.4} strokeLinecap="round" />}
    </Svg>
  );
}

/** Horizontal "…" for the lower-left actions button. */
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
      <Path d="M17.8 6.2v11.6m0 0 2.4-2.4m-2.4 2.4-2.4-2.4" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },

    // Top band below the TopBar — now just the (conditional) search field + hint; its
    // bottom padding is applied inline, only when it has a row to show.
    controls: { paddingHorizontal: space(4), gap: space(2.5) },
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
    },
    searchInput: { flex: 1, color: c.text, fontSize: 15, padding: 0 },
    hint: { paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    hintText: { ...type.small, color: c.text2 },

    listBody: { paddingHorizontal: space(4), flexGrow: 1 },
    // "Library" — the label above root-level (unfoldered) notes only; real folders
    // render as folderRow below, each with its own name + chevron. In flat mode this
    // same slot carries the "N results" / "Sorted · …" context line.
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(3), marginBottom: space(1.5) },
    // Notes are still just names (owner call) — no cards, no chevrons on notes.
    row: { paddingVertical: space(2.5), paddingHorizontal: space(2), borderRadius: radius.sm },
    rowPressed: { backgroundColor: c.surface },
    rowTitle: { ...type.body, color: c.text },
    // Only shown in the flat (search / sort) list, where a note is out of its folder.
    rowFolder: { ...type.micro, color: c.text3, marginTop: 2 },
    // Folders ARE collapsible, so they get the chevron notes deliberately don't.
    folderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      paddingVertical: space(2.5),
      paddingHorizontal: space(2),
      marginTop: space(3),
      borderRadius: radius.sm,
    },
    folderName: { ...type.bodyStrong, color: c.text, flexShrink: 1 },
    warn: { marginHorizontal: space(4), marginTop: space(1), padding: space(3) },
    warnText: { ...type.small, color: c.text2 },
    emptyWrap: { paddingTop: space(10) },

    // Sort half-sheet.
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
    sheetTitle: { ...type.title, color: c.text, marginBottom: space(1) },
    sortRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: space(3),
      paddingHorizontal: space(1),
      borderRadius: radius.sm,
    },
    sortLabel: { ...type.body, color: c.text },
    sortLabelActive: { color: c.accent, fontWeight: "600" },
    sortLabelDisabled: { ...type.body, color: c.text3 },
    sortHint: { ...type.micro, color: c.text3 },
    sortCheck: { color: c.accent, fontSize: 16, fontWeight: "700" },

    // Lower-left "…" actions button + its popup menu (Search / New note / New folder / Sort).
    actionsFabWrap: { position: "absolute", left: space(4), alignItems: "flex-start" },
    actionsFab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 1, borderColor: c.line },
    actionsFabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    actionsMenuWrap: { position: "absolute", left: space(4), minWidth: 188 },
    actionsMenu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    actionsRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    actionsDivider: { borderTopWidth: 1, borderTopColor: c.line },
    actionsLabel: { ...type.body, color: c.text },
    actionsLabelActive: { color: c.accent, fontWeight: "600" },
  });
