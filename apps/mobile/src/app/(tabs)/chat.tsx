import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/auth/AuthProvider";
import {
  deleteThread,
  isThreadPinned,
  listThreads,
  loadThreadMessages,
  loadThreadOutputs,
  newThreadId,
  pinThread,
  saveThreadMessages,
  sendChat,
} from "@/api/chat";
import type { CloudLibraryNote } from "@/api/cloudLibrary";
import { useShell } from "@/components/AppDrawer";
import { AttachLibrarySheet } from "@/components/AttachLibrarySheet";
import { Composer, COMPOSER_PILL_HEIGHT } from "@/components/Composer";
import { ComposerPlusMenu } from "@/components/ComposerPlusMenu";
import { DeliverableChipRow, DeliverableSheet } from "@/components/DeliverableSheet";
import { GlassSurface } from "@/components/GlassSurface";
import { CloseIcon } from "@/components/icons";
import { MessageBody } from "@/components/MessageBody";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { SourcesPill, SourcesSheet } from "@/components/SourcesSheet";
import { ThinkingDots } from "@/components/ThinkingDots";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import { withAttachmentNote, type BudgetResetKind, type ChatMsg, type ChatOutput, type ChatSource } from "@/lib/chat-thread";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Chat (cloud-first pivot, P1a): the phone's standalone surface — straight to the
// metered cloud engine, no Mac in the path. Conversations now PERSIST as separate
// threads that show up in the drawer (ChatGPT-style history); the active thread is
// carried in the route param `c` so tapping a chat in the sidebar reopens it and
// "New chat" opens a fresh one. Opening the tab with no param resumes the most
// recent thread. User turns render as bubbles; the assistant renders as full-width
// markdown with NO bubble (owner call — reads like Claude/ChatGPT).
//
// State rules (review findings): everything is keyed to the signed-in user; an
// epoch guard means a user switch, a thread switch, or an unmount can never
// resurrect a stale thread's messages onto the screen.

const THINKING_ID = "__thinking__";

interface Row {
  id: string;
  kind: "error" | "msg" | "thinking";
  msg?: ChatMsg;
  errorText?: string;
}

