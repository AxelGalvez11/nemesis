import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import {
  askCanvas,
  createFolder,
  deleteCanvas,
  listCanvases,
  listFolders,
  loadCanvas,
  renameCanvas,
  saveCanvas,
  setCanvasFolder,
  setCanvasPinned,
} from "@/api/canvases";
import { useShell } from "@/components/AppDrawer";
import { CanvasActionsMenu } from "@/components/canvas/CanvasActionsMenu";
import { CanvasTurn } from "@/components/canvas/CanvasTurn";
import { Composer, COMPOSER_COMPACT_HEIGHT } from "@/components/Composer";
import { GlassSurface } from "@/components/GlassSurface";
import { MiniMenu, type MenuAnchor } from "@/components/MiniMenu";
import { TextPromptSheet } from "@/components/RowActionSheets";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ThinkingLine } from "@/components/ThinkingLine";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { capabilityFromParam, firstParam } from "@/lib/canvas-screen";
import { canvasLabel, newCanvas, nextMomentId, threadFromCanvas, withExchange, type Folder } from "@/lib/canvases";
import { CAPABILITY_COPY, lastThingSaid, type CanvasThreadTurn, type ComposerCapability, type LearningCanvas } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

// One canvas — the web app's session object — rendered as a conversation in the ChatGPT iOS
// app's shape (see docs/design/ios-web-parity-2026-09.md, Slice 1). A canvas is a single durable
// document (learning_canvases.document.moments), unlike chat.tsx's per-thread message rows, so
// this screen's "row" is a whole TURN (question + reply together) rather than one row per
// message — which is also why the "pin the newest question near the top" mechanics below need
// no separate last-user-row tracking the way chat.tsx's does: the newest ROW already IS the
// newest question-and-answer pair.
//
// EPOCH GUARD, same discipline as chat.tsx: this screen can be re-parented onto a DIFFERENT
// canvas id without unmounting (expo-router reuses the route when only the query changes), so a
// reply arriving after the id changed must not land on the canvas now on screen.

const THINKING_PHASE = { kind: "routing" as const };

interface Row {
  id: string;
  kind: "turn" | "live";
  turn?: CanvasThreadTurn;
  /** True only for the very first turn — the only one that can carry the composer capability
   *  chip (see capForFirstTurnRef below). */
  isFirstTurn: boolean;
}

