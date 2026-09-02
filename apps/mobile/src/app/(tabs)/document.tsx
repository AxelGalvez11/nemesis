import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { CloseIcon } from "@/components/icons";
import { DotsIcon } from "@/components/icons-settings";
import { MessageBody } from "@/components/MessageBody";
import { Composer, COMPOSER_COMPACT_HEIGHT } from "@/components/Composer";
import {
  deleteNote,
  fetchNote,
  findCachedNote,
  loadCachedLibrary,
  type CloudLibraryNote,
} from "@/api/cloudLibrary";
import { startCanvas } from "@/api/canvases";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, inset, radius, space, type } from "@/theme/tokens";

// The document viewer (IMG_6540/6541/6547) — a NEW screen, not a port of
// note.tsx: that file already owns the full read/edit note experience (tabs,
// find-in-note, block editor) and sits outside this task's file boundary. This
// is the reference's simpler shape instead — a page of read-only prose with a
// composer floating over the bottom, so typing starts a CHAT ABOUT the open
// document rather than editing it in place. Route: /document?note=<id> for a
// library note; /document?source=<id> for an uploaded original (see the
// `source` branch below — library_sources has no read-by-id export yet, listed
// in api/librarySources.ts's own header as write-only today, so that branch is
// an honest placeholder rather than a fabricated preview).
//
// Lives in (tabs)/ per the task brief (so /document resolves), but claims
// IMMERSIVE like chat.tsx's record mode and calendar.tsx: this screen draws its
// own header (round × / title / round …, matching the reference) instead of the
// shared floating TopBar — a shared ≡-drawer button makes no sense on a screen
// that is itself one document away from the library, not a section of the app.

export default function DocumentScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const insets = useSafeAreaInsets();
  const { contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setImmersive } = useShell();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ note?: string | string[]; source?: string | string[] }>();
  const noteId = firstParam(params.note);
  const sourceId = firstParam(params.source);

  // This screen's chrome is its own — hide the shared TopBar/drawer for as
  // long as it's mounted, same contract as chat.tsx's record mode.
  useEffect(() => {
    setImmersive(true);
    return () => setImmersive(false);
  }, [setImmersive]);

  // undefined = still loading; null = not found / deleted / no access.
  const [note, setNote] = useState<CloudLibraryNote | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [text, setText] = useState("");
  const composerRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!uid || !noteId) {
      setNote(null);
      return;
    }
    let alive = true;
    setNote(undefined);
    // Cache first, for an instant render offline or on a slow connection —
    // same two-phase read as note.tsx and cloudLibrary.ts's own doc comment.
    void loadCachedLibrary(uid).then((snapshot) => {
      if (!alive) return;
      const cached = findCachedNote(snapshot, { id: noteId });
      if (cached) setNote(cached);
    });
    void fetchNote(uid, { id: noteId })
      .then((fresh) => {
        if (alive) setNote(fresh);
      })
      .catch(() => {
        // Leave whatever the cache produced (possibly still undefined, which
        // renders the loading state) — a fetch failure here isn't a reason to
        // blank out a document the reader already had open.
      });
    return () => {
      alive = false;
    };
  }, [uid, noteId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/library"));

  const fileName = note?.title || (sourceId ? "Document" : "");

  const onShare = () => {
    setMenuOpen(false);
    if (!note) return;
    void Share.share({ message: note.content ? `${note.title}\n\n${note.content}` : note.title, title: note.title }).catch(() => {});
  };

  const onDelete = () => {
    setMenuOpen(false);
    if (!uid || !note) return;
    Alert.alert(`Delete "${note.title}"?`, "It leaves your library on every device. You can still recover it on the web app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteNote(uid, note.id).then(close),
      },
    ]);
  };

  const onSend = () => {
    const said = text.trim();
    if (!said) return;
    const canvas = startCanvas();
    setText("");
    // `note` rides along even though canvas.tsx doesn't read it yet (task
    // brief: "the next slice attaches it") — carrying it now means that slice
    // is a canvas.tsx change only, not a second pass through this screen.
    router.push({
      pathname: "/canvas",
      params: { ask: said, c: canvas.id, ...(noteId ? { note: noteId } : {}) },
    } as never);
  };

  const composerBottomPad = keyboardUp ? space(3) : insets.bottom + space(3);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={close} style={styles.iconBtn} hitSlop={8} testID="document-close" accessibilityLabel="Close">
          <CloseIcon size={17} color={c.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="middle" testID="document-title">
          {fileName}
        </Text>
        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          style={styles.iconBtn}
          hitSlop={8}
          disabled={!note}
          testID="document-menu-btn"
          accessibilityRole="button"
          accessibilityLabel="Document actions"
          accessibilityState={{ expanded: menuOpen }}
        >
          <DotsIcon size={19} color={note ? c.text : c.text3} />
        </Pressable>
      </View>

      {note === undefined ? (
        <View style={styles.centerFill} testID="document-loading">
          <ActivityIndicator color={c.text2} />
        </View>
      ) : note === null ? (
        <View style={styles.centerFill} testID="document-missing">
          <Text style={styles.missingTitle}>{sourceId ? "Can't preview this file yet" : "Note not found"}</Text>
          <Text style={styles.missingBody}>
            {sourceId
              ? "Uploaded files don't have a phone preview yet — open it on the web app."
              : "It may have been deleted, or you don't have access to it."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, { paddingBottom: contentBottom + COMPOSER_COMPACT_HEIGHT + space(6) }]}
          keyboardShouldPersistTaps="handled"
        >
          <MessageBody content={note.content} styles={{ ...markdownStyles, body: { ...markdownStyles.body, ...type.body } }} />
        </ScrollView>
      )}

      {/* "…" dropdown — Share / Delete. Delete only makes sense for a library
          note; a source-file placeholder has no row to open it from. */}
      {menuOpen ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID="document-menu">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <View style={[styles.menu, { top: insets.top + space(2) + control.lg + space(1.5) }]}>
            <Pressable style={styles.menuRow} onPress={onShare} testID="document-menu-share">
              <Text style={styles.menuLabel}>Share</Text>
            </Pressable>
            {noteId ? (
              <Pressable style={[styles.menuRow, styles.menuDivider]} onPress={onDelete} testID="document-menu-delete">
                <Text style={[styles.menuLabel, { color: c.danger }]}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Floats over the bottom, riding up with the keyboard — same
          absolute/KeyboardAvoidingView pairing as chat.tsx's composer. */}
      <View style={[styles.composerFloat, { paddingBottom: composerBottomPad }]}>
        <Composer
          value={text}
          onChangeText={setText}
          onSend={onSend}
          placeholder="Ask Nemesis"
          inputRef={composerRef}
          compact
          testID="document-composer"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.raised },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingBottom: space(2),
      backgroundColor: c.raised,
    },
    iconBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    title: { ...type.title, color: c.text, flex: 1, textAlign: "center", marginHorizontal: space(2) },

    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(2) },
    missingTitle: { ...type.title, color: c.text },
    missingBody: { ...type.small, color: c.text2, textAlign: "center" },

    body: { paddingHorizontal: inset.answer, paddingTop: space(2) },

    menu: {
      position: "absolute",
      right: space(4),
      minWidth: 168,
      backgroundColor: c.glassMenu,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
    },
    menuRow: { paddingHorizontal: space(4), paddingVertical: space(3) },
    menuDivider: { borderTopWidth: 1, borderTopColor: c.line },
    menuLabel: { ...type.label, color: c.text },

    composerFloat: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: space(3) },
  });