export default function ChatScreen() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setHeaderTitle, newChat, setHeaderRight } = useShell();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // The active thread rides in the route param so the drawer/TopBar can steer it.
  const params = useLocalSearchParams<{ c?: string }>();
  const routeThreadId = Array.isArray(params.c) ? params.c[0] : params.c;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastError, setLastError] = useState<null | string>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // The in-flight assistant reply's text so far — rendered live into the same
  // "msg" row shape as a finished answer (owner: streaming §6), so it gets the
  // exact same FadeIn + markdown treatment with no separate render path.
  const [streamingText, setStreamingText] = useState("");
  // Pinned state of the active thread (drives the "…" menu's Pin/Unpin label) and
  // whether that menu is open.
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgrade, setUpgrade] = useState<null | { message: string | null; reset: BudgetResetKind | null }>(null);
  // Session-level deliverables (chat_threads.meta.outputs — e.g. a web
  // Record-mode recording) for the open thread; chip row at the top of the
  // transcript. See api/chat.ts's loadThreadOutputs doc for why the phone
  // only ever reads these, never creates them.
  const [threadOutputs, setThreadOutputs] = useState<ChatOutput[]>([]);
  // Composer "+" mini menu (owner: attach a Library doc, or toggle deep
  // research) and the two things it opens/toggles.
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  // One Library doc attached as context for the NEXT send only — cleared once
  // that turn is sent (see send()'s attachedDoc capture). Deep research is the
  // opposite: a persistent toggle the student switches off themselves.
  const [attachedDoc, setAttachedDoc] = useState<{ title: string; content: string } | null>(null);
  const [deepResearchOn, setDeepResearchOn] = useState(false);
  // Which message's sources/deliverable is showing in its bottom-up sheet, if any.
  const [sourcesSheetFor, setSourcesSheetFor] = useState<ChatSource[] | null>(null);
  const [deliverableSheetFor, setDeliverableSheetFor] = useState<ChatOutput | null>(null);
  // Epoch bumps on user change AND thread change; in-flight sends compare before
  // touching state. sendingRef is the synchronous re-entrancy lock.
  const epochRef = useRef(0);
  const sendingRef = useRef(false);
  const listRef = useRef<FlatList<Row>>(null);
  const composerRef = useRef<TextInput>(null);
  // The newest user-message row index — the row we pin to the top after a send / on
  // thread open. Set during render below, read by the scroll effect (kept out of its
  // deps this way).
  const lastUserRowIndexRef = useRef(-1);

  // Load the active thread: the route's `c` if present, else the most recent
  // thread (resume), else a brand-new empty thread. Re-runs on user/thread change.
  useEffect(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setStreamingText("");
    setMessages([]);
    setLastError(null);
    setInput("");
    setPinned(false);
    setMenuOpen(false);
    setThreadOutputs([]);
    setPlusMenuOpen(false);
    setLibraryPickerOpen(false);
    setAttachedDoc(null);
    setDeepResearchOn(false);
    setSourcesSheetFor(null);
    setDeliverableSheetFor(null);
    if (!uid) {
      setThreadId(null);
      return;
    }
    const epoch = epochRef.current;
    let alive = true;
    void (async () => {
      let id = routeThreadId ?? null;
      if (!id) {
        const summaries = await listThreads(uid);
        if (!alive || epochRef.current !== epoch) return;
        id = summaries[0]?.id ?? newThreadId();
      }
      const loaded = await loadThreadMessages(uid, id);
      if (!alive || epochRef.current !== epoch) return;
      setThreadId(id);
      setMessages(loaded);
      void isThreadPinned(uid, id).then((p) => {
        if (alive && epochRef.current === epoch) setPinned(p);
      });
      void loadThreadOutputs(uid, id).then((outputs) => {
        if (alive && epochRef.current === epoch) setThreadOutputs(outputs);
      });
    })();
    return () => {
      alive = false;
    };
  }, [uid, routeThreadId]);

  // Refresh the open thread from the cloud when the app returns to the
  // foreground (§6: "list refresh on open + app foreground") — this is what
  // picks up a message sent from web (or another session) while this phone
  // was in the background. The drawer already refreshes the sidebar list
  // every time it opens (see AppDrawer.tsx), so that half needs no change here.
  useEffect(() => {
    if (!uid || !threadId) return;
    const epoch = epochRef.current;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || sendingRef.current) return; // never clobber an in-flight turn
      void loadThreadMessages(uid, threadId).then((loaded) => {
        if (epochRef.current === epoch) setMessages(loaded);
      });
    });
    return () => sub.remove();
  }, [uid, threadId]);

  // TopBar: no centered chat/session title in a chat (owner 2026-07-20 — "remove
  // the centered top chat/session title in a chat"). Always blank; only the "…"
  // actions menu (see the setHeaderRight effect below) occupies the header.
  // headerTitle itself is still driven by OTHER screens (Library/Study/
  // Notebooks tabs, notebook.tsx's own header) — this only clears what THIS
  // screen contributes, on mount and again on unmount.
  useEffect(() => {
    setHeaderTitle(null);
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !uid || !threadId || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = epochRef.current;
    const history = messages;
    const id = threadId;
    // Captured once at send time — attach is one-shot (cleared right below,
    // same turn), deep research is a persistent toggle the student switches
    // off themselves (NOT cleared here). Both ride into sendChat's options,
    // never into the persisted/displayed ChatMsg.content itself.
    const doc = attachedDoc;
    const research = deepResearchOn;
    const userMsg: ChatMsg = { at: new Date().toISOString(), content: withAttachmentNote(text, doc?.title ?? null), role: "user" };
    const base = [...history, userMsg];
    setMessages(base);
    setLastError(null);
    setInput("");
    setAttachedDoc(null);
    setSending(true);
    setStreamingText("");
    // Persist the user turn immediately so the thread shows in the sidebar even
    // if the reply never lands.
    void saveThreadMessages(uid, id, base);
    void sendChat(uid, history, text, {
      attachedDoc: doc ? { content: doc.content, title: doc.title } : undefined,
      forceResearch: research,
      onDelta: (_delta, accumulated) => {
        // Renders live into the assistant row as chunks arrive; stale turns
        // (thread/user switched mid-stream) are dropped by the epoch guard.
        if (epochRef.current === epoch) setStreamingText(accumulated);
      },
    })
      .then((reply) => {
        if (epochRef.current !== epoch) return;
        if (reply.text) {
          const next: ChatMsg[] = [
            ...base,
            {
              at: new Date().toISOString(),
              content: reply.text,
              role: "assistant",
              ...(reply.sources.length ? { sources: reply.sources } : {}),
            },
          ];
          setMessages(next);
          void saveThreadMessages(uid, id, next);
        } else {
          // The user's message stays (it IS the conversation); the failure line
          // renders from transient state and never enters history/persistence.
          setLastError(reply.errorText ?? "Something went wrong.");
          // Credits ran dry → the freemium moment: hard stop, upgrade or wait.
          if (reply.errorKind === "budget") {
            setUpgrade({ message: reply.errorText, reset: reply.budgetReset });
          }
        }
      })
      .finally(() => {
        if (epochRef.current === epoch) {
          sendingRef.current = false;
          setSending(false);
          setStreamingText("");
        }
      });
  }, [input, messages, uid, threadId, attachedDoc, deepResearchOn]);

  // "…" menu actions.
  const handleDelete = useCallback(() => {
    if (!uid || !threadId) return;
    setMenuOpen(false);
    void deleteThread(uid, threadId).then(() => {
      // Leave the just-deleted thread: replace with /chat (no param) so it resumes the
      // most-recent remaining conversation — or a fresh one if none — and Back can't
      // return to the dead thread.
      router.replace("/chat");
    });
  }, [uid, threadId]);

  const handleTogglePin = useCallback(() => {
    if (!uid || !threadId) return;
    const next = !pinned;
    setPinned(next); // optimistic; the store write is best-effort
    void pinThread(uid, threadId, next);
  }, [uid, threadId, pinned]);

  // Publish the "…" actions button into the TopBar's right slot once the thread has
  // messages (an empty new chat has nothing to pin/delete). It toggles `menuOpen`; the
  // dropdown itself renders below in the page layer, so it stays crisp under the
  // status-bar blur. Cleared when empty and on unmount.
  useEffect(() => {
    const hasThread = messages.length > 0;
    setHeaderRight(
      hasThread ? (
        <GlassSurface style={styles.actionsBtn} fallbackColor={c.glassPanel} tint={menuOpen ? c.accentFaint : undefined}>
          <Pressable
            style={styles.actionsBtnInner}
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Chat actions"
            accessibilityState={{ expanded: menuOpen }}
            testID="chat-actions-btn"
          >
            <DotsIcon size={20} color={menuOpen ? c.accent : c.text2} />
          </Pressable>
        </GlassSurface>
      ) : null,
    );
    return () => setHeaderRight(null);
  }, [messages.length, menuOpen, c, styles, setHeaderRight]);

  // Pin the newest user question to the top after a send and on thread open (owner
  // 2026-07-18: your prompt sits at the top, the thinking/answer grows below it and to
  // the left). Keyed on the message COUNT so it fires once per turn; scrollToIndex can
  // throw before a row is measured, so the list's onScrollToIndexFailed retries.
  useEffect(() => {
    const idx = lastUserRowIndexRef.current;
    if (idx < 0) return;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ animated: true, index: idx, viewPosition: 0 });
      } catch {
        // list not ready — onScrollToIndexFailed handles the retry
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Spring the keyboard up whenever the chat screen comes into focus (owner 2026-07-19).
  // The short delay lets the screen settle so the focus reliably raises the keyboard.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => composerRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }, []),
  );

  if (!uid) {
    return (
      <View
        style={[styles.flex, styles.signinWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}
        testID="chat-signin"
      >
        <EmptyBlock title="Sign in to chat" body="Chat answers from the cloud under your own plan — no Mac needed once you're signed in." />
        <MissionButton label="Sign in" variant="primary" testID="chat-goto-signin" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  const rows: Row[] = messages.map((msg, index) => ({ id: `m-${index}`, kind: "msg", msg }));
  if (lastError) rows.push({ errorText: lastError, id: "__error__", kind: "error" });
  if (sending) {
    // Dots until the first chunk lands, then the SAME "msg" row shape as a
    // finished answer — same key throughout, so FadeIn plays once (on that
    // transition) rather than replaying per chunk as the text grows.
    rows.push(
      streamingText
        ? { id: THINKING_ID, kind: "msg", msg: { at: "", content: streamingText, role: "assistant" } }
        : { id: THINKING_ID, kind: "thinking" },
    );
  }
  const hasContent = rows.length > 0;
  // The newest user-message row — what the scroll effect pins to the top. Computed here
  // in render and stashed in a ref so that effect needn't depend on `rows`.
  lastUserRowIndexRef.current = rows.reduce(
    (acc, row, i) => (row.kind === "msg" && row.msg?.role === "user" ? i : acc),
    -1,
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="chat-screen">
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={[styles.listBody, { paddingTop: contentTop + space(2) }]}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={(info) => {
            // A row wasn't measured yet: jump near it by estimate, then retry once settled.
            listRef.current?.scrollToOffset({ animated: false, offset: info.averageItemLength * info.index });
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ animated: true, index: info.index, viewPosition: 0 });
              } catch {
                // give up quietly — content is still readable, just not auto-pinned
              }
            }, 120);
          }}
          renderItem={({ item }) =>
            item.kind === "thinking" ? (
              <View style={styles.assistantRow} testID="chat-thinking">
                <ThinkingDots color={c.text2} />
              </View>
            ) : item.kind === "error" ? (
              <View style={styles.errorBubble} testID="chat-error">
                <Text style={styles.errorText}>{item.errorText}</Text>
              </View>
            ) : item.msg!.role === "user" ? (
              <View style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{item.msg!.content}</Text>
              </View>
            ) : (
              // Assistant: full-width markdown (with LaTeX/math), NO bubble. Fades in as
              // it arrives (owner 2026-07-19). A "Sources · N" pill (when the router
              // grounded this turn with a web search) and any deliverable chips this
              // turn carries render underneath.
              <Reanimated.View entering={FadeIn.duration(350)} style={styles.assistantRow}>
                <MessageBody content={item.msg!.content} styles={markdownStyles} />
                {item.msg!.sources?.length ? (
                  <SourcesPill count={item.msg!.sources.length} onPress={() => setSourcesSheetFor(item.msg!.sources ?? null)} />
                ) : null}
                {item.msg!.outputs?.length ? <DeliverableChipRow outputs={item.msg!.outputs} onSelect={setDeliverableSheetFor} /> : null}
              </Reanimated.View>
            )
          }
          ListHeaderComponent={
            // Session-level deliverables (e.g. a web Record-mode recording synced
            // onto this thread) — a chip row at the very top of the transcript,
            // separate from any PER-MESSAGE chips rendered in renderItem above.
            threadOutputs.length ? <DeliverableChipRow outputs={threadOutputs} onSelect={setDeliverableSheetFor} /> : null
          }
          ListEmptyComponent={
            // Minimal greeting — ONE line, no explainer (owner 2026-07-20: "remove the
            // 'what are we working on today...' because its too noisy. just a simple
            // welcome back"). Rendered directly (not the shared EmptyBlock, which is
            // flex:1 + centered) so it still anchors NEAR THE TOP, not vertically
            // centered (prior owner call this preserves). The list's own paddingTop
            // already clears the glass TopBar, so this only adds a little more.
            <View style={[styles.emptyWrap, { paddingTop: space(4), paddingBottom: contentBottom }]}>
              <Text style={styles.emptyTitle}>Welcome back</Text>
            </View>
          }
          ListFooterComponent={
            // Bottom spacer so the last exchange can scroll up until the question sits at
            // the top of the viewport (ChatGPT-style). Only when there's content.
            hasContent ? <View style={{ height: Math.round(windowHeight * 0.5) }} /> : null
          }
        />
        <ChatActionsPopup
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          pinned={pinned}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          topInset={insets.top}
        />
        <UpgradeSheet
          visible={upgrade !== null}
          message={upgrade?.message ?? null}
          reset={upgrade?.reset ?? null}
          onClose={() => setUpgrade(null)}
        />
        <ComposerPlusMenu
          visible={plusMenuOpen}
          onClose={() => setPlusMenuOpen(false)}
          bottomOffset={(keyboardUp ? space(3) : contentBottom - space(1)) + COMPOSER_PILL_HEIGHT + space(2)}
          onAttach={() => setLibraryPickerOpen(true)}
          deepResearchOn={deepResearchOn}
          onToggleDeepResearch={() => setDeepResearchOn((v) => !v)}
        />
        <AttachLibrarySheet
          visible={libraryPickerOpen}
          onClose={() => setLibraryPickerOpen(false)}
          userId={uid}
          onPick={(note: CloudLibraryNote) => {
            setAttachedDoc({ content: note.content, title: note.title });
            setLibraryPickerOpen(false);
          }}
        />
        <SourcesSheet visible={sourcesSheetFor !== null} onClose={() => setSourcesSheetFor(null)} sources={sourcesSheetFor ?? []} />
        <DeliverableSheet visible={deliverableSheetFor !== null} onClose={() => setDeliverableSheetFor(null)} output={deliverableSheetFor} />
        <View style={[styles.composerRow, { paddingBottom: keyboardUp ? space(3) : contentBottom - space(1) }]}>
          {attachedDoc ? <AttachedDocChip title={attachedDoc.title} onRemove={() => setAttachedDoc(null)} /> : null}
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={send}
            onPlus={() => setPlusMenuOpen((v) => !v)}
            sending={sending}
            placeholder="Ask Nemesis…"
            inputRef={composerRef}
            testID="chat-input"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// The chat "…" dropdown (Pin/Unpin · Delete chat). Always mounted so its close fade
