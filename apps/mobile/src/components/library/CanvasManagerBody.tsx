// The canvas manager itself — folder rows, canvas rows, and everything that files them.
//
// The phone's port of `apps/web/components/workspace/library/canvas-manager.tsx`. That file's
// reasoning is carried here where it still applies and REWRITTEN where the phone genuinely
// diverges; the divergences are all recorded, because the next reader's first instinct will be
// to "restore" whichever one looks like an omission.
//
// 🔴 FILING IS NOT EVIDENCE — the web Library's first red-circle note, and the one that governs
// what this file may import. Moving a canvas into a folder, pinning it, renaming it or deleting
// it is a fact about the student's shelf, never about the student. Nothing on this surface may
// change what Nemesis asks next, so this component imports `api/canvases.ts` and shared UI and
// NOTHING from the learning or evidence path. If a future edit needs a diagnosis, an objective
// or a piece of evidence in here, the edit is wrong.
//
// 🔴 IT OWNS THE DATA AND THE ROWS AND NO CHROME — the `StudyStatsBody.tsx` precedent, followed
// literally. No header, no title, no safe-area handling. `app/(tabs)/library.tsx` is the frame
// and supplies the padding, the TopBar title and the "…". The three controls that "…" opens
// (Search / New folder / Sort) are split the same way: the FRAME owns whether each is open,
// because that is chrome state a button toggles; this component owns what each one DOES, because
// the scope a folder is created in and the sort a query runs under are parts of the query.
//
// 🔴 EVERY ROW ACTION IS DRAWN, AND THAT IS §38.3 HONOURED LITERALLY RATHER THAN BY ANALOGY. The
// measured defect on the web was "62 rows, 62 row-action buttons at opacity 0" — rename, pin,
// move and delete all lived behind a control that painted nothing until a pointer crossed the
// row, "and on a touch screen, where there is no hover, the actions had no affordance at all".
// That sentence is about THIS device class. So every row here carries a drawn "…" as well as
// long-press, and both open the same menu at the finger. Long-press alone would rebuild the exact
// defect the web note was written about, on the exact hardware it was worried about.
//
// 🔴 THE COLUMNS DO NOT SURVIVE, AND THE WEB'S OWN ARGUMENT FOR THE THIRD ONE IS WHY. The web
// shows four columns at 1440 — name · Last opened · Created · "…" — and its file argues at length
// that `created_at` earned the third slot. Read that argument closely and it is a MEASUREMENT: at
// 1440 with three columns "Name runs 462px and the date column lands 486px from the frame's left
// edge, against 368 and 384 there… ours read as the stretched one". Column-width balance at 1440
// does not transfer to 390pt, where three text columns do not fit at all. So a row here is a
// title line plus ONE secondary line, and the secondary line shows the thing you sorted by:
// Last opened normally, Created when Created is the active sort. Nothing is hidden that you
// asked to see. This is a real divergence, not an oversight — restoring the second column would
// re-stretch the row for a reason that was never about the phone.
//
// 🔴 NO SOURCE COUNT, NO PREVIEW, NO PROGRESS, NO BADGE, NO COLOUR, AND NO `state`. `canvas_sources`
// exists as a table and is EMPTY in production — canvases carry their sources inside `document` —
// so a count over it renders "0" on a canvas that plainly has material attached: a confident false
// claim about the student's own work. The web pins this with a guard test and so does the phone:
// `canvas-rows.test.ts` reads THIS file, strips its comments and asserts that nothing matching
// `sources.length|sourceCount|canvas_sources` survives in executable code. The comments are
// exempt on purpose — banning the prose that explains the rule would push the reasoning out of
// the file to satisfy the test. `state` is selected by the query and rendered by neither app.
//
// 🔴 A CANVAS ROW OPENS THE CANVAS, THE SAME AS ON THE WEB. This was the one deliberate hold when
// this file was written: the phone had no reader for `learning_canvases.document`, so a tap that
// navigated nowhere would have been the dead-lane shape `learn.tsx`'s header names — "It rendered,
// it hovered, it accepted the click, and nothing happened." The hold is over. `api/canvases.ts`
// loadCanvas reads the document, `components/canvas/CanvasDocument.tsx` renders it, and
// `app/(tabs)/learn.tsx` takes the id as `?c=` — so the tap routes to `/learn?c=<id>` exactly as
// the web routes its row (owner 2026-08-20: "users should be able to use the library to access
// older canvases"). The actions kept their own doors: the drawn "…" and the long-press, per §38.3
// above. Tapping a FOLDER row is still a scope change and behaves like one.
//
// 🔴 WHAT IS STILL MISSING, SO NOBODY READS THE LOOP AS CLOSED: `api/canvases.ts` is SELECT-ONLY.
// A turn asked on the phone's canvas surface is never written back to `learning_canvases.document`,
// so the phone can OPEN a canvas made on the web but cannot yet ADD one to this list. Reading and
// writing are separate pieces of work and only the reading half exists.
//
// 🔴 COPY IS FIELD-AGNOSTIC BY RULE (CLAUDE.md): "Folder name", "Untitled canvas", "Unfiled".
// A student of law and a student of mechanical engineering read the same words here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { DragChip } from "@/components/DragChip";
import { EmptyBlock } from "@/components/mission-ui";
import { MiniMenu, type MenuAnchor } from "@/components/MiniMenu";
import { RootDropZone } from "@/components/RootDropZone";
import { FolderPickerSheet, TextPromptSheet, type RowAction } from "@/components/RowActionSheets";
import { Skeleton } from "@/components/Skeleton";
import { SlideUpSheet } from "@/components/StudySheet";
import { ChevronIcon, CloseIcon, FolderIcon, SearchIcon, type IconProps } from "@/components/icons";
import { useRowDrag } from "@/components/useRowDrag";
import {
  cacheCanvases,
  deleteCanvas,
  deleteFolder,
  createFolder,
  listFolders,
  loadCachedCanvases,
  renameCanvas,
  renameFolder,
  searchCanvases,
  setCanvasFolder,
  setCanvasPinned,
  setFolderParent,
  type CanvasFolder,
  type CanvasRow,
  type CanvasSort,
} from "@/api/canvases";
import {
  canCreateFolderIn,
  canReparentFolder,
  canvasName,
  createdOn,
  crumbTrail,
  effectiveScope,
  foldersAtLevel,
  lastOpened,
  type Scope,
} from "./canvas-rows";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

