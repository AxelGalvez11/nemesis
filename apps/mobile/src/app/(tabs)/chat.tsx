import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { listThreads, loadThreadMessages, newThreadId, saveThreadMessages, sendChat } from "@/api/chat";
import { useShell } from "@/components/AppDrawer";
import { Composer } from "@/components/Composer";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { ThinkingDots } from "@/components/ThinkingDots";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import type { ChatMsg } from "@/lib/chat-thread";
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
  const { setHeaderTitle, newChat } = useShell();

  // The active thread rides in the route param so the drawer/TopBar can steer it.
  const params = useLocalSearchParams<{ c?: string }>();
  const routeThreadId = Array.isArray(params.c) ? params.c[0] : params.c;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastError, setLastError] = useState<null | string>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Epoch bumps on user change AND thread change; in-flight sends compare before
  // touching state. sendingRef is the synchronous re-entrancy lock.
  const epochRef = useRef(0);
  const sendingRef = useRef(false);

  // Load the active thread: the route's `c` if present, else the most recent
  // thread (resume), else a brand-new empty thread. Re-runs on user/thread change.
  useEffect(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setMessages([]);
    setLastError(null);
    setInput("");
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
    })();
    return () => {
      alive = false;
    };
  }, [uid, routeThreadId]);

  // Header title: the Nemesis logo until the student asks something, then the
  // conversation's title (their first question, trimmed). Cleared on unmount.
  useEffect(() => {
    const firstUser = (messages.find((message) => message.role === "user")?.content ?? "").trim();
    setHeaderTitle(firstUser ? (firstUser.length > 30 ? `${firstUser.slice(0, 29).trim()}…` : firstUser) : null);
  }, [messages, setHeaderTitle]);
  useEffect(() => () => setHeaderTitle(null), [setHeaderTitle]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !uid || !threadId || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = epochRef.current;
    const history = messages;
    const id = threadId;
    const userMsg: ChatMsg = { at: new Date().toISOString(), content: text, role: "user" };
    const base = [...history, userMsg];
    setMessages(base);
    setLastError(null);
    setInput("");
    setSending(true);
    // Persist the user turn immediately so the thread shows in the sidebar even
    // if the reply never lands.
    void saveThreadMessages(uid, id, base);
    void sendChat(uid, history, text)
      .then((reply) => {
        if (epochRef.current !== epoch) return;
        if (reply.text) {
          const next: ChatMsg[] = [...base, { at: new Date().toISOString(), content: reply.text, role: "assistant" }];
          setMessages(next);
          void saveThreadMessages(uid, id, next);
        } else {
          // The user's message stays (it IS the conversation); the failure line
          // renders from transient state and never enters history/persistence.
          setLastError(reply.errorText ?? "Something went wrong.");
        }
      })
      .finally(() => {
        if (epochRef.current === epoch) {
          sendingRef.current = false;
          setSending(false);
        }
      });
  }, [input, messages, uid, threadId]);

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
  if (sending) rows.push({ id: THINKING_ID, kind: "thinking" });
  const reversed = [...rows].reverse();
  // Invert ONLY when there's content — an inverted FlatList flips its content
  // container and RN does not flip the empty component back (would render the
  // empty state upside-down). Not inverting while empty sidesteps it entirely.
  const hasContent = rows.length > 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={styles.flex} testID="chat-screen">
        {messages.length > 0 ? (
          <View style={styles.topRow}>
            <Pressable onPress={newChat} hitSlop={8} testID="chat-new">
              <Text style={styles.newChatText}>New chat</Text>
            </Pressable>
          </View>
        ) : null}
        <FlatList
          inverted={hasContent}
          data={reversed}
          keyExtractor={(row) => row.id}
          contentContainerStyle={[styles.listBody, { paddingBottom: contentTop + space(2) }]}
          keyboardShouldPersistTaps="handled"
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
              // Assistant: full-width markdown, NO bubble.
              <View style={styles.assistantRow}>
                <Markdown style={markdownStyles}>{item.msg!.content}</Markdown>
              </View>
            )
          }
          ListEmptyComponent={
            // Greeting rendered directly (not the shared EmptyBlock, which is
            // flex:1 + centered) so it anchors NEAR THE TOP (owner call).
            <View style={[styles.emptyWrap, { paddingTop: contentTop + space(8), paddingBottom: contentBottom }]}>
              <Text style={styles.emptyTitle}>Welcome back</Text>
              <Text style={styles.emptyBody}>
                What are we working on today? Ask about mechanisms, brand names, or anything from your classes — answers come
                straight from the cloud.
              </Text>
            </View>
          }
        />
        <View style={[styles.composerRow, { paddingBottom: keyboardUp ? space(3) : contentBottom - space(1) }]}>
          <Composer
            value={input}
            onChangeText={setInput}
            onSend={send}
            onPlus={newChat}
            sending={sending}
            placeholder="Ask Nemesis…"
            testID="chat-input"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    signinWrap: { alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    topRow: { alignItems: "flex-end", paddingHorizontal: space(4), paddingTop: space(2) },
    newChatText: { ...type.small, color: c.text2 },
    listBody: { padding: space(4), gap: space(2), flexGrow: 1 },
    bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5) },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: c.accentFaint,
      borderWidth: 1,
      borderColor: c.accentLine,
    },
    userText: { ...type.body, color: c.text },
    // Assistant is not a bubble — it's a full-width block of markdown.
    assistantRow: { alignSelf: "stretch", paddingHorizontal: space(0.5), paddingVertical: space(1) },
    errorBubble: { alignSelf: "flex-start", maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderWidth: 1, borderColor: c.warnLine, backgroundColor: c.warnFaint },
    errorText: { ...type.small, color: c.text2 },
    // No flex:1 — the greeting sizes to its content so it sits at the top of the
    // scroll area (paddingTop places it just below the glass TopBar).
    emptyWrap: { alignItems: "center", gap: space(2), paddingHorizontal: space(6) },
    emptyTitle: { ...type.title, color: c.text, textAlign: "center" },
    emptyBody: { ...type.small, color: c.text2, textAlign: "center", maxWidth: 320 },
    composerRow: { paddingHorizontal: space(3), paddingTop: space(2) },
  });