// plays; the button that toggles it lives in the TopBar's right slot (see the
// setHeaderRight effect). Same fade+rise + transparent tap-catcher as the app's other
// menus — no whole-screen blur, the menu's own glass is the only blur. Anchored just
// below the "…" button (which sits below the status-bar blur), so it renders crisp.
function ChatActionsPopup({
  visible,
  onClose,
  pinned,
  onDelete,
  onTogglePin,
  topInset,
}: {
  visible: boolean;
  onClose: () => void;
  pinned: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
  topInset: number;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 170 : 130,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="chat-actions-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View
        style={[
          styles.actionsMenuWrap,
          { top: topInset + space(2) + 44 + space(1.5), opacity: progress, transform: [{ translateY }] },
        ]}
      >
        <GlassSurface style={styles.actionsMenu} fallbackColor={c.glassPanel} opaque>
          <Pressable
            testID="chat-action-pin"
            onPress={() => pick(onTogglePin)}
            style={({ pressed }) => [styles.actionsRow, pressed && styles.actionsRowPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionsLabel}>{pinned ? "Unpin" : "Pin"}</Text>
          </Pressable>
          <Pressable
            testID="chat-action-delete"
            onPress={() => pick(onDelete)}
            style={({ pressed }) => [styles.actionsRow, styles.actionsDivider, pressed && styles.actionsRowPressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionsLabel, styles.actionsLabelDanger]}>Delete chat</Text>
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Horizontal "…" for the TopBar chat-actions button. */
function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

/** The attached Library document's small removable chip, rendered just above
 *  the composer input while it's staged for the next send (owner spec:
 *  "show a small removable chip above the composer input"). Cleared
 *  automatically once that turn sends (see send()) or manually via the "x". */
function AttachedDocChip({ title, onRemove }: { title: string; onRemove: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.attachChipRow}>
      <View style={styles.attachChip} testID="chat-attached-doc-chip">
        <Text style={styles.attachChipText} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${title}`} testID="chat-attached-doc-remove">
          <CloseIcon size={12} color={c.text2} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    signinWrap: { alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    listBody: { padding: space(4), gap: space(2), flexGrow: 1 },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5) },
    // Plain gray — no accent fill, no accent border (owner call 2026-07-18: the
    // prompt bubble should read neutral, not tinted).
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: c.surface2,
    },
    userText: { ...type.body, color: c.text },
    // Assistant is not a bubble — it's a full-width block of markdown.
    assistantRow: { alignSelf: "stretch", paddingHorizontal: space(0.5), paddingVertical: space(1) },
    errorBubble: { alignSelf: "flex-start", maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderWidth: 1, borderColor: c.warnLine, backgroundColor: c.warnFaint },
    errorText: { ...type.small, color: c.text2 },
    // No flex:1 — the greeting sizes to its content so it sits at the top of the
    // scroll area (paddingTop places it just below the glass TopBar). Owner
    // 2026-07-20: ONE short line only, muted (text2) — no explainer sentence.
    emptyWrap: { alignItems: "center", gap: space(2), paddingHorizontal: space(6) },
    emptyTitle: { ...type.title, color: c.text2, textAlign: "center" },
    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },
    // The attached-Library-doc chip staged above the composer input.
    attachChipRow: { marginBottom: space(1.5), paddingHorizontal: space(1) },
    attachChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: space(1.5),
      maxWidth: 260,
      paddingVertical: space(1),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      backgroundColor: c.surface2,
    },
    attachChipText: { ...type.small, color: c.text, flexShrink: 1 },

    // "…" chat-actions button (rendered into the TopBar's right slot) + its dropdown.
    actionsBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line },
    actionsBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },
    actionsMenuWrap: { position: "absolute", right: space(3), minWidth: 168 },
    actionsMenu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    actionsRow: { paddingVertical: space(3), paddingHorizontal: space(4) },
    actionsRowPressed: { backgroundColor: c.surface },
    actionsDivider: { borderTopWidth: 1, borderTopColor: c.line },
    actionsLabel: { ...type.body, color: c.text },
    actionsLabelDanger: { color: c.danger },
  });