/** How tall a row is, and the height the placeholders must therefore be. The skeleton is drawn on
 *  the REAL grid at the REAL row height (the web does the same) — placeholders that are a
 *  different size are a second layout the reader has to re-parse when the rows arrive. */
const ROW_HEIGHT = 64;
/** Eight, because that is roughly a screenful and because the web uses eight. */
const SKELETON_ROWS = 8;

/**
 * The three orderings, one per thing worth ordering by, ONE DIRECTION EACH.
 *
 * 🔴 SEVEN OPTIONS BECAME THREE, AND "My order" IS GONE FOR A CONCRETE REASON. The notes tree
 * offered A–Z, Z–A, Modified old→new, Modified new→old, Created old→new, Created new→old and
 * "My order". Manual order was real there because `readable_library_documents` carries a
 * `position` column that a drag writes to. `learning_canvases` HAS NO SUCH COLUMN, so a "My
 * order" row here would be a sort with nothing behind it — the surface would accept the choice
 * and quietly hand back the default.
 *
 * 🔴 AND ONE DIRECTION EACH, DELIBERATELY, carried from the web. For each of these there is
 * exactly one order anyone means: names run A→Z, dates run newest first. A toggle doubles the
 * states to explain and puts "oldest first" one mis-tap away from a student looking for what they
 * touched this morning.
 */
const SORT_OPTIONS: readonly { key: CanvasSort; label: string }[] = [
  { key: "recent", label: "Last opened" },
  { key: "name", label: "Name" },
  { key: "created", label: "Created" },
];

/** The drag key for the "out of every folder" zone. `RootDropZone` IS the phone's version of the
 *  web's "All canvases" chip: on the web, dropping a canvas onto that chip unfiles it; here,
 *  letting go anywhere that is not a folder row does the same. */
const ROOT_KEY = "root:";

type ListRow =
  | { kind: "folder"; folder: CanvasFolder }
  | { kind: "canvas"; canvas: CanvasRow };

/** What the row menu is currently open against. */
type RowTarget =
  | { kind: "folder"; folder: CanvasFolder }
  | { kind: "canvas"; canvas: CanvasRow };

