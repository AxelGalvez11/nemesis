import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Reanimated, { LinearTransition } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { useShellPadding } from "@/components/shell-chrome";
import { useShell } from "@/components/AppDrawer";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon, SearchIcon, type IconProps } from "@/components/icons";
import { fetchLibrary, loadCachedLibrary, type CloudLibraryNote, type CloudLibrarySnapshot } from "@/api/cloudLibrary";
import { buildLibraryRows, type LibraryRow } from "@/lib/library-sync";
import { fileKindOf, folderNoteCounts, type FileKind } from "@/lib/library-row-meta";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Library (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md §7):
// the same notes the web app's Library reads and writes, on your phone. Shows the
// last-cached list instantly (offline included), then refreshes from the cloud
// behind that — on open and whenever this screen regains focus. No editor anywhere
// on this screen by design (single-writer architecture, for now): the web app is
// the only place a note gets created or changed; this phone shows a read-only copy.
// Only kind:"note" rows render here — folder rows only inform the folder tree.
//
// Folders nest arbitrarily deep (mirrors the web app's own folder structure) and
// each one collapses independently — buildLibraryRows() (lib/library-sync.ts) turns
// the flat doc-path list into a depth-tagged row list every render; `collapsed` (a
// Set of full folder paths, e.g. "PHCY 1205/Unit 1") is the only state that drives
// it, so collapsing a parent never disturbs a child's own remembered state. Every
// folder starts collapsed on a fresh open of this screen (owner 2026-07-20) — see
// collapsedOverride below for the mechanism and why it's mount-scoped, not just
// "empty by default": AppDrawer navigates here with router.push (not navigate),
// which always mounts a brand-new screen instance, so "fresh open" and "fresh
// mount" are the same event in this app.
//
// Document identity (owner 2026-07-20, distinct from Study's progress identity):
// each note row gets a small file-kind glyph, sourced from lib/library-row-
// meta.ts. Note rows are TITLE-ONLY (owner 2026-07-21 — the old one-line
// content preview leaked frontmatter "---" delimiters and is gone); the only
// secondary line left is the folder breadcrumb in flat/search & sort views,
// which disambiguates same-named notes. Folder headers show a recursive item
// count.
//
// Read-only controls (this screen owns the UI, never the data): a Search that filters
// the list, a Sort half-sheet that reorders it, and New note / New folder buttons that
// only ever explain "create it on the web app" — a phone write isn't wired up yet, so
// those actions are deliberately inert until phone editing ships.

// A–Z / Z–A by title; Modified by the row's updated_at; Created by its created_at —
// the cloud table carries both, so every ordering the owner specced has honest data
// to stand on (unlike the old Mac-paired mirror, which only ever had mtime).
type SortKey = "az" | "za" | "mod-asc" | "mod-desc" | "created-asc" | "created-desc";

const SORT_OPTIONS = [
  { key: "az", label: "A–Z" },
  { key: "za", label: "Z–A" },
  { key: "mod-asc", label: "Modified (old → new)" },
  { key: "mod-desc", label: "Modified (new → old)" },
  { key: "created-asc", label: "Created (old → new)" },
  { key: "created-desc", label: "Created (new → old)" },
] as const;

const NEW_NOTE_HINT = "New notes are created on the web app — this phone shows a read-only copy.";
const NEW_FOLDER_HINT = "New folders are created on the web app — this phone shows a read-only copy.";

function sortLabel(key: SortKey): string {
  switch (key) {
    case "za":
      return "Sorted · Z–A";
    case "mod-asc":
      return "Sorted · Modified (old → new)";
    case "mod-desc":
      return "Sorted · Modified (new → old)";
    case "created-asc":
      return "Sorted · Created (old → new)";
    case "created-desc":
      return "Sorted · Created (new → old)";
    default:
      return "Sorted · A–Z";
  }
}

/** Pure reorder for the flat (search / non-default-sort) list. ISO timestamps
 * compare lexicographically; notes with no timestamp (shouldn't happen for a
 * well-formed cloud row, but defensive) sort to the end in title order. */
