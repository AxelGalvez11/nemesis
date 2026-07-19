import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
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
import Svg, { Line, Path } from "react-native-svg";
import { useShellPadding } from "@/components/shell-chrome";
import { useShell } from "@/components/AppDrawer";
import { BlurScrim } from "@/components/BlurScrim";
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

  // Root-level notes (no folder) are the only rows ever at depth 0 with type "note" —
  // that's exactly the old "" bucket buildSections used to label "Library".
  const hasRootNotes = !flat && rows.some((r) => r.type === "note" && r.depth === 0);
  const flatHeader = searching ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : sortLabel(sort);

  return (
    <View style={styles.flex} testID="library-screen">
      {/* Controls header — carries the glass-TopBar clearance so its first row (not the
          list) is what sits below the floating bar. */}
      <View style={[styles.controls, { paddingTop: contentTop }]}>
        <View style={styles.actionRow}>
          <ActionButton
            icon={<SearchIcon size={17} color={searchOpen ? c.accent : c.text2} />}
            label="Search"
            active={searchOpen}
            onPress={toggleSearch}
            testID="library-search-btn"
          />
          <ActionButton
            icon={<PlusIcon size={17} color={c.text2} />}
            label="New note"
            onPress={() => flashHint(NEW_NOTE_HINT)}
            testID="library-new-note"
          />
          <ActionButton
            icon={<FolderPlusIcon size={17} color={c.text2} />}
            label="New folder"
            onPress={() => flashHint(NEW_FOLDER_HINT)}
            testID="library-new-folder"
          />
          <ActionButton
            icon={<SortIcon size={17} color={c.text2} />}
            label="Sort"
            onPress={() => setSortOpen(true)}
            testID="library-sort-btn"
          />
        </View>

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
          ) : hasRootNotes ? (
            <Text style={styles.sectionHead}>Library</Text>
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
                <Text style={[styles.folderChevron, { transform: [{ rotate: isCollapsed ? "0deg" : "90deg" }] }]}>›</Text>
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

/** Compact glass pill in the controls row (Search / New note / New folder / Sort).
 * Self-contained so it can close over the theme without prop-drilling colors. */
function ActionButton({
  icon,
  label,
  active = false,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <GlassSurface style={[actionStyles.btn, { borderColor: active ? c.accentLine : c.line }]} tint={active ? c.accentFaint : undefined}>
      <Pressable
        style={actionStyles.inner}
        onPress={onPress}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        {icon}
        <Text style={[actionStyles.label, { color: active ? c.accent : c.text2 }]}>{label}</Text>
      </Pressable>
    </GlassSurface>
  );
}

/** The half-height SORT sheet. Always mounted (like SlideUpSheet / StudyModeMenu) so
 * both the open and close animations play; a BlurScrim frosts the library behind it. */
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
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <BlurScrim onPress={onClose} />
      </Animated.View>
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

const actionStyles = StyleSheet.create({
  btn: { borderRadius: radius.pill, borderWidth: 1, overflow: "hidden" },
  inner: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingVertical: space(2), paddingHorizontal: space(3) },
  label: { ...type.small, fontWeight: "600" },
});

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    pairWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },
    pairHint: { ...type.small, color: c.text2, textAlign: "center" },

    // Controls header (Search / New note / New folder / Sort + the search field).
    controls: { paddingHorizontal: space(4), paddingBottom: space(3), gap: space(2.5) },
    actionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space(2) },
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
    // Same glyph as settings.tsx's disclosure "›", rotated in place (0deg = collapsed
    // pointing right, 90deg = expanded pointing down) — no icon asset, no animation lib.
    folderChevron: { fontSize: 17, lineHeight: 20, color: c.text2, width: 14, textAlign: "center" },
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
  });
