import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
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
import { CanvasAttachMenu } from "@/components/canvas/CanvasAttachMenu";
import { CanvasFindBar } from "@/components/canvas/CanvasFindBar";
import { CanvasHeaderPill } from "@/components/canvas/CanvasHeaderPill";
import { CanvasReplyMenu } from "@/components/canvas/CanvasReplyMenu";
import { speakText, type SpeakHandle } from "@/api/speak";
import { CanvasTurn } from "@/components/canvas/CanvasTurn";
import { ScrollToBottomButton } from "@/components/canvas/ScrollToBottomButton";
import { UploadedFilesSheet } from "@/components/canvas/UploadedFilesSheet";
import { useCanvasIntake } from "@/components/canvas/useCanvasIntake";
import { Composer, COMPOSER_COMPACT_HEIGHT } from "@/components/Composer";
import type { MenuAnchor } from "@/components/MiniMenu";
import { NemesisAvatar } from "@/components/NemesisAvatar";
import { TextPromptSheet } from "@/components/RowActionSheets";
import { SourcesSheet, type SourceLike } from "@/components/SourcesSheet";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ThinkingLine } from "@/components/ThinkingLine";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { animationForTurnState } from "@/lib/avatar-animation";
import { filterTurnsByQuery } from "@/lib/canvas-find";
import { capabilityFromParam, firstParam } from "@/lib/canvas-screen";
import { runCanvasTurn } from "@/api/canvas-turn";
import { canvasLabel, newCanvas, threadFromCanvas, type Folder } from "@/lib/canvases";
import type { NumberedSource } from "@/lib/turn-text";
import { CHARACTER_SILHOUETTE } from "@/learn/avatar";
import { lastThingSaid, type CanvasThreadTurn, type ComposerCapability, type LearningCanvas } from "@/learn/web";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

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
/** Room the find bar's own height (40) plus its top margin needs below the header, so the
 *  list's first row doesn't render underneath it once "Find in chat" opens. */
const FIND_BAR_CLEARANCE = 56;
/** The web's own measured `DOCK_SIZE` (`components/character/character-dock.tsx`) — the
 *  character never got a phone-specific size of its own, so it keeps the one the owner
 *  already sized twice ("make the mascot bigger in the app"). */