function sortNotes<T extends { title: string; updatedAt: string; createdAt: string }>(list: T[], key: SortKey): T[] {
  if (key === "az") return [...list].sort((a, b) => a.title.localeCompare(b.title));
  if (key === "za") return [...list].sort((a, b) => b.title.localeCompare(a.title));
  const field = key === "created-asc" || key === "created-desc" ? "createdAt" : "updatedAt";
  const ascending = key === "mod-asc" || key === "created-asc";
  const timed = list.filter((n) => n[field]);
  const untimed = list.filter((n) => !n[field]).sort((a, b) => a.title.localeCompare(b.title));
  timed.sort((a, b) => (ascending ? a[field].localeCompare(b[field]) : b[field].localeCompare(a[field])));
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
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [dataReady, setDataReady] = useState(false);
  const [snapshot, setSnapshot] = useState<CloudLibrarySnapshot>({ folders: [], notes: [] });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Folders start COLLAPSED on every fresh open (owner 2026-07-20). `null` = "no
  // manual choice yet this mount" — the render below then derives a fully-collapsed
  // Set straight from the CURRENT note paths, synchronously, in the same pass that
  // first paints real rows. That matters for Reanimated's itemLayoutAnimation on
  // this list: seeding collapse via a follow-up effect/setState would paint the
  // rows expanded for one frame and then animate them shut — exactly the
  // first-render fight with the animation the owner flagged. Deriving it inline
  // instead means the rows are simply born collapsed, nothing to animate away.
  // The moment the reader taps ANY folder (toggleFolder below), a real Set is
  // materialized from that same baseline and this screen stops ever auto-touching
  // collapse state again for the rest of the visit — plain useState from then on.
  const [collapsedOverride, setCollapsedOverride] = useState<Set<string> | null>(null);
  // Read-only control state — all declared here, above the early returns, so the
  // hook order never changes between the loading / signed-out / signed-in renders.
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
  const toggleFolder = useCallback(
    (path: string) => {
      // Collapse/expand animates via the list's itemLayoutAnimation (reanimated
      // LinearTransition on Reanimated.FlatList): the rows below slide to their new
      // positions. (LayoutAnimation didn't fire inside the virtualized FlatList.)
      //
      // First-ever toggle this mount: collapsedOverride is still null, so seed a
      // real Set from the SAME fully-collapsed baseline the render below is
      // already showing — only the tapped folder then flips, nothing else jumps.
      setCollapsedOverride((prev) => {
        const base = prev ?? new Set(folderNoteCounts(snapshot.notes.map((n) => n.path)).keys());
        const next = new Set(base);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [snapshot],
  );

  // Fresh cloud pull for `uid`, replacing the snapshot wholesale on success (see
  // cloudLibrary.ts's fetchLibrary — the right behavior so a delete/rename made on
  // the web app is reflected here too). Failures leave the last-known snapshot on
  // screen and just surface the error line below.
  const refresh = useCallback(async (uid: string) => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const fresh = await fetchLibrary(uid);
      setSnapshot(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pulling.current = false;
    }
  }, []);

  // Every time this screen regains focus: render the cached snapshot instantly
  // (offline-friendly), then refresh from the cloud behind that.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!userId) {
        setDataReady(true);
        return () => {
          alive = false;
        };
      }
      void (async () => {
        const cached = await loadCachedLibrary(userId);
        if (!alive) return;
        setSnapshot(cached);
        setDataReady(true);
        void refresh(userId);
      })();
      return () => {
        alive = false;
      };
    }, [userId, refresh]),
  );

  if (!dataReady) return <View style={styles.flex} testID="library-loading" />;

  if (!userId) {
    return (
      <View
        style={[styles.authWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="library-signin"
      >
        <EmptyBlock
          title="Sign in to see your library"
          body="Your notes live in your account. Sign in to read them here — anywhere, even offline once they've loaded."
        />
        <MissionButton label="Sign in" variant="primary" testID="library-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  const notes = snapshot.notes;
  const pathToId = new Map(notes.map((n) => [n.path, n.id]));
  // Explicit value type: a mixed [string, CloudLibraryNote][] would otherwise infer
  // as (string | CloudLibraryNote)[] and widen the Map to the union on both sides.
  const notesByPath = new Map<string, CloudLibraryNote>(notes.map((n) => [n.path, n]));
  // Recursive per-folder note counts — also doubles as "every folder path known
  // right now," which is the fully-collapsed default whenever the reader hasn't
  // manually toggled anything yet this mount (see collapsedOverride above).
  const folderCounts = folderNoteCounts(notes.map((n) => n.path));
  const collapsed = collapsedOverride ?? new Set(folderCounts.keys());

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const needle = trimmed.toLowerCase();
  // Flat, globally-sorted list ONLY while searching. Picking a sort used to
  // flatten the tree too — which read as "my folders disappeared" (owner bug
  // report 2026-07-21) — so now every sort order reorders the folder tree in
  // place instead: notes within their folder, folders among their siblings.
  const flat = searching;
  const filtered = searching
    ? notes.filter((n) => n.title.toLowerCase().includes(needle) || n.path.toLowerCase().includes(needle))
    : notes;
  const rows: LibraryRow[] = flat
    ? sortNotes(filtered, sort).map((n) => ({ type: "note", path: n.path, title: n.title, depth: 0 }))
    : buildLibraryRows(
        notes.map((d) => ({ path: d.path, title: d.title, updatedAt: d.updatedAt, createdAt: d.createdAt })),
        collapsed,
        sort,
      );

  // Context line above the list: match count while searching, else which
  // non-default sort is on (nothing for the everyday A–Z tree).
  const listHeader = searching ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : sort !== "az" ? sortLabel(sort) : null;

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

      {error ? (
        <Surface style={styles.warn} testID="library-error">
          <Text style={styles.warnText}>Couldn't reach your library: {error}</Text>
        </Surface>
      ) : null}

      {/* Reanimated.FlatList so folder collapse/expand animates (itemLayoutAnimation): the
          rows below slide to their new positions. Lighter than Study's per-row fade — kept
          on FlatList here because a library can hold many notes. */}
      <Reanimated.FlatList
        data={rows}
        keyExtractor={(item: LibraryRow) => `${item.type}:${item.path}`}
        keyboardShouldPersistTaps="handled"
        itemLayoutAnimation={LinearTransition.duration(200)}
        contentContainerStyle={[styles.listBody, { paddingTop: space(1), paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void refresh(userId).finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          listHeader ? (
            <Text style={styles.sectionHead} testID="library-list-header">
              {listHeader}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const indent = item.depth > 0 ? { paddingLeft: space(2) + item.depth * space(4) } : null;
          if (item.type === "folder") {
            const isCollapsed = collapsed.has(item.path);
            const count = folderCounts.get(item.path) ?? 0;
            return (
              <Pressable
                style={({ pressed }) => [styles.folderRow, indent, pressed && styles.rowPressed]}
                testID={`folder-${item.path}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} folder, ${count} item${count === 1 ? "" : "s"}`}
                accessibilityState={{ expanded: !isCollapsed }}
                onPress={() => toggleFolder(item.path)}
              >
                {/* Chevron points right when collapsed, down when open (owner 2026-07-20). */}
                <View style={isCollapsed ? null : styles.chevronOpen}>
                  <ChevronIcon size={13} color={c.text2} strokeWidth={2.2} />
                </View>
                <FolderIcon size={16} color={c.text2} strokeWidth={1.9} />
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.folderCount}>{count}</Text>
              </Pressable>
            );
          }
          // Note row: title only (owner 2026-07-21). The parent-path breadcrumb
          // survives in flat/search & sort views — it's location, not a
          // description, and it disambiguates same-named notes across folders.
          const parent = flat ? folderOf(item.path) : "";
          const note = notesByPath.get(item.path);
          const kind: FileKind = note ? fileKindOf(note.path) : "note";
          return (
            <Pressable
              style={({ pressed }) => [styles.row, indent, pressed && styles.rowPressed]}
              testID={`note-${item.path}`}
              onPress={() => {
                const id = pathToId.get(item.path);
                if (id) router.push({ pathname: "/note", params: { id } });
              }}
            >
              {/* Plain notes carry NO leading icon (owner 2026-07-20, Obsidian-style:
                  text only); pdf/doc attachments keep their identity glyph. */}
              {kind === "note" ? null : (
                <View style={styles.rowIcon}>
                  <FileKindGlyph kind={kind} size={14} color={c.text3} />
                </View>
              )}
              <View style={styles.rowTextCol}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                {parent ? <Text style={styles.rowMeta} numberOfLines={1}>{parent}</Text> : null}
              </View>
            </Pressable>
          );
        }}
        // rows.length === 0 iff no notes match: a top-level folder's own row (and every
        // root note) is always emitted regardless of collapse state in tree mode, so the
        // tree branch never falsely fires while notes merely sit behind a collapsed
        // folder. Keeping FlatList's own empty handling (rather than branching around
        // the list) is also what keeps pull-to-refresh alive on the truly-empty state,
        // which is the moment a pull-to-refresh matters most.
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {searching ? (
              <EmptyBlock title="No matching notes" body={`Nothing in your library matches “${trimmed}”.`} />
            ) : (
              <>
                <EmptyBlock
                  title="Nothing here yet"
                  body="Your library lives in your account. Create notes on the web app and they appear here."
                />
                <View style={styles.emptyRefreshBtn}>
                  <MissionButton
                    label="Refresh"
                    busy={refreshing}
                    testID="library-empty-refresh"
                    onPress={() => {
                      setRefreshing(true);
                      void refresh(userId).finally(() => setRefreshing(false));
                    }}
                  />
                </View>
              </>
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
        insetBottom={insets.bottom + space(1)}
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
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.glassPanel} opaque>
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
        <GlassSurface style={styles.actionsFab} fallbackColor={c.glassPanel} tint={open ? c.accentFaint : undefined} shadow>
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

// Per-row "document identity" glyphs (owner 2026-07-20) — pdf/doc only (plain
// notes are icon-free, same owner, later the same day), one shared
// page-outline silhouette (same folded-corner language as the shared FileIcon in
// components/icons.tsx, redrawn small so the three variants can share one outline
// and differ only in their interior mark). Local to this screen on purpose.
function PageOutline({ color, strokeWidth }: { color: string; strokeWidth: number }) {
  return (
    <Path
      d="M6.5 3.4h6.2L18 8.6V19a1.4 1.4 0 0 1-1.4 1.4H6.5A1.4 1.4 0 0 1 5.1 19V4.8A1.4 1.4 0 0 1 6.5 3.4Z"
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Doc (.doc/.docx): page + three lines (a denser paragraph than a note). */
function DocGlyph({ size = 14, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <PageOutline color={color} strokeWidth={strokeWidth} />
      <Line x1="8.1" y1="11.3" x2="14.9" y2="11.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8.1" y1="14.1" x2="14.9" y2="14.1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8.1" y1="16.9" x2="12.3" y2="16.9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** PDF: page + a small filled tag dot (fixed-format cue, same filled-accent
 * language as the dot in the shared CalendarIcon). */
function PdfGlyph({ size = 14, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <PageOutline color={color} strokeWidth={strokeWidth} />
      <Line x1="8.1" y1="11.6" x2="14.9" y2="11.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="8.6" cy="15.6" r="1.15" fill={color} stroke="none" />
      <Line x1="11.1" y1="15.6" x2="14.9" y2="15.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// Notes render with no glyph at all (see renderItem) — this only ever receives
// the two attachment kinds, but returns null defensively for "note" so a future
// call site can't accidentally resurrect the icon the owner removed.
function FileKindGlyph({ kind, size, color }: { kind: FileKind; size: number; color: string }) {
  if (kind === "pdf") return <PdfGlyph size={size} color={color} />;
  if (kind === "doc") return <DocGlyph size={size} color={color} />;
  return null;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    authWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4), backgroundColor: c.bg },

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
    searchInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    hint: { paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
    hintText: { ...type.small, color: c.text2 },

    listBody: { paddingHorizontal: space(4), flexGrow: 1 },
    // "Library" — the label above root-level (unfoldered) notes only; real folders
    // render as folderRow below, each with its own name + chevron. In flat mode this
    // same slot carries the "N results" / "Sorted · …" context line.
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(3), marginBottom: space(1.5) },
    // Notes: still no cards (owner call) — title only, no leading icon (owner
    // 2026-07-20); pdf/doc attachments alone keep a small identity glyph.
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space(2),
      paddingVertical: space(3),
      paddingHorizontal: space(2),
      borderRadius: radius.sm,
    },
    rowPressed: { backgroundColor: c.surface },
    // Nudges the glyph down from the row's top edge to sit level with the title's
    // cap-height rather than the row's full (possibly 2-line) height.
    rowIcon: { marginTop: 3 },
    rowTextCol: { flex: 1 },
    rowTitle: { ...type.body, color: c.text },
    // Shared "secondary line" style: the flat/search parent-path breadcrumb and the
    // tree-view content preview are mutually exclusive (never both shown on one
    // row), so one style covers both.
    rowMeta: { ...type.micro, color: c.text3, marginTop: 2 },
    // Folders ARE collapsible, so they get the chevron notes deliberately don't.
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    folderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      paddingVertical: space(3),
      paddingHorizontal: space(2),
      marginTop: space(3.5),
      borderRadius: radius.sm,
    },
    folderName: { ...type.bodyStrong, color: c.text, flex: 1 },
    // Recursive item count (owner 2026-07-20) — flex:1 on folderName above pushes
    // this flush to the row's trailing edge.
    folderCount: { ...type.micro, color: c.text3 },
    warn: { marginHorizontal: space(4), marginTop: space(1), padding: space(3) },
    warnText: { ...type.small, color: c.text2 },
    emptyWrap: { paddingTop: space(10), gap: space(4) },
    emptyRefreshBtn: { alignSelf: "center" },

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
    sortCheck: { color: c.accent, fontSize: type.small.fontSize + 1, fontWeight: "700" },

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
