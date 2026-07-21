import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InputAccessoryView,
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
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { CloseIcon, SearchIcon, type IconProps } from "@/components/icons";
import { fetchNote, findCachedNote, loadCachedLibrary, updateNoteContent, type CloudLibraryNote } from "@/api/cloudLibrary";
import { fileKindOf } from "@/lib/library-row-meta";
import { cycleHeading, toggleLinePrefix, wrapInline, type EditSel } from "@/lib/note-edit";
import { buildNoteResolver, isExternalUrl, preprocessWikilinks, resolveInternalHref } from "@/lib/wikilinks";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Note view + editor (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md
// §7): renders one note straight from your account's library, and — owner 2026-07-20
// ("work on the edit mode") — now EDITS it too. Edit (lower-left "…" menu) opens a
// source-markdown editor for .md notes with a small formatting toolbar riding the
// keyboard; saves go to the same readable_library_documents row the web app writes
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

// The "…" menu — lives in a lower-left glass button (owner 2026-07-20: Edit moved
// off the top bar into this menu, and the menu into the bottom-left corner,
// matching the Library tab's actions button). Edit and Find are REAL; Rename /
// Replace / Delete still flash the "on the web app" note. `enabled` here is the
// template value — Edit's is decided per-note at render (markdown only).
const MENU_ITEMS = [
  { key: "edit", label: "Edit", enabled: true },
  { key: "find", label: "Find", enabled: true },
  { key: "rename", label: "Rename", enabled: false },
  { key: "replace", label: "Replace", enabled: false },
  { key: "delete", label: "Delete", enabled: false },
] as const;

// Same size as the Library tab's lower-left actions button — the two screens'
// corner controls should read as one family.
const FAB_SIZE = 48;

const EDIT_ON_WEB = "That happens on the web app for now.";
const CANT_EDIT_KIND = "PDF and Word files can't be edited here — their text is extracted from the original file.";
const SAVE_FAILED = "Couldn't save — check your connection and try Done again.";

// iOS keyboard-accessory hook-up id for the formatting toolbar.
const TOOLBAR_ID = "note-edit-toolbar";

// Debounce for autosave-while-typing: long enough to batch a sentence, short
// enough that closing the app mid-thought almost never loses more than a beat.
const AUTOSAVE_MS = 1400;

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
  // Transient "couldn't find that note" / "edit on the web app" line.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reading-mode chrome state.
  const [menuOpen, setMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  // Edit-mode state. `draft` drives the editor; refs shadow the latest draft +
  // dirtiness so the debounced autosave and the unmount flush never read stale
  // closures. `forcedSel` is set ONLY right after a toolbar transform (to place
  // the caret) and released on the next selection event — leaving the TextInput's
  // selection uncontrolled the rest of the time, which iOS needs to behave.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [forcedSel, setForcedSel] = useState<{ start: number; end: number } | null>(null);
  const selRef = useRef({ end: 0, start: 0 });
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
    // half-scrolled body, and (defensively — links aren't tappable while
    // editing) no editor left open against the wrong note.
    setFindOpen(false);
    setFindQuery("");
    setEditing(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
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

  const rendered = useMemo(() => (doc ? preprocessWikilinks(doc.content) : ""), [doc]);

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
    selRef.current = { end: 0, start: 0 };
    setDraft(doc.content);
    setForcedSel(null);
    setEditing(true);
  }, [doc]);

  // Done: flush the pending save, then drop back to reading. If the save fails
  // the editor STAYS open with the draft intact — exiting would silently show a
  // note the cloud doesn't have.
  const doneEditing = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const ok = await saveNow();
    if (!ok) return;
    setEditing(false);
  }, [saveNow]);

  const onChangeDraft = useCallback(
    (text: string) => {
      draftRef.current = text;
      dirtyRef.current = true;
      setDraft(text);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  // Toolbar buttons run a pure transform over (text, selection) and force the
  // caret to where the transform says it belongs; the next real selection event
  // releases control back to the native input.
  const applyTool = useCallback(
    (transform: (s: EditSel) => EditSel) => {
      const next = transform({ text: draftRef.current, ...selRef.current });
      draftRef.current = next.text;
      dirtyRef.current = true;
      selRef.current = { end: next.end, start: next.start };
      setDraft(next.text);
      setForcedSel({ end: next.end, start: next.start });
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const onMenuSelect = useCallback(
    (item: (typeof MENU_ITEMS)[number]) => {
      setMenuOpen(false);
      if (item.key === "edit") {
        if (canEdit) enterEdit();
        else flashNotice(CANT_EDIT_KIND);
        return;
      }
      if (item.key === "find") {
        setFindOpen(true);
        return;
      }
      // Delete / Rename / Replace: still web-app actions.
      flashNotice(EDIT_ON_WEB);
    },
    [flashNotice, canEdit, enterEdit],
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);

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
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="note-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Top bar: the back button, plus — while editing — a Done pill on the right
          (with a quiet "Saving…" hint beside it). Back steps OUT OF EDIT first
          (saving), then out of the note; the "…" menu stays in the lower-left. */}
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
          <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel}>
            <Text style={styles.backChevron}>‹</Text>
          </GlassSurface>
        </Pressable>

        {editing ? (
          <View style={styles.doneCluster}>
            {saving ? <Text style={styles.saveHint}>Saving…</Text> : null}
            <Pressable
              onPress={() => void doneEditing()}
              hitSlop={10}
              testID="note-edit-done"
              accessibilityRole="button"
              accessibilityLabel="Done editing"
            >
              <GlassSurface style={styles.donePill} fallbackColor={c.glassPanel}>
                <Text style={styles.doneLabel}>Done</Text>
              </GlassSurface>
            </Pressable>
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

      {doc === undefined ? null : doc === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock
            title="Note unavailable"
            body="It may have been deleted, or hasn't reached this phone yet — pull to refresh from the Library tab."
          />
        </View>
      ) : editing ? (
        // EDIT MODE — source markdown in a plain input (Obsidian's source view),
        // title static above it, formatting toolbar riding the keyboard. The
        // KeyboardAvoidingView shrinks the input so the caret can't hide under
        // the keyboard (same pattern as the chat screen).
        <KeyboardAvoidingView
          style={styles.flexGrow}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.editorWrap}>
            <Text style={styles.title}>{doc.title}</Text>
            <TextInput
              style={styles.editor}
              value={draft}
              onChangeText={onChangeDraft}
              onSelectionChange={(e) => {
                selRef.current = e.nativeEvent.selection;
                if (forcedSel) setForcedSel(null);
              }}
              selection={forcedSel ?? undefined}
              multiline
              autoFocus
              scrollEnabled
              textAlignVertical="top"
              placeholder="Start writing…"
              placeholderTextColor={c.text3}
              inputAccessoryViewID={Platform.OS === "ios" ? TOOLBAR_ID : undefined}
              testID="note-editor"
            />
            {/* Android has no InputAccessoryView — pin the toolbar under the
                editor instead (the KeyboardAvoidingView keeps it above the keys). */}
            {Platform.OS !== "ios" ? <EditToolbar onAction={applyTool} /> : null}
          </View>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.body}
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
            <Markdown style={markdownStyles} onLinkPress={onLinkPress}>{rendered}</Markdown>
          )}
          {/* Clears the lower-left "…" button so the last lines stay readable. */}
          <View style={{ height: FAB_SIZE + space(10) }} />
        </ScrollView>
      )}

      {/* "…" menu — rises from the lower-left corner button (owner 2026-07-20).
          Always mounted so the close fade plays; a transparent tap-catcher dismisses
          it (no page blur — the menu's own glass is the only blur). Edit renders
          disabled (no "Web" tag — it's not a web action, it's a file-kind limit)
          for pdf/doc rows. */}
      <View style={StyleSheet.absoluteFill} pointerEvents={menuOpen ? "auto" : "none"} testID="note-menu">
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.menuWrap,
            {
              bottom: insets.bottom + space(1) + FAB_SIZE + space(3),
              opacity: menuProgress,
              transform: [{ translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
            {MENU_ITEMS.map((item, i) => {
              const enabled = item.key === "edit" ? canEdit : item.enabled;
              return (
                <Pressable
                  key={item.key}
                  testID={`note-menu-${item.key}`}
                  onPress={() => onMenuSelect(item)}
                  style={({ pressed }) => [styles.menuRow, i > 0 && styles.menuDivider, pressed && styles.menuRowPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !enabled }}
                >
                  <Text style={[styles.menuLabel, !enabled && styles.menuLabelDisabled]}>{item.label}</Text>
                  {enabled || item.key === "edit" ? null : <Text style={styles.menuTag}>Web</Text>}
                </Pressable>
              );
            })}
          </GlassSurface>
        </Animated.View>
      </View>

      {/* Lower-left "…" glass button — same corner + size as the Library tab's, so
          the library and its notes share one control language. Only in reading mode
          with a real note loaded (the editor's controls are Done + the toolbar). */}
      {doc && !editing ? (
        <View style={[styles.fabWrap, { bottom: insets.bottom + space(1) }]} pointerEvents="box-none">
          <GlassSurface style={styles.fab} fallbackColor={c.glassPanel} tint={menuOpen ? c.accentFaint : undefined}>
            <Pressable
              style={styles.fabInner}
              onPress={() => setMenuOpen((v) => !v)}
              hitSlop={8}
              testID="note-menu-btn"
              accessibilityRole="button"
              accessibilityLabel="Note actions"
              accessibilityState={{ expanded: menuOpen }}
            >
              <DotsIcon size={20} color={menuOpen ? c.accent : c.text2} />
            </Pressable>
          </GlassSurface>
        </View>
      ) : null}

      {/* iOS: the formatting toolbar rides on top of the keyboard. (Android pins
          the same toolbar under the editor instead — see the edit branch above.) */}
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={TOOLBAR_ID} backgroundColor="transparent">
          <EditToolbar onAction={applyTool} />
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

// The keyboard formatting toolbar: wikilink · heading · bold · italic · list.
// Text glyphs (styled to preview their effect) instead of bespoke SVGs — same
// quiet language as the app's other small controls. Each button feeds a pure
// transform from lib/note-edit into the editor.
function EditToolbar({ onAction }: { onAction: (transform: (s: EditSel) => EditSel) => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const buttons: { key: string; glyph: string; label: string; style?: object; transform: (s: EditSel) => EditSel }[] = [
    { glyph: "[[ ]]", key: "wikilink", label: "Wiki link", transform: (s) => wrapInline(s, "[[", "]]") },
    { glyph: "H", key: "heading", label: "Heading", transform: cycleHeading },
    { glyph: "B", key: "bold", label: "Bold", style: { fontWeight: "800" as const }, transform: (s) => wrapInline(s, "**") },
    { glyph: "I", key: "italic", label: "Italic", style: { fontStyle: "italic" as const }, transform: (s) => wrapInline(s, "*") },
    { glyph: "•", key: "list", label: "Bullet list", transform: (s) => toggleLinePrefix(s, "- ") },
  ];
  return (
    <GlassSurface style={styles.toolbar} fallbackColor={c.glassMenu} opaque>
      {buttons.map((btn) => (
        <Pressable
          key={btn.key}
          onPress={() => onAction(btn.transform)}
          style={({ pressed }) => [styles.toolBtn, pressed && styles.toolBtnPressed]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={btn.label}
          testID={`note-tool-${btn.key}`}
        >
          <Text style={[styles.toolGlyph, btn.style]}>{btn.glyph}</Text>
        </Pressable>
      ))}
    </GlassSurface>
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

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    flexGrow: { flex: 1 },
    // Back on the left; while editing, the Done pill (+ "Saving…" hint) on the right.
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(3),
      paddingBottom: space(2),
    },
    // 40x40 liquid-glass icon button, radius.md — same shape review.tsx uses.
    iconGlass: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    backChevron: { fontSize: 26, lineHeight: 28, color: c.text, marginTop: -2 },
    doneCluster: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
    saveHint: { ...type.micro, color: c.text3 },
    donePill: {
      height: 40,
      paddingHorizontal: space(4),
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    doneLabel: { ...type.bodyStrong, color: c.accent },

    // Edit mode: static title above a flex-filling source-markdown input; the
    // input scrolls itself and the KeyboardAvoidingView keeps the caret visible.
    editorWrap: { flex: 1, paddingHorizontal: space(5), paddingTop: space(2) },
    editor: { flex: 1, ...type.body, color: c.text, padding: 0, paddingBottom: space(4) },
    // Keyboard formatting toolbar (iOS: accessory view; Android: pinned under the
    // editor). Full-width bar, hairline top edge, buttons spread evenly.
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-evenly",
      paddingVertical: space(1.5),
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    toolBtn: {
      minWidth: 44,
      height: 40,
      paddingHorizontal: space(2),
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    toolBtnPressed: { backgroundColor: c.surface },
    toolGlyph: { ...type.title, color: c.text },

    body: { paddingHorizontal: space(5), paddingTop: space(2) },
    // Obsidian-style inline title: the h1 alone at the top of the page, a full
    // breath of air before the content starts (no metadata line in between).
    title: { ...type.h1, color: c.text, marginBottom: space(4) },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },

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

    // "…" menu popup (bottom-anchored, rises off the corner button) + the button
    // itself — geometry mirrors the Library tab's ActionsFab exactly.
    menuWrap: { position: "absolute", left: space(4), minWidth: 184 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    fabWrap: { position: "absolute", left: space(4), alignItems: "flex-start" },
    fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 1, borderColor: c.line },
    fabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(3), paddingHorizontal: space(4) },
    menuDivider: { borderTopWidth: 1, borderTopColor: c.line },
    menuRowPressed: { backgroundColor: c.surface },
    menuLabel: { ...type.body, color: c.text },
    menuLabelDisabled: { color: c.text3 },
    menuTag: { ...type.micro, color: c.text3, textTransform: "uppercase", letterSpacing: 0.6 },
  });
