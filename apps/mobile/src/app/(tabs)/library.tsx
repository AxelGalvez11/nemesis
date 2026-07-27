import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { GestureDetector } from "react-native-gesture-handler";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { useShellPadding } from "@/components/shell-chrome";
import { useShell } from "@/components/AppDrawer";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton, Surface } from "@/components/mission-ui";
import { Skeleton } from "@/components/Skeleton";
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon, SearchIcon, type IconProps } from "@/components/icons";
import { DragChip } from "@/components/DragChip";
import { FolderPickerSheet, TextPromptSheet, type RowAction } from "@/components/RowActionSheets";
import { MiniMenu, type MenuAnchor } from "@/components/MiniMenu";
import { RootDropZone } from "@/components/RootDropZone";
import { useRowDrag } from "@/components/useRowDrag";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  fetchLibrary,
  loadCachedLibrary,
  moveFolder,
  moveNote,
  renameFolder,
  renameNote,
  type CloudLibraryNote,
  type CloudLibrarySnapshot,
} from "@/api/cloudLibrary";
import { searchLibrarySemantic } from "@/api/librarySearch";
import { buildLibraryRows, type LibraryRow } from "@/lib/library-sync";
import { findNotes, findSummary } from "@/lib/library-find";
import {
  allFolderPaths,
  folderOf,
  isAtOrUnder,
  type LibrarySelectionItem,
  pruneCoveredSelection,
} from "@/lib/library-paths";
import { fileKindOf, folderNoteCounts, type FileKind } from "@/lib/library-row-meta";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

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

/** Which row a long press opened the actions menu for. Notes and folders get
 *  the same three actions but reach different cloud calls (a folder rename has
 *  to carry every note beneath it), so the target keeps them apart. */
type RowTarget =
  | { kind: "note"; id: string; title: string; path: string }
  | { kind: "folder"; path: string; name: string };

