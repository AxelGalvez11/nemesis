import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { CloseIcon, SearchIcon, type IconProps } from "@/components/icons";
import { fetchNote, findCachedNote, loadCachedLibrary, type CloudLibraryNote } from "@/api/cloudLibrary";
import { buildNoteResolver, isExternalUrl, preprocessWikilinks, resolveInternalHref } from "@/lib/wikilinks";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Read-only note view (cloud-first pivot, docs/design/nemesis-cloud-first-phone-2026-07.md
// §7): renders one note straight from your account's library. The web app is the only
// author for now, so every write-shaped control here is inert by design — the "…" menu's
// Delete / Rename / Replace and the book icon's "edit" all only explain that editing
// happens on the web app; phone editing isn't wired up yet. The last-cached copy of this
// note (and the rest of the library, for wikilink resolution) renders instantly, then a
// fresh fetch refreshes its content, so an already-opened note keeps working offline.
// [[wikilinks]] are tappable: preprocessed into markdown links and resolved against every
// cached note (by title / basename / path) to jump between notes.
// Find IS wired (read-safe): while a query is present the body renders as plain text
// with every match highlighted, plus a live match count — the one genuinely useful,
// non-destructive action of the four.

// The "…" menu. Only Find is actionable on a read-only copy; the rest flash the
// "edit on the web app" note instead of pretending to mutate the library.
const MENU_ITEMS = [
  { key: "delete", label: "Delete", enabled: false },
  { key: "rename", label: "Rename", enabled: false },
  { key: "find", label: "Find", enabled: true },
  { key: "replace", label: "Replace", enabled: false },
] as const;

const EDIT_ON_WEB = "Editing happens on the web app — this phone shows a read-only copy.";

/** Short relative age ("3d ago" / a short date past a week) — same small helper each
 * screen that shows one keeps locally (see app/(tabs)/index.tsx, components/AppDrawer.tsx). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  // Read-only chrome state.
  const [menuOpen, setMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
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

  const onMenuSelect = useCallback(
    (item: (typeof MENU_ITEMS)[number]) => {
      setMenuOpen(false);
      if (item.key === "find") {
        setFindOpen(true);
        return;
      }
      // Delete / Rename / Replace: inert on this read-only copy.
      flashNotice(EDIT_ON_WEB);
    },
    [flashNotice],
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);

  // Any in-note link — a [[wikilink]] OR a bare relative markdown link — opens the
  // target note when it resolves to something in the library. Real web links open in
  // the browser; an internal link that matches no known note flashes a notice rather
  // than doing nothing. (return false = we handled it; don't let the default open.)
  const onLinkPress = useCallback(
    (url: string): boolean => {
      const targetId = resolveInternalHref(url, resolver);
      if (targetId) {
        router.push({ pathname: "/note", params: { id: targetId } });
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
    [resolver, flashNotice],
  );

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="note-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          testID="note-back"
          accessibilityRole="button"
          accessibilityLabel="Back to library"
        >
          <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel}>
            <Text style={styles.backChevron}>‹</Text>
          </GlassSurface>
        </Pressable>

        {/* Book (read/edit) then "…" — only shown once a real note is loaded. Read is
            the only real mode; tapping "edit" explains it's a web-app action. */}
        {doc ? (
          <>
            <Pressable
              onPress={() => flashNotice(EDIT_ON_WEB)}
              hitSlop={10}
              testID="note-mode-toggle"
              accessibilityRole="button"
              accessibilityLabel="Reading mode — switch to editing on the web app"
            >
              <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel}>
                <BookIcon size={19} color={c.text} />
              </GlassSurface>
            </Pressable>

            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={10}
              testID="note-menu-btn"
              accessibilityRole="button"
              accessibilityLabel="Note actions"
            >
              <GlassSurface style={styles.iconGlass} fallbackColor={c.glassPanel}>
                <DotsIcon size={19} color={c.text} />
              </GlassSurface>
            </Pressable>
          </>
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
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.meta}>
            {doc.path}
            {doc.updatedAt ? ` · updated ${relativeTime(doc.updatedAt)}` : ""}
          </Text>
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
          <View style={{ height: space(10) }} />
        </ScrollView>
      )}

      {/* "…" menu — anchored under the top-row cluster. Always mounted so the close fade
          plays; a transparent tap-catcher dismisses it (no page blur — the menu's own
          glass is the only blur). Fade + small rise, like every other glass menu. */}
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
          <GlassSurface style={styles.menu} fallbackColor={c.glassPanel}>
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
    </View>
  );
}

// Local glyphs (components/icons.tsx has no book / dots yet, and it's out of scope
// to edit here) — thin strokes / round caps to match that set's language.
function BookIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.4 3.8h9.8a1.4 1.4 0 0 1 1.4 1.4v13.6a1.4 1.4 0 0 0-1.4-1.4H6.4A1.5 1.5 0 0 1 4.9 17.5V5.3A1.5 1.5 0 0 1 6.4 3.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="8.3" y1="7.7" x2="14" y2="7.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8.3" y1="10.6" x2="12.4" y2="10.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

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
    // Back · Book · "…" — a left cluster of equal glass icon buttons. Book/dots sit to
    // the RIGHT of back, so the read/edit toggle stays left of the "…" menu.
    topRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(3), paddingBottom: space(2) },
    // 40x40 liquid-glass icon buttons, radius.md — same shape review.tsx uses, shared
    // across the whole cluster so back / book / dots read as one control strip.
    iconGlass: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    backChevron: { fontSize: 26, lineHeight: 28, color: c.text, marginTop: -2 },

    body: { paddingHorizontal: space(5) },
    title: { ...type.h1, color: c.text, marginBottom: space(1) },
    meta: { ...type.micro, color: c.text2, marginBottom: space(4) },
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
    findInput: { flex: 1, color: c.text, fontSize: 15, padding: 0 },
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

    // "…" menu popup.
    menuWrap: { position: "absolute", left: space(3), minWidth: 184 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(3), paddingHorizontal: space(4) },
    menuDivider: { borderTopWidth: 1, borderTopColor: c.line },
    menuRowPressed: { backgroundColor: c.surface },
    menuLabel: { ...type.body, color: c.text },
    menuLabelDisabled: { color: c.text3 },
    menuTag: { ...type.micro, color: c.text3, textTransform: "uppercase", letterSpacing: 0.6 },
  });
