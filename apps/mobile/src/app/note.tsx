import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { Skeleton } from "@/components/Skeleton";
import { CloseIcon, SearchIcon, type IconProps } from "@/components/icons";
import { NoteBlockEditor } from "@/components/NoteBlockEditor";
import { NoteListSheet, type NoteSheetRow } from "@/components/NoteListSheet";
import { MessageBody } from "@/components/MessageBody";
import { NotePillBar, NOTE_PILL_BAR_HEIGHT } from "@/components/NotePillBar";
import { NoteTabsSheet, type NoteTab } from "@/components/NoteTabsSheet";
import { StatusBarBlur } from "@/components/StatusBarBlur";
import { createNote, fetchNote, findCachedNote, loadCachedLibrary, updateNoteContent, type CloudLibraryNote } from "@/api/cloudLibrary";
import { fileKindOf } from "@/lib/library-row-meta";
import { outlineOf, splitSections } from "@/lib/note-outline";
import { arriveAt, closeTab, noteNavHolder, openTabIds, previewOf, selectTab } from "@/lib/note-tabs";
import { buildNoteResolver, isExternalUrl, preprocessWikilinks, resolveInternalHref } from "@/lib/wikilinks";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Note view + editor (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md
// §7): renders one note straight from your account's library, and — owner 2026-07-20
// ("work on the edit mode") — EDITS it too. Edit mode is the LIVE-PREVIEW block
// editor (components/NoteBlockEditor.tsx, owner 2026-07-21: web-editor parity —
// markdown syntax hidden unless the cursor reveals it, formatting pill above the
// keyboard); saves go to the same readable_library_documents row the web app writes
// (content column only — titles/paths stay web-owned, so a web-side rename can never
// be clobbered from here), debounced while typing and flushed on Done. updated_at is
// stamped by a DB trigger, so the saved row is selected back and becomes the local
// truth. PDF/Word rows stay read-only (their content is extracted text — editing it
// would silently diverge from the real file), as do Rename / Replace / Delete.
// The last-cached copy of this note (and the rest of the library, for wikilink
// resolution) renders instantly, then a fresh fetch refreshes its content, so an
// already-opened note keeps working offline.
// [[wikilinks]] are tappable: preprocessed into markdown links and resolved against every
// cached note (by title / basename / path). Tapping one SWAPS this page to the target
// note (router.setParams — owner 2026-07-20: links change the note page rather than
// stacking a new screen on top, so back always returns straight to the Library).
// Find IS wired (read-safe): while a query is present the body renders as plain text
// with every match highlighted, plus a live match count.

// The note's chrome (owner 2026-07-21, matching their Obsidian/Safari reference
// crops): a glass pill in the UPPER-RIGHT holds the read/edit mode toggle
// (pencil while reading — tap to edit; book while editing — tap to save and
// read, Obsidian's exact language) plus the "…" menu; a floating pill bar sits
// CENTERED AT THE BOTTOM with browser-style controls — back/forward through
// the notes you've opened, search your notes, new note, an Obsidian-style TAB
// VIEWER (NoteTabsSheet + lib/note-tabs.ts, owner 2026-07-21), and a heading
// outline. The old lower-left corner button is gone; its menu
// moved into the top-right dots. Find is REAL; Rename / Replace / Delete still
// flash the "on the web app" note.
const MENU_ITEMS = [
  { key: "find", label: "Find", enabled: true },
  { key: "rename", label: "Rename", enabled: false },
  { key: "replace", label: "Replace", enabled: false },
  { key: "delete", label: "Delete", enabled: false },
] as const;

// The bottom pill bar's rendered height — the reading body's bottom spacer
// clears it so the last lines stay readable above the floating bar.
// Re-exported from the bar itself so growing the buttons (owner 2026-07-22)
// can't leave this spacer short and clip the note's last lines behind it.
const PILL_BAR_HEIGHT = NOTE_PILL_BAR_HEIGHT;

const EDIT_ON_WEB = "That happens on the web app for now.";
const CANT_EDIT_KIND = "PDF and Word files can't be edited here — their text is extracted from the original file.";
const SAVE_FAILED = "Couldn't save — check your connection and try Done again.";

// Debounce for autosave-while-typing: long enough to batch a sentence, short
// enough that closing the app mid-thought almost never loses more than a beat.
const AUTOSAVE_MS = 1400;

// Loading skeleton (doc === undefined, below) — paragraph-line widths, varied so
// the placeholder doesn't read as a row of identical bars.
const NOTE_SKELETON_LINE_WIDTHS = ["94%", "88%", "70%", "92%", "60%", "84%", "76%"] as const;

/** Split `text` into ordered runs, flagging the ones that match `query` (case-
 * insensitive). Pure, so the highlighted body and the match count derive from the
 * exact same segmentation. */
function splitMatches(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out.push({ text: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), hit: false });
    out.push({ text: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return out;
}

export default function NoteScreen() {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { colors: c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = Array.isArray(params.id) ? params.id[0] : params.id;
  const insets = useSafeAreaInsets();
  const [doc, setDoc] = useState<CloudLibraryNote | null | undefined>(undefined);
  const [resolver, setResolver] = useState<Map<string, string>>(() => new Map());
  // Every cached note's id/title/path (+ a stripped preview snippet) — feeds
  // the pill bar's Search sheet and the tab viewer's cards. Refreshed from the
  // same cache read the resolver already does, so it costs no extra I/O.
  const [notesIndex, setNotesIndex] = useState<{ id: string; title: string; path: string; preview: string }[]>([]);
  // Transient "couldn't find that note" / "edit on the web app" line.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reading-mode chrome state.
  const [menuOpen, setMenuOpen] = useState(false);
  // Measured height of the floating chrome column, used as the body's top
  // inset — see the chrome View's own comment for why it's measured and not a
  // constant. 0 until the first layout, which is one frame with the title
  // under the blur and no jump after (the column is above the fold either way).
  const [chromeHeight, setChromeHeight] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  // Pill-bar state: which of its three sheets is up, the Search sheet's query,
  // and the one-at-a-time guard for "+" (new note).
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [searchSheetQuery, setSearchSheetQuery] = useState("");
  const [tabsOpen, setTabsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  // Browser-style note history (owner picked "browser-style" for the pill
  // bar), now held in lib/note-tabs.ts's MODULE-scoped noteNavHolder (owner
  // 2026-07-21: the numbered square opens a real tab viewer, so open tabs
  // survive leaving to the Library and back). ‹ › and tab switches move the
  // cursor via pendingIndex so the noteId effect below can tell a history
  // move from a fresh navigation; everything else pushes. This state mirrors
  // the holder for rendering: forward-arrow enablement + the open-tab ids.
  const [nav, setNav] = useState({ canForward: false, tabIds: [] as string[] });
  // Measured y of each rendered section (index-aligned with `sections` below) —
  // what makes the outline's "jump to heading" an exact scroll.
  const sectionYs = useRef<number[]>([]);
  // Edit-mode state. `draft` is only the document AS EDIT MODE OPENED — it
  // seeds NoteBlockEditor and deliberately never updates per keystroke (the
  // editor owns live block state; a per-keystroke prop change would reset
  // it). Refs shadow the LATEST text + dirtiness so the debounced autosave
  // and the unmount flush never read stale closures.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const draftRef = useRef("");
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "…" menu open/close animation (fade + small rise) — matches every other glass menu
  // in the app (owner 2026-07-18: menu-openers should animate).
  const menuProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(menuProgress, {
      toValue: menuOpen ? 1 : 0,
      duration: menuOpen ? 170 : 130,
      easing: menuOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuOpen, menuProgress]);

  useEffect(() => {
    let alive = true;
    setDoc(undefined);
    // A wikilink tap swaps this page's note in place (setParams) — reset the
    // per-note chrome so the new note starts clean: no stale Find query, no
    // half-scrolled body, no sheet left up, and (defensively — the pill bar and
    // links only exist in reading mode) no editor open against the wrong note.
    setFindOpen(false);
    setFindQuery("");
    setEditing(false);
    setSearchSheetOpen(false);
    setTabsOpen(false);
    setOutlineOpen(false);
    sectionYs.current = [];
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // History bookkeeping now lives in lib/note-tabs.ts (pure + tested):
    // a ‹ ›/tab-switch move (pendingIndex) shifts the cursor; anything else
    // pushes and drops the forward tail. Mirror the holder into render state.
    if (noteId) {
      noteNavHolder.current = arriveAt(noteNavHolder.current, noteId);
      const h = noteNavHolder.current;
      setNav({ canForward: h.index < h.stack.length - 1, tabIds: openTabIds(h.stack) });
    }
    void (async () => {
      if (!userId || !noteId) {
        if (alive) setDoc(null);
        return;
      }
      // Cache first (instant, offline-friendly): also seeds the wikilink resolver
      // from the rest of the library, not just this one note.
      const cached = await loadCachedLibrary(userId);
      if (!alive) return;
      setResolver(buildNoteResolver(cached.notes.map((d) => ({ path: d.path, pathHash: d.id, title: d.title }))));
      setNotesIndex(cached.notes.map((d) => ({ id: d.id, path: d.path, preview: previewOf(d.content), title: d.title })));
      const cachedNote = findCachedNote(cached, { id: noteId });
      if (cachedNote) setDoc(cachedNote);

      // Then a light single-row fetch for the freshest content — cheaper than
      // re-pulling the whole library just to open one note.
      try {
        const fresh = await fetchNote(userId, { id: noteId });
        if (!alive) return;
        if (fresh) setDoc(fresh);
        else if (!cachedNote) setDoc(null); // genuinely gone, and nothing cached either
      } catch {
        // Offline (or the request failed): fall back to whatever the cache had.
        if (alive && !cachedNote) setDoc(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, noteId]);

  // The reading body renders one <Markdown> per heading-led section so each
  // section's y falls out of onLayout — that's what the outline jumps to.
  const sections = useMemo(() => (doc ? splitSections(doc.content) : []), [doc]);
  const outline = useMemo(() => outlineOf(sections), [sections]);

  const findActive = findOpen && findQuery.trim().length > 0;
  const segments = useMemo(
    () => (findActive && doc ? splitMatches(doc.content, findQuery) : null),
    [findActive, doc, findQuery],
  );
  const matchCount = segments ? segments.reduce((n, seg) => n + (seg.hit ? 1 : 0), 0) : 0;

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);
  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  // Only markdown notes are editable — a pdf/doc row's content is text extracted
  // from the original file, and editing that would silently diverge from it.
  const canEdit = !!doc && fileKindOf(doc.path) === "note";

  // --- saving ---------------------------------------------------------------
  // One writer: saveNow persists the CURRENT draft (via ref) and marks clean on
  // success. Autosave failures stay quiet (dirty stays set; the next keystroke or
  // Done retries) — only an explicit Done surfaces the error, so a spotty
  // connection doesn't nag on every debounce tick.
  const saveNow = useCallback(
    async (opts?: { quiet?: boolean }): Promise<boolean> => {
      if (!userId || !noteId || !dirtyRef.current) return true;
      const content = draftRef.current;
      setSaving(true);
      try {
        const savedRow = await updateNoteContent(userId, noteId, content);
        // Only mark clean if nothing was typed while the request flew.
        if (draftRef.current === content) dirtyRef.current = false;
        // The returned row is server truth (trigger-stamped updated_at, and any
        // title/path rename made on the web meanwhile) — but keep the DRAFT's
        // content as what the reading view shows if typing continued.
        setDoc({ ...savedRow, content: draftRef.current });
        return true;
      } catch (err) {
        if (!opts?.quiet) flashNotice(err instanceof Error && err.message ? err.message : SAVE_FAILED);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [userId, noteId, flashNotice],
  );

  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveNow({ quiet: true });
    }, AUTOSAVE_MS);
  }, [saveNow]);

  // Flush on unmount (leaving the screen mid-edit): fire-and-forget, best effort.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current) void saveNow({ quiet: true });
    };
  }, [saveNow]);

  const enterEdit = useCallback(() => {
    if (!doc) return;
    setFindOpen(false);
    setFindQuery("");
    draftRef.current = doc.content;
    dirtyRef.current = false;
    setDraft(doc.content);
    setEditing(true);
  }, [doc]);

  // Done: flush the pending save, then drop back to reading. If the save fails
  // the editor STAYS open with the draft intact — exiting would silently show a
  // note the cloud doesn't have. Returns whether reading mode was reached, so
  // callers that chain something after (the menu's Find) can wait for it.
  const doneEditing = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const ok = await saveNow();
    if (ok) setEditing(false);
    return ok;
  }, [saveNow]);

  // Every editor change (keystroke or toolbar action) reports the full joined
  // document — refs only, no state: re-rendering this screen per keystroke
  // would also reset the block editor via its `content` prop.
  const onChangeDraft = useCallback(
    (text: string) => {
      draftRef.current = text;
      dirtyRef.current = true;
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const onMenuSelect = useCallback(
    (item: (typeof MENU_ITEMS)[number]) => {
      setMenuOpen(false);
      if (item.key === "find") {
        // Mid-edit, save-and-exit first and only open Find once reading mode is
        // actually reached — opening it eagerly would drop an autofocused find
        // bar on top of the still-open editor (and strand it there if the save
        // failed and the editor stayed open). Review finding, 2026-07-21.
        if (editing) {
          void doneEditing().then((ok) => {
            if (ok) setFindOpen(true);
          });
        } else {
          setFindOpen(true);
        }
        return;
      }
      // Delete / Rename / Replace: still web-app actions.
      flashNotice(EDIT_ON_WEB);
    },
    [flashNotice, editing, doneEditing],
  );

  // The mode pill's left half: pencil (reading → edit) / book (editing → save
  // + read), Obsidian's exact toggle language. PDF/Word rows explain instead.
  const onToggleMode = useCallback(() => {
    if (editing) {
      void doneEditing();
      return;
    }
    if (canEdit) enterEdit();
    else flashNotice(CANT_EDIT_KIND);
  }, [editing, doneEditing, canEdit, enterEdit, flashNotice]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);

  // --- pill-bar actions -----------------------------------------------------
  const openNoteId = useCallback(
    (id: string) => {
      if (id !== noteId) router.setParams({ id });
    },
    [noteId],
  );

  // ‹ : previous note in the (now app-lifetime) history; with nothing left to
  // step back to, it leaves to the Library — one consistent "browser back". A
  // non-null pendingIndex means a ‹ ›/tab move is already in flight (the
  // noteId effect hasn't consumed it yet) — further taps wait, so two rapid
  // opposite-direction taps can't compute off a stale cursor. Review finding,
  // 2026-07-21.
  const goBack = useCallback(() => {
    const h = noteNavHolder.current;
    if (h.pendingIndex !== null) return;
    if (h.index > 0) {
      noteNavHolder.current = { ...h, pendingIndex: h.index - 1 };
      router.setParams({ id: h.stack[h.index - 1] });
    } else {
      router.back();
    }
  }, []);

  const goForward = useCallback(() => {
    const h = noteNavHolder.current;
    if (h.pendingIndex !== null) return;
    if (h.index < h.stack.length - 1) {
      noteNavHolder.current = { ...h, pendingIndex: h.index + 1 };
      router.setParams({ id: h.stack[h.index + 1] });
    }
  }, []);

  // Tab viewer actions (owner 2026-07-21). Picking an open tab moves the
  // CURSOR to that note's latest visit (selectTab -> pendingIndex) instead of
  // pushing a duplicate; closing a tab strips it from history — closing the
  // one you're on navigates to where back would have gone, and closing the
  // last tab leaves to the Library.
  const onPickTab = useCallback(
    (id: string) => {
      setTabsOpen(false);
      if (id === noteId) return;
      if (noteNavHolder.current.pendingIndex !== null) return; // move in flight — same guard as ‹ ›
      noteNavHolder.current = selectTab(noteNavHolder.current, id);
      router.setParams({ id });
    },
    [noteId],
  );

  const onCloseTab = useCallback((id: string) => {
    if (noteNavHolder.current.pendingIndex !== null) return; // move in flight — same guard as ‹ ›
    const { nav: nextNav, nextId } = closeTab(noteNavHolder.current, id);
    noteNavHolder.current = nextNav;
    if (nextNav.stack.length === 0) {
      setTabsOpen(false);
      router.back();
      return;
    }
    if (nextId) {
      // Closed the current tab: navigate; the noteId effect re-mirrors nav.
      router.setParams({ id: nextId });
    } else {
      // Closed a background tab: no navigation happens, so re-mirror here.
      setNav({ canForward: nextNav.index < nextNav.stack.length - 1, tabIds: openTabIds(nextNav.stack) });
    }
  }, []);

  // + : a real phone-side create (api/cloudLibrary.ts createNote — same
  // "Untitled note.md" convention as the web store), then swap this page to it.
  // creatingRef is the synchronous re-entrancy lock (state alone leaves a
  // same-frame double-tap window that could insert two rows — review finding,
  // 2026-07-21); the `creating` state only dims the bar's "+".
  const newNote = useCallback(async () => {
    if (!userId || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const note = await createNote(userId);
      setNotesIndex((prev) => [
        { id: note.id, path: note.path, preview: previewOf(note.content), title: note.title },
        ...prev.filter((n) => n.id !== note.id),
      ]);
      router.setParams({ id: note.id });
    } catch (err) {
      flashNotice(err instanceof Error && err.message ? err.message : "Couldn't create a note — check your connection.");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [userId, flashNotice]);

  const jumpToSection = useCallback((sectionIndex: number) => {
    setOutlineOpen(false);
    const y = sectionYs.current[sectionIndex];
    if (typeof y === "number") scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, y - space(2)) });
  }, []);

  // Sheet rows. Search filters the cached index by title or folder path;
  // Recents maps this visit's ids to titles (falling back to the open doc's own
  // title, then a quiet placeholder, if the cache hasn't seen an id yet).
  const searchRows = useMemo<NoteSheetRow[]>(() => {
    const q = searchSheetQuery.trim().toLowerCase();
    const matches = q
      ? notesIndex.filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
      : notesIndex;
    return matches.slice(0, 60).map((n) => {
      const cut = n.path.lastIndexOf("/");
      return { active: n.id === noteId, key: n.id, label: n.title, ...(cut > 0 ? { sublabel: n.path.slice(0, cut) } : {}) };
    });
  }, [notesIndex, searchSheetQuery, noteId]);

  // Tab cards: the open doc supplies its own (freshest) title + preview; every
  // other tab reads the cached index, with a quiet fallback for ids the cache
  // hasn't seen yet.
  const tabRows = useMemo<NoteTab[]>(() => {
    const byId = new Map(notesIndex.map((n) => [n.id, n]));
    return nav.tabIds.map((id) => {
      if (doc && id === doc.id) return { id, preview: previewOf(doc.content), title: doc.title };
      const known = byId.get(id);
      return { id, preview: known?.preview ?? "", title: known?.title ?? "Note" };
    });
  }, [nav.tabIds, notesIndex, doc]);

  const outlineRows = useMemo<NoteSheetRow[]>(
    () => outline.map((h) => ({ indent: Math.min(h.level - 1, 4), key: String(h.sectionIndex), label: h.text })),
    [outline],
  );

  // Any in-note link — a [[wikilink]] OR a bare relative markdown link — opens the
  // target note when it resolves to something in the library. setParams (not push)
  // CHANGES this page's note in place — owner 2026-07-20 — so hopping across five
  // links never buries the Library under five stacked screens. Real web links open
  // in the browser; an internal link that matches no known note flashes a notice
  // rather than doing nothing. (return false = we handled it; don't let the default open.)
  const onLinkPress = useCallback(
    (url: string): boolean => {
      const targetId = resolveInternalHref(url, resolver);
      if (targetId) {
        if (targetId !== noteId) router.setParams({ id: targetId });
        return false;
      }
      if (isExternalUrl(url)) {
        void Linking.openURL(url).catch(() => {});
        return false;
      }
      const name = (() => {
        try {
          return decodeURIComponent(url.replace(/^wikilink:/, "")).split("#")[0].replace(/^\.?\//, "");
        } catch {
          return url;
        }
      })();
      flashNotice(`"${name}" isn't in your library yet.`);
      return false;
    },
    [resolver, flashNotice, noteId],
  );

  return (
    <View style={styles.flex} testID="note-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {/* The blur itself — the same component every tab screen gets from
          (tabs)/_layout, which this route never had (it lives outside that
          layout). Strongest under the status bar, eased to fully clear below
          it, and it never takes touches. Its own zIndex (5) puts it over the
          note text and under the chrome (10), so source order doesn't matter. */}
      <StatusBarBlur />
      {/* The note's chrome FLOATS over the page (owner 2026-07-22: "remove the
          top header border, and just replace with a fade to blur in the
          notes"). It used to be a solid band in normal flow, so the note began
          on a hard horizontal edge — the one screen in the Library flow that
          did, since note.tsx lives outside (tabs) and never got that layout's
          StatusBarBlur. Now the text runs up underneath a blur that fades to
          nothing, exactly like every tab.

          Height is MEASURED rather than assumed: the find bar and the link
          notice join this column only sometimes, and a hardcoded inset would
          either clip the title or leave a gap whenever they appear. */}
      <View
        style={[styles.chrome, { paddingTop: insets.top + space(2) }]}
        onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
      {/* Top bar: the back button on the left; on the right, the glass mode pill
          (owner's reference crop): pencil/book read–edit toggle + the "…" menu.
          Back steps OUT OF EDIT first (saving), then out of the note. */}
      <View style={styles.topRow}>
        <Pressable
          onPress={() => {
            if (editing) void doneEditing();
            else router.back();
          }}
          hitSlop={10}
          testID="note-back"
          accessibilityRole="button"
          accessibilityLabel={editing ? "Stop editing" : "Back to library"}
        >
          <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel} shadow>
            <Text style={styles.backChevron}>‹</Text>
          </GlassSurface>
        </Pressable>

        {doc ? (
          <View style={styles.topRight}>
            {saving ? <Text style={styles.saveHint}>Saving…</Text> : null}
            <GlassSurface style={styles.modePill} fallbackColor={c.glassPanel} tint={menuOpen ? c.accentFaint : undefined} shadow>
              <Pressable
                style={({ pressed }) => [styles.modePillBtn, pressed && styles.modePillBtnPressed]}
                onPress={onToggleMode}
                hitSlop={6}
                testID="note-mode-toggle"
                accessibilityRole="button"
                accessibilityLabel={editing ? "Done editing — back to reading" : "Edit this note"}
              >
                {editing ? <BookIcon size={19} color={c.text} /> : <PencilIcon size={17} color={canEdit ? c.text : c.text3} />}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modePillBtn, pressed && styles.modePillBtnPressed]}
                onPress={() => setMenuOpen((v) => !v)}
                hitSlop={6}
                testID="note-menu-btn"
                accessibilityRole="button"
                accessibilityLabel="Note actions"
                accessibilityState={{ expanded: menuOpen }}
              >
                <DotsIcon size={19} color={menuOpen ? c.accent : c.text} />
              </Pressable>
            </GlassSurface>
          </View>
        ) : null}
      </View>

      {findOpen ? (
        <View style={styles.findBar} testID="note-find-bar">
          <SearchIcon size={16} color={c.text3} />
          <TextInput
            style={styles.findInput}
            value={findQuery}
            onChangeText={setFindQuery}
            placeholder="Find in note"
            placeholderTextColor={c.text3}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="note-find-input"
          />
          {findQuery.trim() ? (
            <Text style={styles.findCount} testID="note-find-count">
              {matchCount}
            </Text>
          ) : null}
          <Pressable onPress={closeFind} hitSlop={10} testID="note-find-close" accessibilityRole="button" accessibilityLabel="Close find">
            <CloseIcon size={15} color={c.text2} />
          </Pressable>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.notice} testID="note-link-notice">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      </View>

      {doc === undefined ? (
        <View style={[styles.body, { paddingTop: chromeHeight }]} testID="note-skeleton">
          <Skeleton width="65%" height={30} style={styles.skeletonTitle} />
          {NOTE_SKELETON_LINE_WIDTHS.map((w, i) => (
            <Skeleton key={i} width={w} height={16} style={styles.skeletonLine} />
          ))}
        </View>
      ) : doc === null ? (
        <View style={[styles.emptyWrap, { paddingTop: chromeHeight }]}>
          <EmptyBlock
            title="Note unavailable"
            body="It may have been deleted, or hasn't reached this phone yet — pull to refresh from the Library tab."
          />
        </View>
      ) : editing ? (
        // EDIT MODE — the live-preview block editor (NoteBlockEditor): every
        // block renders as markdown, the tapped block reveals its raw source,
        // and the formatting pill rides the keyboard. The KeyboardAvoidingView
        // shrinks the editor so the caret can't hide under the keyboard (same
        // pattern as the chat screen).
        <KeyboardAvoidingView
          style={styles.flexGrow}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* The chrome height goes to the editor's SCROLL CONTENT (topInset),
              not to this container. Padding the container was what left edit
              mode with a hard edge under the controls — the "top header" the
              owner asked to replace with a fade (2026-07-22). Reading mode had
              already been scrolling under the blur; this makes edit mode match,
              while the caret still starts clear of the chrome. */}
          <NoteBlockEditor
            content={draft}
            header={<Text style={styles.title}>{doc.title}</Text>}
            onChangeText={onChangeDraft}
            topInset={chromeHeight}
          />
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          ref={scrollRef}
          // The note runs UP under the floating chrome and fades out behind the
          // blur — that hand-off is the whole point of the change, so this pad
          // is the chrome's own measured height and nothing more.
          contentContainerStyle={[styles.body, { paddingTop: chromeHeight }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Obsidian-style page (owner 2026-07-20): big bold inline title, then the
              content straight away — no path/updated metadata line between them. */}
          <Text style={styles.title}>{doc.title}</Text>
          {findActive && segments ? (
            // Find mode: render the note's own text so matches can actually be
            // highlighted (the markdown renderer builds its own nodes and can't be).
            <Text style={styles.findBody} testID="note-find-body">
              {segments.map((seg, i) =>
                seg.hit ? (
                  <Text key={i} style={styles.findHit}>
                    {seg.text}
                  </Text>
                ) : (
                  <Text key={i}>{seg.text}</Text>
                ),
              )}
            </Text>
          ) : (
            // One <Markdown> per heading-led section, each wrapped in a measured
            // View — the outline sheet scrolls straight to a section's real y.
            sections.map((section, i) => (
              <View
                key={`${doc.id}-${i}`}
                onLayout={(e) => {
                  sectionYs.current[i] = e.nativeEvent.layout.y;
                }}
              >
                {/* MessageBody, not a bare <Markdown> (owner 2026-07-22: the
                    note screen "does feel like a notepad"). Going through the
                    shared renderer is what gives a note the SAME text the web
                    editor draws: ==highlight==, #tag and <u>underline</u> via
                    lib/markdown-obsidian.ts, plus real pictures for ![](url),
                    which a bare <Markdown> rendered at zero height. */}
                <MessageBody content={preprocessWikilinks(section.body)} styles={markdownStyles} onLinkPress={onLinkPress} />
              </View>
            ))
          )}
          {/* Clears the floating pill bar so the last lines stay readable. */}
          <View style={{ height: PILL_BAR_HEIGHT + space(12) }} />
        </ScrollView>
      )}

      {/* "…" menu — drops from the top-right mode pill (owner 2026-07-21; it used
          to rise off a lower-left corner button). Always mounted so the close fade
          plays; a transparent tap-catcher dismisses it (no page blur — the menu's
          own glass is the only blur). */}
      <View style={StyleSheet.absoluteFill} pointerEvents={menuOpen ? "auto" : "none"} testID="note-menu">
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.menuWrap,
            {
              top: insets.top + space(2) + 40 + space(1.5),
              opacity: menuProgress,
              transform: [{ translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            },
          ]}
        >
          <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
            {MENU_ITEMS.map((item, i) => (
              <Pressable
                key={item.key}
                testID={`note-menu-${item.key}`}
                onPress={() => onMenuSelect(item)}
                style={({ pressed }) => [styles.menuRow, i > 0 && styles.menuDivider, pressed && styles.menuRowPressed]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !item.enabled }}
              >
                <Text style={[styles.menuLabel, !item.enabled && styles.menuLabelDisabled]}>{item.label}</Text>
                {item.enabled ? null : <Text style={styles.menuTag}>Web</Text>}
              </Pressable>
            ))}
          </GlassSurface>
        </Animated.View>
      </View>

      {/* The floating bottom pill bar (reading mode only — the editor's bottom is
          the keyboard toolbar) + the three sheets its buttons open. */}
      {doc && !editing ? (
        <View style={[styles.pillBarWrap, { bottom: insets.bottom + space(2) }]} pointerEvents="box-none">
          <NotePillBar
            canForward={nav.canForward}
            recentCount={nav.tabIds.length}
            busy={creating}
            onBack={goBack}
            onForward={goForward}
            onSearch={() => {
              setSearchSheetQuery("");
              setSearchSheetOpen(true);
            }}
            onNew={() => void newNote()}
            onRecents={() => setTabsOpen(true)}
            onOutline={() => {
              // Sections only render (and measure) outside Find mode.
              if (findOpen) closeFind();
              setOutlineOpen(true);
            }}
          />
        </View>
      ) : null}

      <NoteListSheet
        visible={searchSheetOpen}
        title="Search notes"
        rows={searchRows}
        emptyText={searchSheetQuery.trim() ? "Nothing in your library matches that." : "No notes here yet."}
        onPick={(id) => {
          setSearchSheetOpen(false);
          openNoteId(id);
        }}
        onClose={() => setSearchSheetOpen(false)}
        searchValue={searchSheetQuery}
        onSearchChange={setSearchSheetQuery}
        searchPlaceholder="Search notes"
        testID="note-search-sheet"
      />
      <NoteTabsSheet
        visible={tabsOpen}
        tabs={tabRows}
        activeId={noteId ?? null}
        busy={creating}
        onPick={onPickTab}
        onCloseTab={onCloseTab}
        onNew={() => {
          setTabsOpen(false);
          void newNote();
        }}
        onClose={() => setTabsOpen(false)}
      />
      <NoteListSheet
        visible={outlineOpen}
        title="Outline"
        rows={outlineRows}
        emptyText="No headings in this note yet."
        onPick={(key) => jumpToSection(Number(key))}
        onClose={() => setOutlineOpen(false)}
        testID="note-outline-sheet"
      />
    </View>
  );
}