export default function LibraryScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const insets = useSafeAreaInsets();
  const { setHeaderTitle, setHeaderRight } = useShell();
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
  // Paths the semantic index returned for the CURRENT query, strongest first.
  // Empty is the normal state: before the debounce fires, while the request is in
  // flight, and whenever the lookup finds nothing or cannot be reached. The name
  // filter never waits on any of that.
  const [semanticPaths, setSemanticPaths] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("az");
  const [sortOpen, setSortOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulling = useRef(false);
  // Long-press row actions (owner 2026-07-22). One target drives all three
  // sheets; which sheet is up is the separate `rowSheet`, so closing the menu to
  // open Rename doesn't lose track of the row being renamed.
  const [rowTarget, setRowTarget] = useState<RowTarget | null>(null);
  // "actions" is gone — a held row now opens a MiniMenu at the touch point
  // (owner 2026-07-23) instead of a bottom sheet. rowSheet only tracks the two
  // follow-on sheets the menu hands off to.
  const [rowSheet, setRowSheet] = useState<"rename" | "move" | "new-folder" | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  // The held-row MiniMenu: where it opens, anchored to the finger. Null = closed.
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  // The top-right "…" actions dropdown (owner 2026-07-23: the "…" moved off the
  // bottom-left FAB and into the header, matching Study).
  const [actionsOpen, setActionsOpen] = useState(false);
  // Multi-select (owner 2026-07-23). Keys are the SAME "note:<path>" /
  // "folder:<path>" strings the list and the drag hook already use, so one set
  // covers both kinds. `selectMoveOpen` is the bulk Move picker.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [selectMoveOpen, setSelectMoveOpen] = useState(false);

  // Drive the TopBar's centered label (same slot chat.tsx uses); clear it on unmount
  // so the title never leaks onto another screen.
  useEffect(() => {
    setHeaderTitle("Library");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  // The "…" actions button, TOP-RIGHT (owner 2026-07-23) — this is where the
  // old bottom-left FAB's menu moved to, matching Study's kebab. Hidden in
  // select mode: the selection bar owns the bottom of the screen then, and its
  // Move/Delete are the only actions that make sense while rows are checked.
  useEffect(() => {
    setHeaderRight(
      !selectMode ? (
        <GlassSurface style={styles.kebabBtn} fallbackColor={c.glassPanel} tint={actionsOpen ? c.accentFaint : undefined} shadow>
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
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [selectMode, actionsOpen, c, styles, setHeaderRight]);

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

  // Ask the semantic index what this query is ABOUT, a beat after typing stops.
  // Debounced so a six-letter word is one lookup rather than six, and guarded by
  // `alive` so a slow answer to an abandoned query can never overwrite the rows
  // for the query the reader is actually looking at.
  //
  // Two characters is the floor: below that every note in a library is a
  // plausible neighbour and the results are noise, not answers.
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setSemanticPaths([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void searchLibrarySemantic(needle).then((hits) => {
        if (!alive) return;
        // One entry per note, keeping the strongest chunk's position — several
        // chunks of one lecture are still one row in a list of notes.
        const seen = new Set<string>();
        setSemanticPaths(hits.flatMap((hit) => (seen.has(hit.path) ? [] : (seen.add(hit.path), [hit.path]))));
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

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
        const base = prev ?? new Set(folderNoteCounts(snapshot.notes.map((n) => n.path), snapshot.folders).keys());
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

  // --- long-press row actions (owner 2026-07-22) ----------------------------
  // Rename / Move / Delete against the same cloud table the web app writes
  // (api/cloudLibrary.ts). Every one of them ends with a full refresh, because a
  // folder rename cascades across every note beneath it and re-deriving the tree
  // from server truth is cheaper to reason about than patching rows by hand.

  const closeRowSheets = useCallback(() => {
    setRowSheet(null);
    setRowTarget(null);
    setRowError(null);
    setMenuAnchor(null);
  }, []);

  /** Run a library write, then re-pull. `inline` keeps a failure inside the open
   *  prompt (so a rejected name can be corrected without retyping); otherwise it
   *  closes up and flashes the screen's usual hint line. */
  const applyRowChange = useCallback(
    async (work: () => Promise<unknown>, opts?: { inline?: boolean }) => {
      if (!userId) return;
      setRowBusy(true);
      setRowError(null);
      try {
        await work();
        closeRowSheets();
        await refresh(userId);
      } catch (e) {
        const message = (e as Error).message;
        if (opts?.inline) setRowError(message);
        else {
          closeRowSheets();
          flashHint(message);
        }
      } finally {
        setRowBusy(false);
      }
    },
    [userId, refresh, closeRowSheets, flashHint],
  );

  /** Make a new note and open it (owner 2026-07-24: "useres cannot create new
   *  note or folder from the library sidebar"). The Library's "…" menu carried
   *  both rows already, but each one only printed "new notes are created on the
   *  web app" — which had stopped being true: createNote is a real, working
   *  insert, wired up to the note screen's "+" and nowhere else.
   *
   *  The ref is a SYNCHRONOUS lock. State would not do: two taps in the same
   *  frame both read the old value and you get two "Untitled note" rows. */
  const creatingNote = useRef(false);
  const onNewNote = useCallback(async () => {
    if (!userId || creatingNote.current) return;
    creatingNote.current = true;
    try {
      const note = await createNote(userId);
      await refresh(userId);
      router.push({ params: { id: note.id }, pathname: "/note" });
    } catch (e) {
      flashHint((e as Error).message);
    } finally {
      creatingNote.current = false;
    }
  }, [userId, refresh, flashHint]);

  /** Make an empty folder at the library root. Root rather than "the folder
   *  you're looking at" because this screen has no notion of a current folder —
   *  the tree shows every level at once — so there is nothing to infer from.
   *  Putting it somewhere afterwards is a drag or a Move, same as any other row. */
  const onNewFolderConfirm = useCallback(
    (name: string) => {
      if (!userId) return;
      void applyRowChange(() => createFolder(userId, snapshot, name), { inline: true });
    },
    [userId, snapshot, applyRowChange],
  );

  // Delete confirms through the OS alert rather than another in-app sheet: it's
  // the one irreversible-looking action here, and the native dialog is what a
  // student already recognizes as "this one is serious".
  const confirmDelete = useCallback(
    (target: RowTarget) => {
      const label = target.kind === "note" ? target.title : target.name;
      setRowSheet(null);
      setMenuAnchor(null);
      Alert.alert(
        `Delete "${label}"?`,
        target.kind === "note"
          ? "It leaves your library on every device. It isn't destroyed — you can still recover it on the web app."
          : "The folder and everything inside it leave your library on every device. They aren't destroyed — you can still recover them on the web app.",
        [
          { text: "Cancel", style: "cancel", onPress: () => setRowTarget(null) },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              void applyRowChange(() =>
                target.kind === "note" ? deleteNote(userId ?? "", target.id) : deleteFolder(userId ?? "", snapshot, target.path),
              ),
          },
        ],
      );
    },
    [applyRowChange, userId, snapshot],
  );

  const onRenameConfirm = useCallback(
    (value: string) => {
      const target = rowTarget;
      if (!target || !userId) return;
      void applyRowChange(
        () => (target.kind === "note" ? renameNote(userId, snapshot, target.id, value) : renameFolder(userId, snapshot, target.path, value)),
        { inline: true },
      );
    },
    [rowTarget, userId, snapshot, applyRowChange],
  );

  const onMovePick = useCallback(
    (folder: string) => {
      const target = rowTarget;
      if (!target || !userId) return;
      void applyRowChange(() =>
        target.kind === "note" ? moveNote(userId, snapshot, target.id, folder) : moveFolder(userId, snapshot, target.path, folder),
      );
    },
    [rowTarget, userId, snapshot, applyRowChange],
  );

  // --- hold-to-drag (owner 2026-07-23) --------------------------------------
  // Row keys are "note:<path>" / "folder:<path>" — the same shape the list's
  // keyExtractor already produces, so one string identifies a row AND says what
  // it is. Dropping runs the very same move the menu's "Move to…" does.
  const openRowMenu = useCallback(
    (rowKey: string, x: number, y: number) => {
      const path = rowKey.slice(rowKey.indexOf(":") + 1);
      if (rowKey.startsWith("folder:")) {
        setRowTarget({ kind: "folder", name: path.split("/").pop() ?? path, path });
      } else {
        const note = snapshot.notes.find((n) => n.path === path);
        if (!note) return;
        setRowTarget({ kind: "note", id: note.id, path: note.path, title: note.title });
      }
      // The MiniMenu opens at the finger (owner 2026-07-23) instead of a bottom
      // sheet — the same touch-anchored menu the sidebar uses.
      setMenuAnchor({ x, y });
    },
    [snapshot],
  );

  // --- multi-select (owner 2026-07-23) --------------------------------------
  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
    setSelectMoveOpen(false);
  }, []);

  // Enter select mode, optionally pre-checking the row the MiniMenu opened over
  // (its "Select" action). Closing the menu first keeps the two overlays from
  // fighting for the same tap.
  const enterSelectMode = useCallback((prekey?: string) => {
    setMenuAnchor(null);
    setActionsOpen(false);
    setSelectedKeys(prekey ? new Set([prekey]) : new Set());
    setSelectMode(true);
  }, []);

  // Selected rows as delete/move items, with anything already carried by a
  // selected ANCESTOR folder removed — so a bulk op touches each thing exactly
  // once (see pruneCoveredSelection). Sorted deepest-path first so a note is
  // always deleted before the folder it sits in, which keeps the running
  // snapshot the ops read consistent.
  const selectedItems = useMemo(() => {
    const items: LibrarySelectionItem[] = [...selectedKeys].map((key) => {
      const path = key.slice(key.indexOf(":") + 1);
      if (key.startsWith("folder:")) return { kind: "folder", path };
      const note = snapshot.notes.find((n) => n.path === path);
      return { kind: "note", id: note?.id ?? "", path };
    });
    return pruneCoveredSelection(items.filter((it) => it.kind === "folder" || it.id !== ""))
      .sort((a, b) => b.path.length - a.path.length);
  }, [selectedKeys, snapshot]);

  const runSelected = useCallback(
    (work: () => Promise<unknown>) => {
      if (!userId) return;
      setRowBusy(true);
      void (async () => {
        try {
          await work();
          await refresh(userId);
          exitSelect();
        } catch (e) {
          flashHint((e as Error).message);
        } finally {
          setRowBusy(false);
        }
      })();
    },
    [userId, refresh, exitSelect, flashHint],
  );

  const moveSelected = useCallback(
    (folder: string) => {
      if (!userId) return;
      const items = selectedItems;
      runSelected(async () => {
        for (const item of items) {
          if (item.kind === "folder") await moveFolder(userId, snapshot, item.path, folder);
          else await moveNote(userId, snapshot, item.id, folder);
        }
      });
    },
    [userId, selectedItems, snapshot, runSelected],
  );

  const deleteSelected = useCallback(() => {
    if (!userId || selectedItems.length === 0) return;
    const items = selectedItems;
    Alert.alert(
      `Delete ${items.length} item${items.length === 1 ? "" : "s"}?`,
      "They leave your library on every device. They aren't destroyed — you can still recover them on the web app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            runSelected(async () => {
              for (const item of items) {
                if (item.kind === "folder") await deleteFolder(userId, snapshot, item.path);
                else await deleteNote(userId, item.id);
              }
            }),
        },
      ],
    );
  }, [userId, selectedItems, snapshot, runSelected]);

  const onRowDrop = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (!userId) return;
      const sourcePath = sourceKey.slice(sourceKey.indexOf(":") + 1);
      const destination = targetKey.slice(targetKey.indexOf(":") + 1);
      if (sourceKey.startsWith("folder:")) {
        void applyRowChange(() => moveFolder(userId, snapshot, sourcePath, destination));
        return;
      }
      const note = snapshot.notes.find((n) => n.path === sourcePath);
      if (note) void applyRowChange(() => moveNote(userId, snapshot, note.id, destination));
    },
    [userId, snapshot, applyRowChange],
  );

  const rowDrag = useRowDrag({ onDrop: onRowDrop, onHold: openRowMenu });

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

  if (!dataReady) {
    return (
      <View style={styles.flex} testID="library-loading">
        <LibrarySkeleton contentTop={contentTop} />
      </View>
    );
  }

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
  // snapshot.folders is passed too, or a folder you just made — which by
  // definition holds no notes yet — has no key here and is therefore both
  // uncounted and, since these keys are the start-collapsed seed, missing from
  // the tree entirely (owner 2026-07-24).
  const folderCounts = folderNoteCounts(notes.map((n) => n.path), snapshot.folders);
  const collapsed = collapsedOverride ?? new Set(folderCounts.keys());

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  // Flat, globally-sorted list ONLY while searching. Picking a sort used to
  // flatten the tree too — which read as "my folders disappeared" (owner bug
  // report 2026-07-21) — so now every sort order reorders the folder tree in
  // place instead: notes within their folder, folders among their siblings.
  const flat = searching;
  // Name matches now, meaning matches when the lookup lands. findNotes appends the
  // second group without disturbing the first, so the list does not jump under the
  // reader's finger when the answer arrives a few hundred milliseconds later.
  const found = findNotes(notes, trimmed, semanticPaths);
  const filtered = found.notes;
  const rows: LibraryRow[] = flat
    ? // Only the NAME matches are re-sorted. The meaning matches arrive ranked by
      // how well they answer the query, and an A–Z pass over them would throw away
      // the one thing that ordering knows.
      [...sortNotes(filtered.slice(0, filtered.length - found.byMeaning), sort), ...filtered.slice(filtered.length - found.byMeaning)]
        .map((n) => ({ type: "note", path: n.path, title: n.title, depth: 0 }))
    : buildLibraryRows(
        notes.map((d) => ({ path: d.path, title: d.title, updatedAt: d.updatedAt, createdAt: d.createdAt })),
        collapsed,
        sort,
        snapshot.folders,
      );

  // Context line above the list: match count while searching, else which
  // non-default sort is on (nothing for the everyday A–Z tree).
  const listHeader = searching ? findSummary(rows.length, found.byMeaning) : sort !== "az" ? sortLabel(sort) : null;

  // Row-action derivations. Every folder in the tree is a move destination; for
  // a FOLDER being moved, its own subtree is struck out — dropping a folder
  // inside itself would orphan everything under it.
  const folderOptions = allFolderPaths(notes.map((n) => n.path), snapshot.folders);
  const rowLabel = rowTarget ? (rowTarget.kind === "note" ? rowTarget.title : rowTarget.name) : "";
  // MiniMenu doesn't dismiss itself when an action is tapped (only its backdrop
  // does), so each action clears the anchor as it hands off — otherwise the menu
  // would still be up behind the sheet it opened. Rename/Move keep rowTarget for
  // the follow-on sheet; the others don't need it.
  const rowActions: RowAction[] = rowTarget
    ? [
        { key: "rename", label: "Rename", onPress: () => { setMenuAnchor(null); setRowSheet("rename"); } },
        { key: "move", label: "Move to…", onPress: () => { setMenuAnchor(null); setRowSheet("move"); } },
        {
          key: "select",
          label: "Select",
          onPress: () => enterSelectMode(rowTarget.kind === "note" ? `note:${rowTarget.path}` : `folder:${rowTarget.path}`),
        },
        { key: "delete", label: "Delete", destructive: true, onPress: () => confirmDelete(rowTarget) },
      ]
    : [];
  const moveDisabled =
    rowTarget?.kind === "folder" ? new Set(folderOptions.filter((f) => isAtOrUnder(f, rowTarget.path))) : undefined;
  // Bulk move: strike out every selected folder's own subtree as a destination —
  // the union of what the single-row move disables, over all selected folders.
  // Without this the picker would offer a folder its own inside as a target;
  // moveFolder throws on that (into-self), so this turns a confusing error into
  // an un-tappable row. Notes-only selection → empty set → everywhere allowed.
  const selectFolderPaths = selectedItems.filter((it) => it.kind === "folder").map((it) => it.path);
  const bulkMoveDisabled = new Set(folderOptions.filter((f) => selectFolderPaths.some((p) => isAtOrUnder(f, p))));

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
              placeholderTextColor={c.textHint}
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
        contentContainerStyle={[styles.listBody, { paddingTop: space(1), paddingBottom: contentBottom + (selectMode ? 72 : 0) }]}
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
          const rowKey = `${item.type}:${item.path}`;
          const isOver = rowDrag.overKey === rowKey;
          const isDragging = rowDrag.activeKey === rowKey;
          // A folder can't go inside itself, and dropping something back where
          // it already is would be a no-op — neither should highlight.
          const canDropOn = (targetKey: string) => {
            const destination = targetKey.slice(targetKey.indexOf(":") + 1);
            if (destination === folderOf(item.path)) return false;
            return item.type === "folder" ? !isAtOrUnder(destination, item.path) : true;
          };
          const isSelected = selectedKeys.has(rowKey);
          if (item.type === "folder") {
            const isCollapsed = collapsed.has(item.path);
            const count = folderCounts.get(item.path) ?? 0;
            return (
              // In select mode the row can't be dragged or held for a menu — a
              // tap toggles its checkbox instead (matches Study).
              <GestureDetector gesture={rowDrag.gestureFor(rowKey, { canDropOn, draggable: !selectMode, holdForMenu: !selectMode })}>
              <Pressable
                ref={rowDrag.registerRow(rowKey, true)}
                style={({ pressed }) => [
                  styles.folderRow,
                  indent,
                  pressed && styles.rowPressed,
                  isOver && styles.rowDropTarget,
                  isDragging && styles.rowDragging,
                  selectMode && isSelected && styles.rowSelected,
                ]}
                testID={`folder-${item.path}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} folder, ${count} item${count === 1 ? "" : "s"}`}
                accessibilityState={{ expanded: !isCollapsed, selected: selectMode ? isSelected : undefined }}
                onPress={() => (selectMode ? toggleSelect(rowKey) : toggleFolder(item.path))}
              >
                {selectMode ? <SelectDot on={isSelected} /> : null}
                {/* Chevron points right when collapsed, down when open (owner 2026-07-20). */}
                <View style={isCollapsed ? null : styles.chevronOpen}>
                  <ChevronIcon size={13} color={c.text2} strokeWidth={2.2} />
                </View>
                <FolderIcon size={16} color={c.text2} strokeWidth={1.9} />
                <Text style={styles.folderName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.folderCount}>{count}</Text>
              </Pressable>
              </GestureDetector>
            );
          }
          // Note row: title only (owner 2026-07-21). The parent-path breadcrumb
          // survives in flat/search & sort views — it's location, not a
          // description, and it disambiguates same-named notes across folders.
          const parent = flat ? folderOf(item.path) : "";
          const note = notesByPath.get(item.path);
          const kind: FileKind = note ? fileKindOf(note.path) : "note";
          return (
            <GestureDetector gesture={rowDrag.gestureFor(rowKey, { canDropOn, draggable: !selectMode, holdForMenu: !selectMode })}>
            <Pressable
              // A note is never a drop TARGET — you drop onto folders — but it
              // still registers so the drag can pick it up.
              ref={rowDrag.registerRow(rowKey, false)}
              style={({ pressed }) => [
                styles.row,
                indent,
                pressed && styles.rowPressed,
                isDragging && styles.rowDragging,
                selectMode && isSelected && styles.rowSelected,
              ]}
              testID={`note-${item.path}`}
              accessibilityState={{ selected: selectMode ? isSelected : undefined }}
              onPress={() => {
                if (selectMode) {
                  toggleSelect(rowKey);
                  return;
                }
                const id = pathToId.get(item.path);
                if (id) router.push({ pathname: "/note", params: { id } });
              }}
            >
              {selectMode ? <SelectDot on={isSelected} /> : null}
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
            </GestureDetector>
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

      {/* The top-right "…" dropdown (owner 2026-07-23): Search / New note / New
          folder / Sort — the four the bottom-left FAB used to hold — plus
          Select. The FAB is gone; this is the one "…" now, in the header. */}
      <LibraryActionsMenu
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        searchActive={searchOpen}
        onSearch={toggleSearch}
        onNewNote={() => void onNewNote()}
        onNewFolder={() => setRowSheet("new-folder")}
        onSort={() => setSortOpen(true)}
        onSelect={() => enterSelectMode()}
        top={contentTop}
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

      {/* Held-row actions (owner 2026-07-23): a MiniMenu at the finger, not a
          bottom sheet. Rename / Move hand off to the sheets below; Select drops
          into multi-select with this row already checked. */}
      <MiniMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        actions={rowActions}
        onClose={closeRowSheets}
        testID="library-row-menu"
      />
      <TextPromptSheet
        visible={rowSheet === "rename"}
        title={rowTarget?.kind === "folder" ? "Rename folder" : "Rename note"}
        placeholder={rowTarget?.kind === "folder" ? "Folder name" : "Note title"}
        initialValue={rowLabel}
        busy={rowBusy}
        error={rowError}
        onConfirm={onRenameConfirm}
        onClose={closeRowSheets}
        testID="library-rename-prompt"
      />
      <TextPromptSheet
        visible={rowSheet === "new-folder"}
        title="New folder"
        placeholder="Folder name"
        initialValue=""
        confirmLabel="Create"
        busy={rowBusy}
        // inline, so a name that's already taken can be corrected in place
        // rather than closing the sheet and losing what was typed.
        error={rowError}
        onConfirm={onNewFolderConfirm}
        onClose={closeRowSheets}
        testID="library-new-folder-prompt"
      />
      {/* Drop here to pull something out of every folder. The key's suffix is
          "" — the empty destination moveNote/moveFolder already read as the
          library root — so it needs no special case in onRowDrop. */}
      <RootDropZone
        // `true` twice: droppable, and a FALLBACK target. The zone spans the
        // whole list now, so it contains every folder row — without the
        // fallback flag a first-match hit test would send nearly every drop to
        // the top level. See useRowDrag's RegisteredRow.fallback.
        ref={rowDrag.registerRow("root:", true, true)}
        active={rowDrag.activeKey !== null}
        over={rowDrag.overKey === "root:"}
        top={contentTop}
        bottom={contentBottom}
      />

      {/* Rides the finger during a drag; the row itself stays put and dims. */}
      <DragChip
        visible={rowDrag.activeKey !== null}
        label={rowDrag.activeKey ? (rowDrag.activeKey.slice(rowDrag.activeKey.indexOf(":") + 1).split("/").pop() ?? "") : ""}
        fingerX={rowDrag.fingerX}
        fingerY={rowDrag.fingerY}
      />

      <FolderPickerSheet
        visible={rowSheet === "move"}
        title={rowTarget?.kind === "folder" ? "Move folder to" : "Move note to"}
        folders={folderOptions}
        currentFolder={rowTarget ? folderOf(rowTarget.path) : ""}
        disabledPaths={moveDisabled}
        rootLabel="Library root"
        onPick={onMovePick}
        onClose={closeRowSheets}
        testID="library-move-picker"
      />

      {/* Bulk Move picker (select mode). Reuses the same sheet as the single-row
          move; the destination is applied to every pruned selection. */}
      <FolderPickerSheet
        visible={selectMoveOpen}
        title={`Move ${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} to`}
        folders={folderOptions}
        currentFolder=""
        disabledPaths={bulkMoveDisabled}
        rootLabel="Library root"
        onPick={moveSelected}
        onClose={() => setSelectMoveOpen(false)}
        testID="library-select-move"
      />

      {/* The selection bar (owner 2026-07-23), pinned to the bottom while select
          mode is on. Same shape as Study's. Hidden while the bulk Move picker is
          up so the two don't stack. */}
      {selectMode && !selectMoveOpen ? (
        <View style={[styles.selectBar, { paddingBottom: insets.bottom + space(2) }]} testID="library-select-bar">
          {/* The PRUNED count, so this agrees with the delete dialog: checking a
              folder and a note inside it is one thing to act on, not two, because
              the folder carries the note. */}
          <Text style={styles.selectCount}>{selectedItems.length} selected</Text>
          {/* Delete, Move, Cancel — the owner's order (2026-07-24), and the same
              one Study uses. Cancel sits last because it's the way out, not the
              first thing to reach for; it is also the only button with no
              `disabled`, since backing out has to work with nothing ticked. */}
          <View style={styles.selectActions}>
            <Pressable
              onPress={deleteSelected}
              disabled={selectedItems.length === 0 || rowBusy}
              hitSlop={6}
              style={styles.selectBtn}
              testID="library-select-delete"
            >
              <Text style={[styles.selectBtnText, styles.selectBtnDanger, selectedItems.length === 0 && styles.selectBtnDisabled]}>
                Delete
              </Text>
            </Pressable>
            <Pressable
              onPress={() => selectedItems.length > 0 && setSelectMoveOpen(true)}
              disabled={selectedItems.length === 0 || rowBusy}
              hitSlop={6}
              style={styles.selectBtn}
              testID="library-select-move-btn"
            >
              <Text style={[styles.selectBtnText, selectedItems.length === 0 && styles.selectBtnDisabled]}>Move to…</Text>
            </Pressable>
            <Pressable onPress={exitSelect} hitSlop={6} style={styles.selectBtn} testID="library-select-cancel">
              <Text style={styles.selectBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Loading skeleton (replaces the old blank View while the first cache read is in
// flight — see `dataReady` above): one folder-shaped row then a handful of
// note-shaped rows, reusing the REAL row styles (folderRow/row/rowTextCol) so the
// placeholder lines up exactly with the content that lands under it.
const SKELETON_NOTE_WIDTHS = ["78%", "54%", "68%", "45%", "60%"] as const;

function LibrarySkeleton({ contentTop }: { contentTop: number }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.listBody, { paddingTop: contentTop + space(3) }]} testID="library-skeleton">
      <View style={styles.folderRow}>
        <Skeleton width={16} height={16} radius={4} />
        <Skeleton width="35%" height={16} />
      </View>
      {SKELETON_NOTE_WIDTHS.map((w, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rowTextCol}>
            <Skeleton width={w} height={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

// The lower-left three-dots glass button + the small glass popup it opens (owner
// 2026-07-18). Same always-mounted fade+rise + transparent tap-catcher pattern as
// StudyModeMenu, so it feels like one family. Picking an item closes the menu and
// runs its action; the page behind is NOT blurred — the menu's own glass is the
// only blur.

/** One checkbox dot on a row in select mode (owner 2026-07-23). Same shape as
 *  Study's — a ring that fills accent with a check when on. */
function SelectDot({ on }: { on: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.selectDot, on && styles.selectDotOn]}>
      {on ? <Text style={styles.selectDotCheck}>✓</Text> : null}
    </View>
  );
}

/** The top-right "…" actions dropdown (owner 2026-07-23). This is the old
 *  bottom-left FAB's menu, relocated into the header and made a CONTROLLED
 *  overlay (the trigger now lives in the TopBar via setHeaderRight, so open
 *  state is owned by the screen). Search / New note / New folder / Sort are the
 *  four the FAB carried — none dropped — plus Select for multi-select. Hangs
 *  from just under the header on the right; a full-screen tap-catcher closes it,
 *  and only the menu's own glass is blurred. */
function LibraryActionsMenu({
  open,
  onClose,
  searchActive,
  onSearch,
  onNewNote,
  onNewFolder,
  onSort,
  onSelect,
  top,
}: {
  open: boolean;
  onClose: () => void;
  searchActive: boolean;
  onSearch: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onSort: () => void;
  onSelect: () => void;
  top: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 170 : 130,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  const items: { key: string; label: string; icon: React.ReactNode; onPress: () => void }[] = [
    { key: "search", label: "Search", icon: <SearchIcon size={17} color={searchActive ? c.accent : c.text2} />, onPress: onSearch },
    { key: "new-note", label: "New note", icon: <PlusIcon size={17} color={c.text2} />, onPress: onNewNote },
    { key: "new-folder", label: "New folder", icon: <FolderPlusIcon size={17} color={c.text2} />, onPress: onNewFolder },
    { key: "sort", label: "Sort", icon: <SortIcon size={17} color={c.text2} />, onPress: onSort },
    { key: "select", label: "Select", icon: <SelectIcon size={17} color={c.text2} />, onPress: onSelect },
  ];

  return (
    <>
      {open ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      ) : null}

      <Animated.View
        style={[styles.actionsMenuWrap, { top: top + space(1), opacity: progress, transform: [{ translateY }] }]}
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

/** A checkmark-in-a-ring — the Select action's glyph, echoing the row checkboxes
 *  select mode draws. */
function SelectIcon({ size = 17, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.2 12.2l2.6 2.6 5-5.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
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
    // Drag-and-drop feedback (owner 2026-07-23): the folder under your finger
    // lights up, and the row you picked up fades so it's clear it's in flight.
    rowDropTarget: { backgroundColor: c.accentFaint, borderWidth: 1, borderColor: c.accentLine },
    rowDragging: { opacity: 0.4 },
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
    // The top-right "…" header button (owner 2026-07-23) — same control.lg glass
    // circle Study uses, so the two tabs' kebabs match.
    kebabBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    kebabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    // The actions dropdown now hangs from the top-right, under the header, rather
    // than up from a bottom-left FAB.
    actionsMenuWrap: { position: "absolute", right: space(4), minWidth: 200, zIndex: 40 },
    actionsMenu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    actionsRow: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    actionsDivider: { borderTopWidth: 1, borderTopColor: c.line },
    actionsLabel: { ...type.body, color: c.text },
    actionsLabelActive: { color: c.accent, fontWeight: "600" },
    // Select mode (owner 2026-07-23), ported from Study so the two feel identical.
    rowSelected: { borderWidth: 1, borderColor: c.accent, backgroundColor: c.accentFaint },
    selectDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.line2, alignItems: "center", justifyContent: "center", marginRight: space(1) },
    selectDotOn: { backgroundColor: c.accent, borderColor: c.accent },
    selectDotCheck: { color: c.onAccent, fontSize: 13, fontWeight: "800", lineHeight: 15 },
    selectBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(3),
      backgroundColor: c.raised,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    selectCount: { ...type.small, color: c.text2, fontWeight: "600" },
    selectActions: { flexDirection: "row", alignItems: "center", gap: space(4) },
    selectBtn: { paddingVertical: space(1.5) },
    selectBtnText: { ...type.body, color: c.accent, fontWeight: "600" },
    selectBtnDanger: { color: c.danger },
    selectBtnDisabled: { opacity: 0.4 },
  });