export default function CanvasScreen() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setHeaderTitle, setHeaderRight } = useShell();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ c?: string | string[]; ask?: string | string[]; cap?: string | string[] }>();
  const canvasId = firstParam(params.c);
  const askParam = firstParam(params.ask);
  const capability = capabilityFromParam(params.cap);

  const [canvas, setCanvas] = useState<LearningCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const [input, setInput] = useState("");
  // The learner's just-sent words, drawn immediately — before the pair is even a moment in
  // `canvas.moments`, let alone saved. Cleared once the exchange lands in `canvas` (success) or
  // is abandoned outright (a Stop with nothing streamed yet); kept on an error so the failed
  // question stays on screen with the retry line under it.
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copyAnchor, setCopyAnchor] = useState<MenuAnchor | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);

  const canvasRef = useRef<LearningCanvas | null>(null);
  const epochRef = useRef(0);
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamedRef = useRef("");
  // Keyed by canvas id, not by the ask text — a refocus/re-render must never resend, even if the
  // route still carries the same `ask` param.
  const askSentForRef = useRef<Set<string>>(new Set());
  // Set once, only when the auto-sent `ask` was this canvas's very first submission. A
  // capability is a one-shot declaration that is never stored (composer-capability.ts) — so it
  // can only ever be known during THIS mount, never recovered on a later reopen.
  const capForFirstTurnRef = useRef<ComposerCapability | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const composerRef = useRef<TextInput>(null);
  const rowHeights = useRef(new Map<string, number>());
  const rowIdsRef = useRef<string[]>([]);
  const [listHeight, setListHeight] = useState(0);
  const [lastTurnHeight, setLastTurnHeight] = useState(0);

  const measureLastTurn = useCallback(() => {
    const ids = rowIdsRef.current;
    const lastId = ids[ids.length - 1];
    const total = lastId ? rowHeights.current.get(lastId) ?? 0 : 0;
    setLastTurnHeight((prev) => (Math.abs(prev - total) > 1 ? total : prev));
  }, []);

  // No canvas id at all — nothing this screen can show. Bounce home rather than render broken.
  useEffect(() => {
    if (!canvasId) router.replace("/");
  }, [canvasId]);

  // Load (or mint) the canvas whenever the signed-in user or the route's canvas id changes.
  // Bumping the epoch first means any reply already in flight for the PREVIOUS canvas can no
  // longer touch this screen's state once it lands.
  useEffect(() => {
    if (!uid || !canvasId) {
      setLoading(false);
      return;
    }
    epochRef.current += 1;
    const epoch = epochRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    setSending(false);
    setPendingText(null);
    setStreamingText("");
    setInput("");
    setLastError(null);
    setCanvas(null);
    canvasRef.current = null;
    capForFirstTurnRef.current = null;
    setLoading(true);
    void loadCanvas(uid, canvasId).then((loaded) => {
      if (epochRef.current !== epoch) return;
      const next = loaded ?? newCanvas(canvasId);
      canvasRef.current = next;
      setCanvas(next);
      setLoading(false);
    });
    void listCanvases(uid).then((rows) => {
      if (epochRef.current !== epoch) return;
      const row = rows.find((r) => r.id === canvasId);
      setPinned(Boolean(row?.pinnedAt));
      setFolderId(row?.folderId ?? null);
    });
  }, [uid, canvasId]);

  const refreshFolders = useCallback(() => {
    if (!uid) return;
    void listFolders(uid).then(setFolders);
  }, [uid]);
  useEffect(() => {
    if (menuOpen) refreshFolders();
  }, [menuOpen, refreshFolders]);

  // One exchange: the learner's words go out, the reply streams back into `streamingText`, and
  // the pair is recorded as a single moment (askCanvas → withExchange) once it lands.
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || !uid || !canvasId || sendingRef.current || !canvasRef.current) return;
      sendingRef.current = true;
      const epoch = epochRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      streamedRef.current = "";
      setPendingText(text);
      setInput("");
      setLastError(null);
      setSending(true);
      setStreamingText("");
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

      const settle = (fn: () => void) => {
        fn();
        sendingRef.current = false;
        setSending(false);
      };

      void askCanvas(uid, canvasRef.current, text, {
        signal: controller.signal,
        onDelta: (accumulated) => {
          if (epochRef.current !== epoch) return;
          streamedRef.current = accumulated;
          setStreamingText(accumulated);
        },
      })
        .then((result) => {
          if (epochRef.current !== epoch) return;
          if (controller.signal.aborted) {
            const partial = streamedRef.current.trim();
            settle(() => {
              setStreamingText("");
              if (partial && canvasRef.current) {
                // Stopped mid-answer: the reference keeps a half-answer rather than throwing it
                // away. askCanvas already returned without saving (no reply text), so the pair is
                // recorded here with the SAME building blocks askCanvas itself uses.
                const now = new Date().toISOString();
                const next = withExchange(canvasRef.current, { userText: text, assistantText: partial }, now, nextMomentId(canvasRef.current));
                canvasRef.current = next;
                setCanvas(next);
                void saveCanvas(uid, next);
              }
              setPendingText(null);
            });
            return;
          }
          if (!result.reply) {
            settle(() => {
              setStreamingText("");
              setLastError(result.errorText ?? "Something went wrong. Try again.");
              setInput(text);
            });
            return;
          }
          settle(() => {
            canvasRef.current = result.canvas;
            setCanvas(result.canvas);
            setStreamingText("");
            setPendingText(null);
          });
        })
        .catch(() => {
          if (epochRef.current !== epoch) return;
          settle(() => {
            setStreamingText("");
            setLastError("Something went wrong. Try again.");
            setInput(text);
          });
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
        });
    },
    [uid, canvasId],
  );

  // Send the front door's opening question exactly once per canvas id.
  useEffect(() => {
    if (!canvas || !uid || !canvasId || !askParam?.trim()) return;
    if (askSentForRef.current.has(canvasId)) return;
    askSentForRef.current.add(canvasId);
    if (canvas.moments.length === 0) capForFirstTurnRef.current = capability;
    send(askParam);
    // send/capability are stable enough for this one-shot effect; canvas is read for its
    // moments length only at the instant this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, uid, canvasId, askParam]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const handleSend = useCallback(() => send(input), [send, input]);

  // ---- header: title + the "…" actions menu -------------------------------------------------

  useEffect(() => {
    if (!canvas) return;
    setHeaderTitle(canvasLabel({ title: canvas.title, courseTitle: null, preview: lastThingSaid(canvas.moments) }));
  }, [canvas, setHeaderTitle]);

  useEffect(() => {
    const hasCanvas = Boolean(canvas);
    setHeaderRight(
      hasCanvas ? (
        <GlassSurface style={styles.actionsBtn} fallbackColor={c.glassPanel} tint={menuOpen ? c.accentFaint : undefined} shadow>
          <Pressable
            style={styles.actionsBtnInner}
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Canvas actions"
            accessibilityState={{ expanded: menuOpen }}
            testID="canvas-actions-btn"
          >
            <DotsIcon size={20} color={menuOpen ? c.accent : c.text2} />
          </Pressable>
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [canvas, menuOpen, c, styles, setHeaderRight]);

  // Both header slots belong to whichever screen is on top; clear them on the way out so the
  // next screen doesn't inherit this one's title/button for a frame.
  useEffect(() => {
    return () => {
      setHeaderTitle(null);
      setHeaderRight(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePin = useCallback(() => {
    if (!uid || !canvasId) return;
    const next = !pinned;
    setPinned(next);
    void setCanvasPinned(uid, canvasId, next);
  }, [uid, canvasId, pinned]);

  const handleRenameConfirm = useCallback(
    (value: string) => {
      setRenameOpen(false);
      if (!uid || !canvasId) return;
      void renameCanvas(uid, canvasId, value).then((saved) => {
        if (!saved) return;
        setCanvas((prev) => (prev ? { ...prev, title: saved } : prev));
        canvasRef.current = canvasRef.current ? { ...canvasRef.current, title: saved } : canvasRef.current;
        setHeaderTitle(saved);
      });
    },
    [uid, canvasId, setHeaderTitle],
  );

  const handlePickProject = useCallback(
    (id: string) => {
      if (!uid || !canvasId) return;
      setFolderId(id);
      void setCanvasFolder(uid, canvasId, id);
    },
    [uid, canvasId],
  );
  const handleRemoveFromProject = useCallback(() => {
    if (!uid || !canvasId) return;
    setFolderId(null);
    void setCanvasFolder(uid, canvasId, null);
  }, [uid, canvasId]);
  const handleNewProjectConfirm = useCallback(
    (name: string) => {
      setNewProjectOpen(false);
      if (!uid || !canvasId) return;
      void createFolder(uid, name).then((folder) => {
        if (!folder) return;
        setFolders((prev) => [...prev, folder]);
        setFolderId(folder.id);
        void setCanvasFolder(uid, canvasId, folder.id);
      });
    },
    [uid, canvasId],
  );
  const handleDelete = useCallback(() => {
    if (!uid || !canvasId) return;
    Alert.alert("Delete this canvas?", "It will be removed from your canvases on every device.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void deleteCanvas(uid, canvasId);
          router.replace("/");
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }, [uid, canvasId]);

  // ---- long-press → Copy ---------------------------------------------------------------------

  const handleLongPressReply = useCallback((x: number, y: number, text: string) => {
    setCopyAnchor({ x, y });
    setCopyText(text);
  }, []);
  const closeCopyMenu = useCallback(() => {
    setCopyAnchor(null);
    setCopyText(null);
  }, []);

  // Rows are computed unconditionally — including while signed out, where `canvas` is simply
  // null — so useScrollToNewest below is called on every render, never skipped by the early
  // return further down (React's rule: hooks can't be conditional on `uid`).
  const turns = canvas ? threadFromCanvas(canvas) : [];
  const rows: Row[] = turns.map((turn, index) => ({ id: turn.id, isFirstTurn: index === 0, kind: "turn" as const, turn }));
  if (pendingText !== null) {
    rows.push({ id: "__live__", isFirstTurn: turns.length === 0, kind: "live" as const });
  }
  rowIdsRef.current = rows.map((row) => row.id);

  useScrollToNewest(listRef, rows.length, contentTop + space(2));

  if (!uid) {
    return (
      <View style={[styles.flex, styles.signinWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]} testID="canvas-signin">
        <EmptyBlock title="Sign in to continue" body="Your canvases live in the cloud under your own account." />
        <MissionButton label="Sign in" variant="primary" testID="canvas-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  const composerBottomPad = keyboardUp ? space(3) : contentBottom - space(1);
  const listBottomInset = composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(2);
  const footerSpacer = Math.max(0, listHeight - listBottomInset - contentTop - space(2) - lastTurnHeight);
  const placeholder = turns.length > 0 || pendingText !== null ? "Follow up" : "Ask Nemesis";

  const liveTurn: CanvasThreadTurn | null =
    pendingText !== null
      ? { at: new Date().toISOString(), attached: [], id: "__live__", output: null, reply: streamingText, said: pendingText, saidVia: null, sources: [], visuals: [] }
      : null;
  const liveCapabilityLabel =
    capForFirstTurnRef.current && turns.length === 0 ? CAPABILITY_COPY[capForFirstTurnRef.current].label : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="canvas-screen">
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={[styles.listBody, { paddingBottom: listBottomInset, paddingTop: contentTop + space(2) }]}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ animated: false, offset: info.averageItemLength * info.index });
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ animated: true, index: info.index, viewOffset: contentTop + space(2), viewPosition: 0 });
              } catch {
                // give up quietly — content is still readable, just not auto-pinned
              }
            }, 120);
          }}
          renderItem={({ item }) => (
            <View
              onLayout={(e) => {
                rowHeights.current.set(item.id, e.nativeEvent.layout.height);
                measureLastTurn();
              }}
            >
              {item.kind === "turn" ? (
                <Reanimated.View entering={FadeIn.duration(220)}>
                  <CanvasTurn turn={item.turn!} onLongPressReply={handleLongPressReply} />
                </Reanimated.View>
              ) : (
                <View style={styles.liveWrap}>
                  <CanvasTurn turn={liveTurn!} capabilityLabel={liveCapabilityLabel} />
                  {sending && !streamingText ? (
                    <View style={styles.thinkingWrap}>
                      <ThinkingLine phase={THINKING_PHASE} testID="canvas-thinking-line" />
                    </View>
                  ) : null}
                  {lastError ? (
                    <Text style={styles.errorLine} testID="canvas-error">
                      {lastError}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={loading ? <ActivityIndicator style={styles.loadingSpinner} color={c.text3} /> : null}
          ListFooterComponent={rows.length > 0 ? <View style={{ height: footerSpacer }} /> : null}
        />
        <View style={[styles.composerRow, styles.composerFloat, { paddingBottom: composerBottomPad }]}>
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onStop={handleStop}
            sending={sending}
            placeholder={placeholder}
            inputRef={composerRef}
            testID="canvas-input"
            compact
          />
        </View>
        <CanvasActionsMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          topInset={insets.top}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onRename={() => setRenameOpen(true)}
          folders={folders}
          currentFolderId={folderId}
          onPickProject={handlePickProject}
          onRemoveFromProject={handleRemoveFromProject}
          onNewProject={() => setNewProjectOpen(true)}
          onDelete={handleDelete}
        />
        <TextPromptSheet
          visible={renameOpen}
          title="Rename canvas"
          initialValue={canvas?.title ?? ""}
          onConfirm={handleRenameConfirm}
          onClose={() => setRenameOpen(false)}
          testID="canvas-rename-sheet"
        />
        <TextPromptSheet
          visible={newProjectOpen}
          title="New project"
          placeholder="Project name"
          initialValue=""
          confirmLabel="Create"
          onConfirm={handleNewProjectConfirm}
          onClose={() => setNewProjectOpen(false)}
          testID="canvas-new-project-sheet"
        />
        <MiniMenu
          visible={copyAnchor !== null}
          anchor={copyAnchor}
          onClose={closeCopyMenu}
          actions={[
            {
              key: "copy",
              label: "Copy",
              onPress: () => {
                if (copyText) void Clipboard.setStringAsync(copyText);
                closeCopyMenu();
              },
            },
          ]}
          testID="canvas-reply-menu"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Pin the newest row (question + its answer, since a canvas turn is one row) near the top of
 *  the viewport as it grows — chat.tsx's own approach, mirrored: scrollToIndex can throw before
 *  a row is measured, so onScrollToIndexFailed above handles the retry.
 *
 *  🔴 `viewOffset` IS THE TOP BAR. The TopBar is an overlay, so the list's y=0 sits UNDER it;
 *  `viewPosition: 0` alone parked the question behind the header and the answer's first line was
 *  the first thing visible (seen on the simulator, 2026-09-01). The offset is the same clearance
 *  the list's own paddingTop uses. */
function useScrollToNewest(listRef: RefObject<FlatList<Row> | null>, rowCount: number, topInset: number) {
  useEffect(() => {
    const idx = rowCount - 1;
    if (idx < 0) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ animated: true, index: idx, viewOffset: topInset, viewPosition: 0 });
      } catch {
        // list not ready — onScrollToIndexFailed handles the retry
      }
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);
}

/** Horizontal "…" for the TopBar canvas-actions button — same glyph chat.tsx draws locally for
 *  the same button, kept local here for the same reason (it's a one-off, not shared chrome). */
function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    signinWrap: { alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    listBody: { paddingHorizontal: space(4), gap: space(3), flexGrow: 1 },
    liveWrap: { gap: space(1.5) },
    thinkingWrap: { paddingHorizontal: space(0.5), paddingVertical: space(1) },
    errorLine: { ...type.small, color: c.text3, paddingHorizontal: space(0.5) },
    loadingSpinner: { marginTop: space(8) },
    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },
    composerFloat: { position: "absolute", bottom: 0, left: 0, right: 0 },
    actionsBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, borderWidth: 1, borderColor: c.line },
    actionsBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