export function CanvasManagerBody({
  paddingTop = 0,
  paddingBottom = 0,
  searchOpen,
  onCloseSearch,
  sortOpen,
  onCloseSort,
  newFolderOpen,
  onCloseNewFolder,
  testID,
}: {
  paddingTop?: number;
  paddingBottom?: number;
  /** Chrome state, owned by the frame's "…" — see the file header for why the split runs here. */
  searchOpen: boolean;
  onCloseSearch: () => void;
  sortOpen: boolean;
  onCloseSort: () => void;
  newFolderOpen: boolean;
  onCloseNewFolder: () => void;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [folders, setFolders] = useState<CanvasFolder[]>([]);
  const [rows, setRows] = useState<CanvasRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [scope, setScope] = useState<Scope>(undefined);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CanvasSort>("recent");
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Has a list for the CURRENT scope ever arrived?
   *
   * 🔴 THIS EXISTS SO THE SKELETON DOES NOT STROBE, and it is the whole reason the placeholders
   * are not simply wired to `loading`. `loading` flips true on every fetch — which is every
   * keystroke in the search field and every change of sort. Placeholders on a keystroke would
   * replace the list the student is reading, four times a second, with grey bars. So placeholders
   * appear only where there is nothing on screen worth keeping: the first paint, and opening a
   * folder, which is a genuinely different list.
   */
  const [settled, setSettled] = useState(false);
  /** A write that did not land, or a read that could not be reached. Stated, never swallowed. */
  const [failure, setFailure] = useState<string | null>(null);
  /** True once a page-0 read has failed and the list on screen is the cached slice (or nothing). */
  const [stale, setStale] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [rowTarget, setRowTarget] = useState<RowTarget | null>(null);
  const [renaming, setRenaming] = useState<RowTarget | null>(null);
  const [moving, setMoving] = useState<CanvasRow | null>(null);
  const [busy, setBusy] = useState(false);

  // 🔴 A SEARCH IGNORES THE CURRENT FOLDER, ON PURPOSE. The failure this surface exists to fix is
  // "I can see my canvas in my account and the box says nothing matched". Scoping a search to
  // wherever the student happens to be standing rebuilds that failure with a nicer cause.
  const searching = search.trim().length > 0;
  const queryScope = effectiveScope(scope, search);

  /** Only ONE combination has a meaningful whole-list cache — see `api/canvases.ts`. */
  const isDefaultView = scope === undefined && sort === "recent" && !searching;

  // A fetch that started before the query changed must not overwrite the newer one's rows. The
  // token is a ref rather than state because the check happens inside the async continuation,
  // which closed over whatever the value was when it started.
  const token = useRef(0);

  const runQuery = useCallback(
    async (wanted: number, mode: "replace" | "append") => {
      if (!uid) return;
      const mine = ++token.current;
      if (mode === "append") setAppending(true);
      else setLoading(true);
      try {
        const [dirs, result] = await Promise.all([
          listFolders(uid),
          searchCanvases(uid, { folderId: queryScope, page: wanted, search, sort }),
        ]);
        if (mine !== token.current) return;
        setFolders(dirs);
        setTotal(result.total);
        setMore(result.more);
        setPage(result.page);
        setStale(false);
        setRows((current) => {
          if (mode === "replace") return result.rows;
          // Appending can double a row if something was written between pages; the id wins.
          const seen = new Set(current.map((row) => row.id));
          return [...current, ...result.rows.filter((row) => !seen.has(row.id))];
        });
        if (mode === "replace" && wanted === 0 && scope === undefined && sort === "recent" && !searching) {
          void cacheCanvases(uid, { folders: dirs, rows: result.rows, total: result.total });
        }
      } catch (err) {
        if (mine !== token.current) return;
        // 🔴 A LIST THAT COULD NOT BE FETCHED MUST NOT RENDER AS AN EMPTY ACCOUNT. The classic
        // notes tree could always fall back on a full disk snapshot; a paged, searched, sorted
        // query has no equivalent, so the only honest thing left is to say so. See `stale`.
        setStale(true);
        setFailure(err instanceof Error ? err.message : "Couldn't reach your canvases.");
      } finally {
        if (mine === token.current) {
          setLoading(false);
          setAppending(false);
          setSettled(true);
        }
      }
    },
    [queryScope, search, searching, scope, sort, uid],
  );

  // Declared BEFORE the effect that loads, so a scope change clears the flag in the same commit
  // the new fetch starts in — otherwise the previous folder's rows stay on screen for one frame
  // pretending to be the new folder's.
  useEffect(() => {
    setSettled(false);
  }, [scope]);

  // Any change to what is being asked for starts at the first page — otherwise typing a search
  // while three pages deep returns nothing and reads as "no results".
  useEffect(() => {
    void runQuery(0, "replace");
  }, [runQuery]);

  /**
   * The instant paint, and the only cached slice there is.
   *
   * 🔴 CACHE PAGE 0 OF THE DEFAULT SCOPE AND SORT, PLUS THE FOLDERS. NOTHING ELSE. The classic
   * Library rendered a full disk snapshot immediately, offline included, because "every
   * non-deleted note" is a complete answer. A paged, searched, sorted query is not: a cache of
   * page 2 of a name-sorted search answers a question nobody asks twice, and serving it later
   * would show rows that no longer match what is on screen. So this is deliberately a smaller
   * promise than the surface it replaces, and the failure line above is the rest of the promise.
   */
  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      let alive = true;
      if (isDefaultView && rows.length === 0) {
        void loadCachedCanvases(uid).then((cached) => {
          if (!alive || !cached.hit) return;
          // Only if the live read has not already landed — a cache must never overwrite fresher
          // rows just because the disk answered second.
          setRows((current) => (current.length ? current : cached.rows));
          setFolders((current) => (current.length ? current : cached.folders));
          setTotal((current) => current || cached.total);
          setSettled(true);
        });
      }
      return () => {
        alive = false;
      };
      // `rows.length` is read but deliberately not a dependency: this runs on focus, not on every
      // row change, and re-running it when the list grows would be a disk read per page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, isDefaultView]),
  );

  const reload = useCallback(async () => {
    setFailure(null);
    await runQuery(0, "replace");
  }, [runQuery]);

  /**
   * A filing write, followed by a read-back that checks it actually landed.
   *
   * 🔴 THIS IS NOT DEFENSIVENESS FOR ITS OWN SAKE. `pinned_at`, `folder_id` and `deleted` had
   * NEVER been written in production — measured on the web on 2026-08-13, zero rows for all
   * three — and the phone has written them exactly zero times more. Every move, pin and delete
   * issued from this screen is a first-in-production write, not a well-trodden path. The list
   * re-reads from the database anyway, so the surface can compare what it asked for against what
   * came back and SAY so instead of leaving the student watching a row that did not move.
   */
  const fileAndVerify = useCallback(
    async (id: string, work: Promise<unknown>, landed: (row: CanvasRow) => boolean, subject: "canvas" | "folder") => {
      setFailure(null);
      setBusy(true);
      try {
        await work;
      } catch (err) {
        setFailure(err instanceof Error ? err.message : "That did not save.");
        setBusy(false);
        return;
      }
      setBusy(false);
      const uidNow = uid;
      if (!uidNow) return;
      try {
        const result = await searchCanvases(uidNow, { folderId: queryScope, page: 0, search, sort });
        setRows(result.rows);
        setTotal(result.total);
        setMore(result.more);
        setPage(0);
        setFolders(await listFolders(uidNow));
        const row = result.rows.find((entry) => entry.id === id);
        // Gone from this view means it moved out of the folder being browsed — that absence IS
        // the confirmation, so only a row still present and still unchanged is a failure.
        if (row && !landed(row)) {
          setFailure(
            subject === "canvas"
              ? "That did not save. Nothing was lost — the canvas is still exactly where it was."
              : "That did not save. Nothing was lost — the folder is still where it was.",
          );
        }
      } catch {
        setFailure("That may not have saved — your canvases could not be re-read just now.");
      }
    },
    [queryScope, search, sort, uid],
  );

  // --- scope ---------------------------------------------------------------------------------

  /**
   * 🔴 NAVIGATION IS BY SCOPE NOW, NOT BY A TREE, AND THAT IS A REAL BEHAVIOUR CHANGE FOR THE
   * STUDENT. The notes tree rendered every folder level at once and collapsed each independently,
   * remembered mount-scoped (`collapsedOverride`, owner 2026-07-20). That reasoning is about a
   * DIFFERENT surface and travelled intact to `ClassicLibraryBody.tsx`; it is not deleted, it is
   * simply not about this one. The canvas manager shows ONE level and you tap into a folder, which
   * is what the web does and what the two-level cap makes sensible: there is never more than one
   * level below you.
   */
  const openScope = useCallback(
    (next: Scope) => {
      setSearch("");
      onCloseSearch();
      setScope(next);
      setPage(0);
    },
    [onCloseSearch],
  );

  const trail = useMemo(() => crumbTrail(scope, folders), [folders, scope]);
  const currentFolder = trail.length ? trail[trail.length - 1] : null;
  const visibleFolders = useMemo(
    () => foldersAtLevel(scope, folders, searching),
    [folders, scope, searching],
  );

  /** 🔴 `null` IS UNFILED AND `undefined` IS EVERYTHING — two absences with two meanings. The web
   *  removed the "Unfiled" TAB (owner 2026-08-15) and kept the SCOPE, which is exactly what
   *  happens here: there is no Unfiled control, "Move to Unfiled" is still in the row menu, and
   *  the root drop zone still performs the unfile write. */
  const listData: ListRow[] = useMemo(
    () => [
      ...visibleFolders.map((folder): ListRow => ({ folder, kind: "folder" })),
      ...rows.map((canvas): ListRow => ({ canvas, kind: "canvas" })),
    ],
    [rows, visibleFolders],
  );

  // --- actions -------------------------------------------------------------------------------

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    setRowTarget(null);
  }, []);

  const confirmDeleteCanvas = useCallback(
    (canvas: CanvasRow) => {
      // 🔴 `Alert.alert` FOR THE TWO DESTRUCTIVE CONFIRMS — the phone's established convention for
      // "this one is serious" (see `app/note.tsx`'s delete). The web builds a modal because a
      // browser's own `confirm()` is unstyleable and sometimes disabled outright; a native alert
      // has neither problem and is the shape a student already trusts on this device.
      Alert.alert(
        `Delete “${canvasName(canvas.title)}”?`,
        // What actually survives, said plainly: `learner_evidence.canvas_id` is
        // `on delete set null`, so a deleted canvas takes none of the student's work with it.
        "It leaves your library. What you have already worked through on it is kept.",
        [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              if (!uid) return;
              setFailure(null);
              void deleteCanvas(uid, canvas.id)
                .then(() => reload())
                .catch((err: unknown) =>
                  setFailure(err instanceof Error ? err.message : "That canvas was not deleted."),
                );
            },
            style: "destructive",
            text: "Delete canvas",
          },
        ],
      );
    },
    [reload, uid],
  );

  const confirmDeleteFolder = useCallback(
    (folder: CanvasFolder) => {
      const hasChildren = folders.some((entry) => entry.parentId === folder.id);
      Alert.alert(
        `Delete “${folder.name}”?`,
        // 🔴 BOTH EFFECTS, NAMED. The database returns canvases to Unfiled on its own
        // (`learning_canvases.folder_id … on delete set null`), but `folders.parent_id` is
        // `on delete cascade`, so subfolders go with it — and no constraint will ever tell the
        // student that.
        hasChildren
          ? "The folders inside it are deleted too. No canvas is deleted — everything in them moves back to Unfiled."
          : "No canvas is deleted. Everything in this folder moves back to Unfiled.",
        [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              if (!uid) return;
              setFailure(null);
              if (scope === folder.id || currentFolder?.parentId === folder.id) setScope(undefined);
              void deleteFolder(uid, folder.id)
                .then(() => reload())
                .catch((err: unknown) =>
                  setFailure(err instanceof Error ? err.message : "That folder was not deleted."),
                );
            },
            style: "destructive",
            text: "Delete folder",
          },
        ],
      );
    },
    [currentFolder, folders, reload, scope, uid],
  );

  /** The menu a row opens — from the drawn "…", from a long press, and from a tap on a canvas.
   *  All three raise the SAME menu, so no action can be reachable one way and not another. */
  const menuActions: RowAction[] = useMemo(() => {
    if (!rowTarget || !uid) return [];
    if (rowTarget.kind === "folder") {
      const folder = rowTarget.folder;
      return [
        { key: "rename", label: "Rename", onPress: () => { closeMenu(); setRenaming(rowTarget); } },
        {
          destructive: true,
          key: "delete",
          label: "Delete folder",
          onPress: () => { closeMenu(); confirmDeleteFolder(folder); },
        },
      ];
    }
    const canvas = rowTarget.canvas;
    const pinned = Boolean(canvas.pinnedAt);
    return [
      { key: "rename", label: "Rename", onPress: () => { closeMenu(); setRenaming(rowTarget); } },
      {
        key: "pin",
        label: pinned ? "Unpin" : "Pin",
        onPress: () => {
          closeMenu();
          void fileAndVerify(
            canvas.id,
            setCanvasPinned(uid, canvas.id, !pinned),
            (row) => Boolean(row.pinnedAt) !== pinned,
            "canvas",
          );
        },
      },
      // Only when it is filed — "Move to Unfiled" on a canvas that is already unfiled is a control
      // that names an action with no effect.
      ...(canvas.folderId
        ? [
            {
              key: "unfile",
              label: "Move to Unfiled",
              onPress: () => {
                closeMenu();
                void fileAndVerify(
                  canvas.id,
                  setCanvasFolder(uid, canvas.id, null),
                  (row) => row.folderId === null,
                  "canvas",
                );
              },
            } satisfies RowAction,
          ]
        : []),
      // 🔴 ONE "Move to…" ROW, NOT ONE PER FOLDER. The web lists every folder inside the kebab,
      // which is a menu that grows with the folder count and makes the common case the slowest.
      // `FolderPickerSheet` is the phone's existing, better shape for exactly this question.
      { key: "move", label: "Move to…", onPress: () => { closeMenu(); setMoving(canvas); } },
      {
        destructive: true,
        key: "delete",
        label: "Delete canvas",
        onPress: () => { closeMenu(); confirmDeleteCanvas(canvas); },
      },
    ];
  }, [closeMenu, confirmDeleteCanvas, confirmDeleteFolder, fileAndVerify, rowTarget, uid]);

  const openRowMenu = useCallback(
    (key: string, x: number, y: number) => {
      const id = key.slice(key.indexOf(":") + 1);
      if (key.startsWith("folder:")) {
        const folder = folders.find((entry) => entry.id === id);
        if (!folder) return;
        setRowTarget({ folder, kind: "folder" });
      } else {
        const canvas = rows.find((entry) => entry.id === id);
        if (!canvas) return;
        setRowTarget({ canvas, kind: "canvas" });
      }
      setMenuAnchor({ x, y });
    },
    [folders, rows],
  );

  // --- drag ----------------------------------------------------------------------------------

  const onRowDrop = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (!uid) return;
      const sourceId = sourceKey.slice(sourceKey.indexOf(":") + 1);
      // `root:` carries an empty id, which is the phone's "out of every folder" — the same write
      // the web performs when a canvas is dropped on its "All canvases" chip.
      const targetId = targetKey === ROOT_KEY ? null : targetKey.slice(targetKey.indexOf(":") + 1);
      if (sourceKey.startsWith("canvas:")) {
        void fileAndVerify(
          sourceId,
          setCanvasFolder(uid, sourceId, targetId),
          (row) => row.folderId === targetId,
          "canvas",
        );
        return;
      }
      if (!canReparentFolder(sourceId, targetId, folders)) {
        // 🔴 THE REFUSAL IS STATED, NOT SWALLOWED — and it is a DEPTH rule, not a cycle check. See
        // `canReparentFolder`: `folders_depth_guard` makes a cycle impossible, so what is actually
        // being prevented here is a move the trigger would reject with a raise the student would
        // never see.
        setFailure("Folders nest two levels deep. That move would put a folder three levels down.");
        return;
      }
      setFailure(null);
      setBusy(true);
      void setFolderParent(uid, sourceId, targetId)
        .then(() => reload())
        .catch((err: unknown) =>
          setFailure(
            err instanceof Error
              ? err.message
              : "That did not save. Nothing was lost — the folder is still where it was.",
          ),
        )
        .finally(() => setBusy(false));
    },
    [fileAndVerify, folders, reload, uid],
  );

  const rowDrag = useRowDrag({ onDrop: onRowDrop, onHold: openRowMenu });

  // --- rename / move / new folder ------------------------------------------------------------

  const commitRename = useCallback(
    (value: string) => {
      const target = renaming;
      if (!target || !uid) return;
      setRenaming(null);
      setFailure(null);
      setBusy(true);
      // 🔴 READ BACK, FOR THE SAME REASON MOVE AND PIN DO. Both rename calls return the name that
      // was actually STORED (trimmed, and capped at the column's own check constraint), so the
      // list shows what the database holds rather than the raw text the student typed.
      const work =
        target.kind === "canvas"
          ? renameCanvas(uid, target.canvas.id, value)
          : renameFolder(uid, target.folder.id, value);
      void work
        .then(() => reload())
        .catch((err: unknown) =>
          setFailure(
            err instanceof Error
              ? err.message
              : "That name did not save. Nothing was lost — the old name is still in place.",
          ),
        )
        .finally(() => setBusy(false));
    },
    [reload, renaming, uid],
  );

  /**
   * The destination list, and the one place the reused picker needed adapting.
   *
   * 🔴 `FolderPickerSheet` IS PATH-KEYED AND CANVAS FOLDERS ARE ID-KEYED. The picker was written
   * for the notes tree and the Study deck tree, where a folder IS its path; here a folder is a row
   * with an id and a name, and two folders may legitimately share a name. So the options are built
   * as "Parent::Child" name paths, a duplicate gets a visible " (2)" so the student can still tell
   * two identically-named folders apart, and the path maps back to the real id here. Renaming
   * nothing and disambiguating only in the picker is the honest version: the folder itself is
   * untouched.
   */
  const folderOptions = useMemo(() => {
    const byPath = new Map<string, string>();
    const paths: string[] = [];
    const nameOf = (folder: CanvasFolder) => {
      const parent = folder.parentId ? folders.find((entry) => entry.id === folder.parentId) : null;
      return parent ? `${parent.name}::${folder.name}` : folder.name;
    };
    for (const folder of [...folders].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
      let path = nameOf(folder);
      let n = 2;
      while (byPath.has(path)) path = `${nameOf(folder)} (${n++})`;
      byPath.set(path, folder.id);
      paths.push(path);
    }
    return { byPath, paths };
  }, [folders]);

  const currentFolderPath = useMemo(() => {
    if (!moving?.folderId) return "";
    for (const [path, id] of folderOptions.byPath) if (id === moving.folderId) return path;
    return "";
  }, [folderOptions, moving]);

  const onMovePick = useCallback(
    (path: string) => {
      const canvas = moving;
      setMoving(null);
      if (!canvas || !uid) return;
      // "" is the picker's root row, labelled "Unfiled" — the same write the root drop zone does.
      const destination = path ? (folderOptions.byPath.get(path) ?? null) : null;
      void fileAndVerify(
        canvas.id,
        setCanvasFolder(uid, canvas.id, destination),
        (row) => row.folderId === destination,
        "canvas",
      );
    },
    [fileAndVerify, folderOptions, moving, uid],
  );

  /** 🔴 THE WEB FAILS SILENTLY HERE AND THE PORT MUST NOT. Creating a folder inside a level-2
   *  folder trips `folders_depth_guard`; the web returns null with a console warning and the
   *  manager reloads and shows nothing — a drawn, enabled button that does nothing at all. */
  const canCreateHere = canCreateFolderIn(currentFolder?.id ?? null, folders);
  useEffect(() => {
    if (newFolderOpen && !canCreateHere) {
      setFailure("Folders nest two levels deep, so this one cannot hold another. Go up a level to make one.");
      onCloseNewFolder();
    }
  }, [canCreateHere, newFolderOpen, onCloseNewFolder]);

  const commitNewFolder = useCallback(
    (value: string) => {
      onCloseNewFolder();
      if (!uid) return;
      setFailure(null);
      setBusy(true);
      // Created INSIDE the folder currently open, which is what "New folder" means while you are
      // standing in one.
      void createFolder(uid, value, currentFolder?.id ?? null)
        .then(() => reload())
        .catch((err: unknown) =>
          setFailure(err instanceof Error ? err.message : "That folder was not created."),
        )
        .finally(() => setBusy(false));
    },
    [currentFolder, onCloseNewFolder, reload, uid],
  );

  // --- render --------------------------------------------------------------------------------

  const showSkeleton = loading && !settled;
  const empty = !showSkeleton && listData.length === 0;

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === "folder") {
        const folder = item.folder;
        const key = `folder:${folder.id}`;
        return (
          <GestureDetector
            gesture={rowDrag.gestureFor(key, {
              canDropOn: (targetKey) => {
                if (targetKey === ROOT_KEY) return folder.parentId !== null;
                const targetId = targetKey.slice(targetKey.indexOf(":") + 1);
                return targetKey.startsWith("folder:") && canReparentFolder(folder.id, targetId, folders);
              },
              draggable: true,
            })}
          >
            <Pressable
              // A folder is BOTH ends of a drag: it can be picked up and dropped into.
              ref={rowDrag.registerRow(key, true)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                rowDrag.overKey === key && styles.rowDropTarget,
                rowDrag.activeKey === key && styles.rowDragging,
              ]}
              onPress={() => openScope(folder.id)}
              accessibilityRole="button"
              accessibilityLabel={`${folder.name} folder`}
              testID={`canvas-folder-${folder.id}`}
            >
              <RowTile>
                <FolderIcon size={18} color={c.text2} strokeWidth={1.9} />
              </RowTile>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>{folder.name}</Text>
                {/* 🔴 A FOLDER HAS NO "LAST OPENED" AND THIS LINE NEVER GUESSES ONE. Nothing
                    records opening a folder, and `folders.updated_at` means "renamed or moved" —
                    a date here would answer a different question in the same shape as the real
                    answer. The web prints an em dash because it has a column to leave empty; a
                    phone row has no column, so it prints the one date a folder honestly has. */}
                <Text style={styles.rowMeta} numberOfLines={1}>Created {createdOn(folder.createdAt)}</Text>
              </View>
              <ChevronIcon size={16} color={c.text3} strokeWidth={2.2} />
              <RowDots onPress={(x, y) => openRowMenu(key, x, y)} label={`Actions for ${folder.name}`} />
            </Pressable>
          </GestureDetector>
        );
      }

      const canvas = item.canvas;
      const key = `canvas:${canvas.id}`;
      const name = canvasName(canvas.title);
      return (
        <GestureDetector
          gesture={rowDrag.gestureFor(key, {
            // A canvas is a drag SOURCE only — there is nothing to drop into a canvas.
            canDropOn: (targetKey) =>
              targetKey === ROOT_KEY
                ? canvas.folderId !== null
                : targetKey.startsWith("folder:") &&
                  targetKey.slice(targetKey.indexOf(":") + 1) !== canvas.folderId,
            draggable: true,
          })}
        >
          <Pressable
            ref={rowDrag.registerRow(key, false)}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
              rowDrag.activeKey === key && styles.rowDragging,
            ]}
            // 🔴 A TAP OPENS THE CANVAS. This row used to open the actions menu instead, because
            // when it was written there was no mobile reader for `learning_canvases.document` and
            // a tap that navigated nowhere would have been a dead lane. There is a reader now —
            // `api/canvases.ts` loadCanvas, rendered by `components/canvas/CanvasDocument.tsx` —
            // and `(tabs)/learn.tsx` takes the canvas id as `?c=`, so the tap does the obvious
            // thing (owner 2026-08-20: "users should be able to use the library to access older
            // canvases"). The actions did not lose their door: every row still draws its own
            // `RowDots` and still answers a long-press, which is the §38.3 rule — a touch screen
            // has no hover, so the control has to be visible as well as held.
            onPress={() => router.push(`/learn?c=${encodeURIComponent(canvas.id)}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, canvas. Opens the canvas.`}
            testID={`canvas-row-${canvas.id}`}
          >
            <RowTile>
              {/* 🔴 A PANELLED WORKSPACE GLYPH, NOT A PLAIN SQUARE. A canvas row had no glyph at
                  all on the web, so a folder was marked and a canvas was bare; a plain square was
                  the first fix and read as an empty checkbox, inviting a selection this surface
                  does not have. Nothing here is derived from the canvas's CONTENTS. */}
              <CanvasGlyph size={18} color={c.text2} />
            </RowTile>
            <View style={styles.rowText}>
              <View style={styles.titleLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
                {/* The student's own mark, kept — the one honest per-canvas distinction there is. */}
                {canvas.pinnedAt ? <PinGlyph size={12} color={c.text3} /> : null}
              </View>
              {/* ONE secondary line, showing the thing you sorted by — see the file header. */}
              <Text style={styles.rowMeta} numberOfLines={1}>
                {sort === "created" ? `Created ${createdOn(canvas.createdAt)}` : lastOpened(canvas.updatedAt)}
              </Text>
            </View>
            <RowDots onPress={(x, y) => openRowMenu(key, x, y)} label={`Actions for ${name}`} />
          </Pressable>
        </GestureDetector>
      );
    },
    [c, folders, openRowMenu, openScope, rowDrag, sort, styles],
  );

  return (
    <View style={styles.root} testID={testID}>
      <View style={[styles.band, { paddingTop: paddingTop + space(2) }]}>
        {searchOpen ? (
          <View style={styles.searchRow}>
            <SearchIcon size={17} color={c.text3} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search canvases"
              placeholderTextColor={c.textHint}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search canvases"
              testID="canvas-search-input"
            />
            <Pressable
              onPress={() => {
                setSearch("");
                onCloseSearch();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close search"
              testID="canvas-search-close"
            >
              <CloseIcon size={16} color={c.text2} />
            </Pressable>
          </View>
        ) : null}

        {/* ---------------------------------------------------------------- where am I
            🔴 THE BREADCRUMB IS ALSO THE BACK-UP CONTROL, and on the web that was the least
            visible function on the surface — "a bare word in the breadcrumb's own grey, changing
            colour only on hover, which is nothing at all on a touch screen". Here every segment
            above the current one is a real, drawn, tappable row. At most three segments, because
            the database caps the depth at two. */}
        <View style={styles.crumbs}>
          {searching ? (
            <Text style={styles.crumbHere}>Searching every canvas</Text>
          ) : (
            <>
              <Pressable
                onPress={() => openScope(undefined)}
                disabled={scope === undefined}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="All canvases"
                testID="canvas-crumb-all"
              >
                <Text style={scope === undefined ? styles.crumbHere : styles.crumbLink}>All canvases</Text>
              </Pressable>
              {trail.map((folder, i) => {
                const here = i === trail.length - 1;
                return (
                  <View key={folder.id} style={styles.crumbSeg}>
                    <Text style={styles.crumbSlash}>/</Text>
                    <Pressable
                      onPress={() => openScope(folder.id)}
                      disabled={here}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={here ? folder.name : `Back to ${folder.name}`}
                      testID={`canvas-crumb-${folder.id}`}
                    >
                      <Text style={here ? styles.crumbHere : styles.crumbLink} numberOfLines={1}>
                        {folder.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* 🔴 A REFUSED WRITE IS STATED, NEVER SWALLOWED. Without this the student files a canvas,
            watches it stay put, and is told nothing. */}
        {failure ? (
          <Pressable style={styles.failure} onPress={() => setFailure(null)} testID="canvas-failure">
            <Text style={styles.failureText}>{failure}</Text>
          </Pressable>
        ) : null}
        {stale && !failure ? (
          <View style={styles.failure} testID="canvas-stale">
            <Text style={styles.failureText}>
              {isDefaultView
                ? "Showing the last canvases this phone saw. Pull down to try again."
                : "This view needs a connection. Pull down to try again."}
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={showSkeleton ? [] : listData}
        keyExtractor={(item) => (item.kind === "folder" ? `folder:${item.folder.id}` : `canvas:${item.canvas.id}`)}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listBody, { paddingBottom: paddingBottom + space(8) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.text2}
            onRefresh={() => {
              setRefreshing(true);
              void reload().finally(() => setRefreshing(false));
            }}
          />
        }
        // 🔴 APPEND ON SCROLL, WHERE THE WEB REPLACES THE PAGE. The web's footer reads
        // "Showing 1–60 of 340" and "Show more" fetches the NEXT page instead of adding to this
        // one, because on a desktop table that is a pager. A phone list is SCROLLED, not paged, and
        // a list that swapped its contents out from under a thumb mid-flick would lose the
        // student's place. So pages accumulate — and the footer changes wording to match, because
        // a range would then describe a list that is not on screen.
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!more || loading || appending || showSkeleton) return;
          void runQuery(page + 1, "append");
        }}
        ListHeaderComponent={
          showSkeleton ? (
            // Placeholders on the REAL grid at the REAL row height — see ROW_HEIGHT.
            <View testID="canvas-skeleton">
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <View key={i} style={styles.row}>
                  <Skeleton width={32} height={32} radius={radius.md} />
                  <View style={styles.rowText}>
                    <Skeleton width={i % 3 === 0 ? "52%" : "72%"} height={15} />
                    <Skeleton width="28%" height={11} style={{ marginTop: space(2) }} />
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          empty ? (
            <View style={styles.emptyWrap} testID="canvas-empty">
              {/* One line, inside the list — the web's exact copy, and field-agnostic by rule. */}
              <EmptyBlock
                title={searching ? `Nothing matches “${search.trim()}”.` : "Nothing here yet."}
                body={
                  searching
                    ? undefined
                    : scope === undefined
                      ? "Canvases you start on the web show up here."
                      : undefined
                }
              />
            </View>
          ) : null
        }
        ListFooterComponent={
          // 🔴 THE LIST SAYS HOW MUCH OF ITSELF IT IS SHOWING. A truncated list that does not
          // disclose its truncation is the defect this surface was built to remove.
          !showSkeleton && total > rows.length ? (
            <View style={styles.footer} testID="canvas-footer">
              <Text style={styles.footerText}>
                Showing {rows.length} of {total}
              </Text>
              {appending ? <ActivityIndicator color={c.text3} /> : null}
            </View>
          ) : null
        }
      />

      {/* Root zone = Unfiled. This IS the phone's "All canvases" drop chip: on the web, dropping a
          canvas onto that chip takes it out of every folder; here, letting go anywhere that is not
          a folder row does the same write. Registered as a FALLBACK target because the zone spans
          the whole list and therefore contains every folder row — see useRowDrag. */}
      <RootDropZone
        ref={rowDrag.registerRow(ROOT_KEY, true, true)}
        active={rowDrag.activeKey !== null}
        over={rowDrag.overKey === ROOT_KEY}
        top={0}
        bottom={paddingBottom}
      />

      <DragChip
        visible={rowDrag.activeKey !== null}
        label={dragLabel(rowDrag.activeKey, rows, folders)}
        fingerX={rowDrag.fingerX}
        fingerY={rowDrag.fingerY}
      />

      <MiniMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={closeMenu}
        testID="canvas-row-menu"
      />

      <TextPromptSheet
        visible={renaming !== null}
        title={renaming?.kind === "folder" ? "Rename folder" : "Rename canvas"}
        placeholder={renaming?.kind === "folder" ? "Folder name" : "Canvas name"}
        initialValue={
          renaming?.kind === "folder" ? renaming.folder.name : renaming ? canvasName(renaming.canvas.title) : ""
        }
        busy={busy}
        onConfirm={commitRename}
        onClose={() => setRenaming(null)}
        testID="canvas-rename-prompt"
      />

      <TextPromptSheet
        visible={newFolderOpen && canCreateHere}
        title={currentFolder ? `New folder in ${currentFolder.name}` : "New folder"}
        placeholder="Folder name"
        initialValue=""
        confirmLabel="Create"
        busy={busy}
        onConfirm={commitNewFolder}
        onClose={onCloseNewFolder}
        testID="canvas-new-folder-prompt"
      />

      <FolderPickerSheet
        visible={moving !== null}
        title="Move canvas to"
        folders={folderOptions.paths}
        currentFolder={currentFolderPath}
        // 🔴 "Unfiled", NOT "Top level". On this surface the root is not a place a canvas sits
        // above the folders — it is the absence of a folder, which the whole store spells
        // `folder_id is null`. Naming it anything else makes two words for one state.
        rootLabel="Unfiled"
        onPick={onMovePick}
        onClose={() => setMoving(null)}
        testID="canvas-move-picker"
      />

      <SlideUpSheet visible={sortOpen} onClose={onCloseSort} title="Sort" testID="canvas-sort-sheet">
        {SORT_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => {
              setSort(option.key);
              onCloseSort();
            }}
            style={({ pressed }) => [styles.sortRow, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === option.key }}
            testID={`canvas-sort-${option.key}`}
          >
            <Text style={[styles.sortLabel, sort === option.key && styles.sortLabelActive]}>{option.label}</Text>
            {sort === option.key ? <Text style={styles.sortCheck}>✓</Text> : null}
          </Pressable>
        ))}
      </SlideUpSheet>
    </View>
  );
}

/** What the floating chip says while a row is in flight. */
function dragLabel(activeKey: string | null, rows: CanvasRow[], folders: CanvasFolder[]): string {
  if (!activeKey) return "";
  const id = activeKey.slice(activeKey.indexOf(":") + 1);
  if (activeKey.startsWith("folder:")) return folders.find((entry) => entry.id === id)?.name ?? "";
  return canvasName(rows.find((entry) => entry.id === id)?.title);
}

/** The 32pt filled square every row leads with — the web's icon tile, at touch scale. */
function RowTile({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.tile}>{children}</View>;
}

/**
 * The per-row "…", DRAWN.
 *
 * 🔴 THIS IS THE §38.3 FIX AND IT MUST NOT BECOME HOVER-ONLY, OPACITY-ZERO, OR LONG-PRESS-ONLY.
 * It reports the touch point so the menu opens under the finger, exactly as a long press does —
 * one menu, two ways in, no action reachable only one of them.
 */
function RowDots({ onPress, label }: { onPress: (x: number, y: number) => void; label: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={(event) => onPress(event.nativeEvent.pageX, event.nativeEvent.pageY)}
      hitSlop={10}
      style={({ pressed }) => [styles.dots, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <DotsIcon size={18} color={c.text2} />
    </Pressable>
  );
}

// Inline glyphs the shared icon set (components/icons.tsx) does not carry — thin strokes and round
// caps to match its language. Local to this surface on purpose, the same way `note.tsx`,
// `notebook.tsx` and the classic Library each keep their own `DotsIcon`.

/** Horizontal "…" for the per-row actions button. */
function DotsIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

/** A panelled workspace — the phone's `PanelsTopLeft`. Says one thing and only one: this row is a
 *  canvas. Deliberately not a plain square (reads as an empty checkbox) and deliberately not
 *  anything derived from the canvas's contents. */
function CanvasGlyph({ size = 18, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.6" y="4.4" width="16.8" height="15.2" rx="2.4" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="9.8" y1="4.4" x2="9.8" y2="19.6" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="9.8" y1="11.4" x2="20.4" y2="11.4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The pin the student set themselves. */
function PinGlyph({ size = 12, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 3.6h6l-1 5 3 3.2H7l3-3.2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Line x1="12" y1="11.8" x2="12" y2="20.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    band: { paddingHorizontal: space(4), gap: space(2) },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      backgroundColor: c.raised,
      borderRadius: radius.pill,
      paddingHorizontal: space(3),
      height: 40,
    },
    searchInput: { flex: 1, ...type.small, color: c.text, paddingVertical: 0 },
    crumbs: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space(1) },
    crumbSeg: { flexDirection: "row", alignItems: "center", gap: space(1), flexShrink: 1 },
    crumbSlash: { ...type.micro, color: c.text3 },
    crumbLink: { ...type.micro, color: c.text2 },
    crumbHere: { ...type.micro, color: c.text, fontWeight: "600" },
    failure: {
      backgroundColor: c.warnFaint,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.warnLine,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
    },
    failureText: { ...type.micro, color: c.warn },
    listBody: { paddingHorizontal: space(2), paddingTop: space(2) },
    row: {
      minHeight: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      paddingHorizontal: space(2),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
      // Above the RootDropZone wash, which is a backdrop rather than a panel.
      zIndex: 1,
    },
    rowPressed: { opacity: 0.6 },
    rowDropTarget: { backgroundColor: c.accentFaint, borderRadius: radius.md },
    rowDragging: { opacity: 0.4 },
    tile: {
      width: 32,
      height: 32,
      borderRadius: radius.md,
      backgroundColor: c.raised,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
    rowTitle: { ...type.body, color: c.text, flexShrink: 1 },
    rowMeta: { ...type.micro, color: c.text3, marginTop: 2 },
    dots: { paddingHorizontal: space(1), paddingVertical: space(2) },
    emptyWrap: { paddingHorizontal: space(2), paddingTop: space(6) },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(2),
      paddingVertical: space(4),
    },
    footerText: { ...type.micro, color: c.text3 },
    sortRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
    },
    sortLabel: { ...type.body, color: c.text2 },
    sortLabelActive: { color: c.text, fontWeight: "600" },
    sortCheck: { ...type.body, color: c.accent },
  });