// Local glyph (components/icons.tsx has no dots yet, and it's out of scope to
// edit here) — matches the Library tab's identical local DotsIcon.
function DotsIcon({ size = 23, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.6" fill={color} />
      <Circle cx="12" cy="12" r="1.6" fill={color} />
      <Circle cx="18.4" cy="12" r="1.6" fill={color} />
    </Svg>
  );
}

/** Open book — the "switch to reading" half of the mode toggle (Obsidian's
 * language, and the owner's reference crop). Local like DotsIcon above. */
function BookIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 6.2C10.6 4.9 8.7 4.4 6.3 4.4c-.9 0-1.7.1-2.3.3v13.1c.6-.2 1.4-.3 2.3-.3 2.4 0 4.3.6 5.7 1.9 1.4-1.3 3.3-1.9 5.7-1.9.9 0 1.7.1 2.3.3V4.7c-.6-.2-1.4-.3-2.3-.3-2.4 0-4.3.5-5.7 1.8Zm0 0v13.2"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Pencil — the "switch to editing" half of the mode toggle. */
function PencilIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m14.2 5.9 3.9 3.9M5.2 18.8l.9-3.9L15.6 5.4a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7l-9.5 9.5-3.9.9Z"
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
    flex: { flex: 1, backgroundColor: c.bg },
    flexGrow: { flex: 1 },
    // The floating chrome column (back button + mode pill, plus the find bar
    // and link notice when they're up). Above StatusBarBlur's zIndex 5 so the
    // controls stay crisp instead of being frosted by it — same arrangement,
    // and the same reason, as TopBar's overlay in the tab shell. "box-none" on
    // the element itself, so taps land on the buttons and everything else
    // falls through to the note underneath.
    chrome: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
    // Back on the left; while editing, the Done pill (+ "Saving…" hint) on the right.
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(3),
      paddingBottom: space(2),
    },
    // 40x40 liquid-glass icon button, fully ROUND (owner 2026-07-22: "change the
    // upper left 'back' button to be round not square") — which also matches the
    // pill it sits opposite, so the two ends of the row share one shape.
    iconGlass: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    backChevron: { fontSize: 26, lineHeight: 28, color: c.text, marginTop: -2 },
    topRight: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
    saveHint: { ...type.micro, color: c.text3 },
    // The upper-right glass pill: [pencil|book mode toggle][… menu] — the
    // owner's reference crop. Two 44pt targets sharing one 40pt-tall pill.
    modePill: {
      flexDirection: "row",
      alignItems: "center",
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
    },
    modePillBtn: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
    modePillBtnPressed: { backgroundColor: c.surface },

    body: { paddingHorizontal: space(5), paddingTop: space(2) },
    // Obsidian-style inline title: the h1 alone at the top of the page, a full
    // breath of air before the content starts (no metadata line in between).
    title: { ...type.h1, color: c.text, marginBottom: space(4) },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
    // Loading skeleton — same body padding as the real title/content above, so
    // it settles into place without a layout jump once doc resolves.
    skeletonTitle: { marginBottom: space(4) },
    skeletonLine: { marginBottom: space(3) },

    // Find bar + highlighted body.
    findBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      marginHorizontal: space(4),
      marginBottom: space(2),
      paddingHorizontal: space(3),
      height: 40,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
    },
    findInput: { flex: 1, color: c.text, fontSize: type.small.fontSize, padding: 0 },
    findCount: { ...type.small, color: c.text3, fontVariant: ["tabular-nums"] },
    findBody: { ...type.body, color: c.text2 },
    findHit: { backgroundColor: c.accentFaint, color: c.accent, fontWeight: "600" },

    notice: {
      marginHorizontal: space(4),
      marginBottom: space(2),
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    noticeText: { ...type.small, color: c.text2 },

    // "…" menu popup — drops from just under the top-right mode pill (same
    // anchoring math as the chat screen's actions menu).
    menuWrap: { position: "absolute", right: space(3), minWidth: 184 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    // The floating bottom pill bar's centering rail.
    pillBarWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(3), paddingHorizontal: space(4) },
    menuDivider: { borderTopWidth: 1, borderTopColor: c.line },
    menuRowPressed: { backgroundColor: c.surface },
    menuLabel: { ...type.body, color: c.text },
    menuLabelDisabled: { color: c.text3 },
    menuTag: { ...type.micro, color: c.text3, textTransform: "uppercase", letterSpacing: 0.6 },
  });