const CHARACTER_DOCK_SIZE = 76;

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

  const params = useLocalSearchParams<{
    c?: string | string[];
    ask?: string | string[];
    cap?: string | string[];
    /** A Library note the document viewer asked to carry along (document.tsx's `onSend`). */
    note?: string | string[];
    /** A project the front door (project.tsx) or LearnHome asked this canvas to be filed into. */
    folder?: string | string[];
  }>();
  const canvasId = firstParam(params.c);
  const askParam = firstParam(params.ask);
  const noteParam = firstParam(params.note);
  const routeFolderParam = firstParam(params.folder);
  const capability = capabilityFromParam(params.cap);

  const [canvas, setCanvas] = useState<LearningCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // The composer's "+" — attach a Library note, a file or a photo mid-session (item 6 of this
  // pass; see CanvasAttachMenu.tsx). Distinct from `menuOpen`, the "…" header menu.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const [input, setInput] = useState("");
  // The learner's just-sent words, drawn immediately — before the pair is even a moment in
  // `canvas.moments`, let alone saved. Cleared once the exchange lands in `canvas` (success) or
  // is abandoned outright (a Stop with nothing streamed yet); kept on an error so the failed
  // question stays on screen with the retry line under it.
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  // The long-press-on-a-reply menu (item 8) — both a long press AND the action row's "…" land
  // here (CanvasTurn's onLongPressReply prop), carrying the whole turn so the menu can show its
  // timestamp and Retry can re-ask its words.
  const [replyMenuAnchor, setReplyMenuAnchor] = useState<MenuAnchor | null>(null);
  const [replyMenuTurn, setReplyMenuTurn] = useState<CanvasThreadTurn | null>(null);
  /** The reply being read aloud, if any — one at a time, stopped by a second press or on leaving. */
  const speakRef = useRef<SpeakHandle | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [sourcesFor, setSourcesFor] = useState<readonly SourceLike[] | null>(null);
  const [uploadedFilesOpen, setUploadedFilesOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  // Shows the ↓ disc once the learner has scrolled away from the newest content (item 7).
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const canvasRef = useRef<LearningCanvas | null>(null);

  /** Whether a row for this canvas exists in the cloud yet — false for a front-door canvas until its first save. */

  /** What the turn is doing right now, in its own words ("Searching the web"), or null. */
  const [turnStatus, setTurnStatus] = useState<string | null>(null);
  /** The sites this turn has read so far — the favicon chips beside the status line. */
  const [searchHosts, setSearchHosts] = useState<readonly string[]>([]);
  /** Pages a turn answered in this sitting stood on, by moment id. The log stores text only
   *  (the web's rule: a restored turn is text), so sources live for the session, as on the web. */
  const [liveSources, setLiveSources] = useState<Record<string, NumberedSource[]>>({});
  const savedRef = useRef(false);
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
    savedRef.current = false;
    void loadCanvas(uid, canvasId).then((loaded) => {
      if (epochRef.current !== epoch) return;
      savedRef.current = loaded !== null;
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

  /**
   * File this canvas into a project (null = unfile).
   *
   * 🔴 A FRONT-DOOR CANVAS HAS NO ROW UNTIL ITS FIRST SAVE, and an UPDATE on a row that is not
   * there matches nothing and says nothing — the web's `setCanvasFolder` comment records exactly
   * this. So an unsaved canvas is saved first (an empty row the first turn will fill), and the
   * write's own answer decides what the menu shows: false puts the old value back.
   *
   * 🔴 DEFINED HERE, ABOVE THE ATTACH INTAKE HOOK BELOW, RATHER THAN NEAR THE OTHER PROJECT
   * HANDLERS. `useCanvasIntake` needs it (to file a canvas the front door pointed at a project),
   * and a `const` has to exist before the call that closes over it — moving the other three
   * project handlers up too would have scattered them away from the menu they belong to for no
   * reason, since none of them are needed this early.
   */
  const fileInto = useCallback(
    async (next: string | null) => {
      if (!uid || !canvasId) return;
      const previous = folderId;
      setFolderId(next);
      if (!savedRef.current && canvasRef.current) {
        savedRef.current = await saveCanvas(uid, canvasRef.current);
      }
      const filed = savedRef.current ? await setCanvasFolder(uid, canvasId, next) : false;
      if (!filed) setFolderId(previous);
    },
    [uid, canvasId, folderId],
  );

  // Material this canvas owes on open — front-door attachments (LearnHome's staged chips) and a
  // Library note the document viewer carried along (`?note=`) — plus filing into a project the
  // front door chose (`?folder=`). See useCanvasIntake.ts's own header for why `attachReady` has
  // to be real state rather than merely "this effect ran before that one".
  const adoptAttachedCanvas = useCallback((next: LearningCanvas) => {
    savedRef.current = true;
    canvasRef.current = next;
    setCanvas(next);
  }, []);
  const { attachReady } = useCanvasIntake({
    canvas,
    canvasId,
    folderId: routeFolderParam,
    noteId: noteParam,
    onAttached: adoptAttachedCanvas,
    uid,
    fileInto,
  });

  // One exchange: the learner's words go out, the reply streams back into `streamingText`, and
  // the pair is recorded as a single moment (runCanvasTurn → withExchange) once it lands.
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
      // 🔴 NOT scrollToEnd. This used to race useScrollToNewest's scrollToIndex+viewOffset
      // below: scrollToEnd jumps to the literal bottom of the list (past the live row, into
      // the footer spacer), and only on turn 1 — where there's nothing above to jump past —
      // did that happen to land in the same place scrollToIndex would put it. From turn 2 on
      // it fought the pin-under-header behavior every send. useScrollToNewest now owns all
      // of this screen's "scroll to the newest question" scrolling.

      const settle = (fn: () => void) => {
        fn();
        sendingRef.current = false;
        setSending(false);
        setTurnStatus(null);
        setSearchHosts([]);
      };

      setTurnStatus(null);
      void runCanvasTurn(uid, canvasRef.current, text, {
        signal: controller.signal,
        capability: canvasRef.current.moments.length === 0 ? capForFirstTurnRef.current : null,
        onDelta: (prose) => {
          if (epochRef.current !== epoch) return;
          streamedRef.current = prose;
          setStreamingText(prose);
        },
        // The web's two beats: the request is out, then the pages are in hand.
        onSearching: (found, domains) => {
          if (epochRef.current !== epoch) return;
          setTurnStatus(found === null ? "Searching the web" : `Read ${found} ${found === 1 ? "website" : "websites"}`);
          setSearchHosts(domains);
        },
        onMilestones: (milestones) => {
          if (epochRef.current !== epoch) return;
          setTurnStatus((current) => current ?? milestones[0] ?? null);
        },
      })
        .then((result) => {
          if (epochRef.current !== epoch) return;
          if (result.aborted || controller.signal.aborted) {
            // Stopped mid-answer. runCanvasTurn already recorded the half-answer (once) when there was
            // one; the screen adopts the canvas it returned and records nothing itself — a second
            // save here, from this screen's older copy, is how a Stop overwrote a fresh row
            // (review finding, 2026-09-01).
            settle(() => {
              setStreamingText("");
              if (result.reply) {
                savedRef.current = true;
                canvasRef.current = result.canvas;
                setCanvas(result.canvas);
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
            savedRef.current = true;
            canvasRef.current = result.canvas;
            setCanvas(result.canvas);
            setStreamingText("");
            setPendingText(null);
            setTurnStatus(null);
            const answered = result.canvas.moments.at(-1)?.id;
            const stood = result.sources.length ? result.sources : result.consulted;
            if (answered && stood.length) setLiveSources((prev) => ({ ...prev, [answered]: stood }));
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
  //
  // 🔴🔴 WAITS FOR `attachReady`. A document dropped on the front door (or an attached Library
  // note riding `?note=`) is still uploading/parsing while this would otherwise fire — sending
  // now means the packet goes out built from a `canvas` with no sources, and the model answers
  // "I don't see any document attached yet" over material that was about to attach perfectly
  // (the web's own production incident, 2026-08-31, `use-canvas-session.ts`'s `settledAttachments`
  // comment). `attachReady` starts false and flips true almost immediately when there is nothing
  // to attach, so the common case pays one extra render, not a visible delay.
  useEffect(() => {
    if (!canvas || !uid || !canvasId || !askParam?.trim() || !attachReady) return;
    if (askSentForRef.current.has(canvasId)) return;
    askSentForRef.current.add(canvasId);
    if (canvas.moments.length === 0) capForFirstTurnRef.current = capability;
    send(askParam);
    // send/capability are stable enough for this one-shot effect; canvas is read for its
    // moments length only at the instant this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, uid, canvasId, askParam, attachReady]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const handleSend = useCallback(() => send(input), [send, input]);

  // ---- header: the compose+"…" pill, no title --------------------------------------------
  //
  // The reference's chat header carries NO title (IMG_6532/6551) — headerTitle is left null
  // (chat.tsx and every other screen still set theirs; this one deliberately doesn't). The
  // canvas's own name still exists — canvasLabel below — it just moves into the "…" menu's
  // 13pt header line (CanvasActionsMenu's `title` prop) instead of the TopBar.
  const canvasTitle = canvas ? canvasLabel({ title: canvas.title, courseTitle: null, preview: lastThingSaid(canvas.moments) }) : "";

  useEffect(() => {
    const hasCanvas = Boolean(canvas);
    setHeaderRight(
      hasCanvas ? (
        <CanvasHeaderPill onCompose={() => router.push("/")} onMenu={() => setMenuOpen((v) => !v)} menuOpen={menuOpen} />
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [canvas, menuOpen, setHeaderRight]);

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
        // No setHeaderTitle here — this screen's header carries no title (see the header
        // effect above); the new name shows up in the "…" menu's own title line instead,
        // which re-derives from `canvas` on its own.
      });
    },
    [uid, canvasId],
  );

  const handlePickProject = useCallback((id: string) => void fileInto(id), [fileInto]);
  const handleRemoveFromProject = useCallback(() => void fileInto(null), [fileInto]);
  const handleNewProjectConfirm = useCallback(
    (name: string) => {
      setNewProjectOpen(false);
      if (!uid) return;
      void createFolder(uid, name).then((folder) => {
        if (!folder) return;
        setFolders((prev) => [...prev, folder]);
        void fileInto(folder.id);
      });
    },
    [uid, fileInto],
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

  // ---- the reply menu: long-press OR the action row's "…" (item 8) ------------------------

  const handleOpenReplyMenu = useCallback((x: number, y: number, turn: CanvasThreadTurn) => {
    setReplyMenuAnchor({ x, y });
    setReplyMenuTurn(turn);
  }, []);
  const closeReplyMenu = useCallback(() => {
    setReplyMenuAnchor(null);
    setReplyMenuTurn(null);
  }, []);
  const handleCopyReply = useCallback(() => {
    if (replyMenuTurn?.reply) void Clipboard.setStringAsync(replyMenuTurn.reply);
  }, [replyMenuTurn]);
  const stopReading = useCallback(() => {
    speakRef.current?.stop();
    speakRef.current = null;
    setSpeaking(false);
  }, []);
  // Read Aloud: the web's own request to nemesis-speak, played chunk by chunk. A second press
  // stops it; so does leaving the screen (the cleanup below).
  const handleReadAloud = useCallback(() => {
    if (__DEV__) console.log("[read-aloud] pressed", { uid: Boolean(uid), chars: replyMenuTurn?.reply?.length ?? 0, speaking: Boolean(speakRef.current) });
    if (speakRef.current) {
      stopReading();
      return;
    }
    const reply = replyMenuTurn?.reply;
    if (!uid || !reply) return;
    setSpeaking(true);
    speakText(uid, reply)
      .then((handle) => {
        speakRef.current = handle;
        return handle.done;
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn("[read-aloud]", error);
        setLastError(error instanceof Error ? error.message : "Couldn't read that aloud.");
      })
      .finally(() => {
        speakRef.current = null;
        setSpeaking(false);
      });
  }, [uid, replyMenuTurn, stopReading]);
  useEffect(() => () => speakRef.current?.stop(), []);
  /**
   * Retry: drop the last moment (the web's own shape for "re-run the last exchange" — a
   * repeat is never appended as a second moment, `withExchange`'s `sameMoment` guard already
   * relies on the SAME thing) and ask again with the same words.
   *
   * 🔴 THE SAVE MUST LAND BEFORE THE RE-ASK. `runCanvasTurn` reloads the canvas fresh from the
   * server itself (`recordExchange`'s `loadCanvas`) rather than trusting what this screen
   * already has in memory — so if the truncated canvas hasn't been written yet, the reload
   * would still see the old, un-dropped moment and Retry would land as a THIRD turn instead
   * of replacing the second. Awaiting saveCanvas before send() is what keeps it a replace.
   */
  const handleRetry = useCallback(() => {
    const turn = replyMenuTurn;
    if (!uid || !canvasId || !canvasRef.current || !turn?.said) return;
    const dropped: LearningCanvas = { ...canvasRef.current, moments: canvasRef.current.moments.slice(0, -1) };
    canvasRef.current = dropped;
    setCanvas(dropped);
    void saveCanvas(uid, dropped).then(() => send(turn.said!));
  }, [uid, canvasId, replyMenuTurn, send]);

  // Rows are computed unconditionally — including while signed out, where `canvas` is simply
  // null — so useScrollToNewest below is called on every render, never skipped by the early
  // return further down (React's rule: hooks can't be conditional on `uid`).
  const turns = canvas
    ? threadFromCanvas(canvas).map((turn) => {
        const stood = liveSources[turn.id];
        return stood ? { ...turn, sources: stood } : turn;
      })
    : [];

  const handleShareTranscript = useCallback(() => {
    const text = turns
      .map((t) => [t.said?.trim() ? `You: ${t.said.trim()}` : null, t.reply.trim() || null].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");
    if (text) void Share.share({ message: text }).catch(() => {});
  }, [turns]);

  // "Find in chat" (item 6): hides every turn whose question and answer both miss the query.
  // The live row (a reply still streaming in) is never filtered — there's nothing finished to
  // search yet, and hiding it mid-stream would look like the reply vanished.
  const visibleTurns = findQuery.trim() ? filterTurnsByQuery(turns, findQuery) : turns;
  const rows: Row[] = visibleTurns.map((turn, index) => ({ id: turn.id, isFirstTurn: index === 0, kind: "turn" as const, turn }));
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
  // The last answer's action row (36pt) must clear the composer at the end of the scroll — seen sitting
  // under the card on the simulator, 2026-09-01.
  // …and the character's dock above the composer (it never reserves space in the list, so the
  // list reserves room for it instead — otherwise it sat on the last answer's action row).
  const listBottomInset = composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(2) + 36 + space(2) + CHARACTER_DOCK_SIZE;
  const footerSpacer = Math.max(0, listHeight - listBottomInset - contentTop - space(2) - lastTurnHeight);
  const placeholder = turns.length > 0 || pendingText !== null ? "Follow up" : "Ask Nemesis";

  const liveTurn: CanvasThreadTurn | null =
    pendingText !== null
      ? { at: new Date().toISOString(), attached: [], id: "__live__", output: null, reply: streamingText, said: pendingText, saidVia: null, sources: [], visuals: [] }
      : null;
  // The raw capability, not its resolved label — CanvasTurn picks its own icon + label text
  // from it now (CAPABILITY_COPY + a local icon map), so the two can never disagree.
  const liveCapability = capForFirstTurnRef.current && turns.length === 0 ? capForFirstTurnRef.current : null;
  const uploadedFileTitles = canvas?.sources.map((s) => s.title) ?? [];

  // Near enough the bottom that the ↓ disc would be redundant — a little more than one
  // composer's height, so it doesn't flicker in in the last few points of a normal scroll.
  const NEAR_BOTTOM_PX = 160;
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setShowScrollToBottom(distanceFromBottom > NEAR_BOTTOM_PX);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="canvas-screen">
        <FlatList
          ref={listRef}
          data={rows}
          // Index, not the row's own id: a canvas's turns are append-only (the same slot never
          // holds a different EARLIER turn), but the row AT a slot changes identity mid-send —
          // "__live__" while streaming, the landed turn's real moment id once it settles. Keying
          // by id made FlatList treat that as a totally different row and remount it, silently
          // eating whatever scroll position useScrollToNewest had just set (found by tracing
          // why the pin-under-header only ever looked reliable on a turn's first send).
          keyExtractor={(_row, index) => String(index)}
          contentContainerStyle={[
            styles.listBody,
            { paddingBottom: listBottomInset, paddingTop: contentTop + space(2) + (findOpen ? FIND_BAR_CLEARANCE : 0) },
          ]}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          onScroll={handleScroll}
          scrollEventThrottle={100}
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
                  <CanvasTurn turn={item.turn!} onLongPressReply={handleOpenReplyMenu} onOpenSources={setSourcesFor} />
                </Reanimated.View>
              ) : (
                <View style={styles.liveWrap}>
                  <CanvasTurn turn={liveTurn!} capability={liveCapability} live />
                  {sending && !streamingText ? (
                    <View style={styles.thinkingWrap}>
                      <ThinkingLine phase={THINKING_PHASE} label={turnStatus} hosts={searchHosts} testID="canvas-thinking-line" />
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
        {showScrollToBottom ? (
          <ScrollToBottomButton bottom={composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(3)} onPress={() => listRef.current?.scrollToEnd({ animated: true })} />
        ) : null}
        {findOpen ? (
          <CanvasFindBar
            value={findQuery}
            onChangeText={setFindQuery}
            onClose={() => { setFindOpen(false); setFindQuery(""); }}
            top={insets.top + space(2) + 44 + space(1.5)}
          />
        ) : null}
        {/* The character, parked lower-left above the composer — the web's `character-dock.tsx`
            placement, ported without its pointer-tracking and walk-to-centre choreography (the
            phone has no cursor and this screen has no front-door greeting moment). Fixed, never
            part of the FlatList's layout, `pointer-events: none` so it can never steal a tap
            meant for the composer behind it, and hidden while the keyboard is up — there is no
            room for it above a composer the keyboard has pushed to the middle of the screen. */}
        {!keyboardUp ? (
          <View
            pointerEvents="none"
            style={[styles.characterDock, { bottom: composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(2) }]}
          >
            <NemesisAvatar
              animation={animationForTurnState(sending ? "sending" : "idle")}
              ink={c.accent}
              eye={c.bg}
              size={CHARACTER_DOCK_SIZE}
              silhouette={CHARACTER_SILHOUETTE}
            />
          </View>
        ) : null}
        <View style={[styles.composerRow, styles.composerFloat, { paddingBottom: composerBottomPad }]}>
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onStop={handleStop}
            onPlus={() => setAttachMenuOpen((open) => !open)}
            sending={sending}
            placeholder={placeholder}
            inputRef={composerRef}
            testID="canvas-input"
            compact
          />
        </View>
        <CanvasAttachMenu
          visible={attachMenuOpen}
          onClose={() => setAttachMenuOpen(false)}
          bottomOffset={composerBottomPad + COMPOSER_COMPACT_HEIGHT + space(2)}
          uid={uid}
          canvas={canvas}
          onAttached={adoptAttachedCanvas}
        />
        <CanvasActionsMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          topInset={insets.top}
          title={canvasTitle}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onRename={() => setRenameOpen(true)}
          onShare={handleShareTranscript}
          onFindInChat={() => setFindOpen(true)}
          onUploadedFiles={() => setUploadedFilesOpen(true)}
          hasUploadedFiles={uploadedFileTitles.length > 0}
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
        <UploadedFilesSheet visible={uploadedFilesOpen} onClose={() => setUploadedFilesOpen(false)} titles={uploadedFileTitles} />
        <SourcesSheet visible={sourcesFor !== null} onClose={() => setSourcesFor(null)} sources={sourcesFor ? [...sourcesFor] : []} />
        <CanvasReplyMenu
          visible={replyMenuAnchor !== null}
          anchor={replyMenuAnchor}
          at={replyMenuTurn?.at ?? null}
          onClose={closeReplyMenu}
          onCopy={handleCopyReply}
          onReadAloud={handleReadAloud}
          speaking={speaking}
          onRetry={handleRetry}
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
    characterDock: { position: "absolute", left: space(3) },
  });
