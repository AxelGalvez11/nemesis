import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { clearChatThread, loadChatThread, saveChatThread, sendChat } from "@/api/chat";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { useKeyboardVisible, useShellPadding } from "@/components/shell-chrome";
import type { ChatMsg } from "@/lib/chat-thread";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Chat (cloud-first pivot, P1a): the phone's standalone surface — straight to
// the metered cloud engine, no Mac anywhere in the path. Missions stay the
// "agent side" for work that touches files or portals; this is the "chat side"
// for answers now, wherever the student is.
//
// State rules (review findings): everything is keyed to the signed-in user
// (guests see a sign-in prompt, never someone else's transcript); `messages`
// holds ONLY the real conversation (errors render from separate transient
// state, so they neither feed the next turn's history nor persist); and every
// async landing is epoch-checked so "New chat", a user switch, or an unmount
// can never resurrect a cleared thread.

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
  const insets = useSafeAreaInsets();
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [lastError, setLastError] = useState<null | string>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Epoch bumps on New chat and on user change; in-flight sends compare before
  // touching state. sendingRef is the SYNCHRONOUS re-entrancy lock (React state
  // alone lags a render, which a double native press can beat).
  const epochRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    epochRef.current += 1;
    // Release the send lock too: an in-flight request from the previous user
    // will settle under a stale epoch, whose .finally deliberately does NOT
    // free the lock — without this reset the composer would soft-lock.
    sendingRef.current = false;
    setSending(false);
    setMessages([]);
    setLastError(null);
    setInput("");
    if (!uid) return;
    const epoch = epochRef.current;
    let alive = true;
    void loadChatThread(uid).then((thread) => {
      if (alive && epochRef.current === epoch) setMessages(thread);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !uid || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = epochRef.current;
    const history = messages;
    const userMsg: ChatMsg = { at: new Date().toISOString(), content: text, role: "user" };
    const base = [...history, userMsg];
    setMessages(base);
    setLastError(null);
    setInput("");
    setSending(true);
    void sendChat(uid, history, text)
      .then((reply) => {
        if (epochRef.current !== epoch) return;
        if (reply.text) {
          const next: ChatMsg[] = [...base, { at: new Date().toISOString(), content: reply.text, role: "assistant" }];
          setMessages(next);
          void saveChatThread(uid, next);
        } else {
          // The user's message stays (it IS the conversation); the failure line
          // renders from transient state and never enters history/persistence.
          setLastError(reply.errorText ?? "Something went wrong.");
          void saveChatThread(uid, base);
        }
      })
      .finally(() => {
        // Only the CURRENT epoch's send may free the lock — a stale request
        // settling late must not re-enable Send under a newer in-flight turn.
        // Stale epochs get their lock released by newChat()/the uid effect.
        if (epochRef.current === epoch) {
          sendingRef.current = false;
          setSending(false);
        }
      });
  }, [input, messages, uid]);

  const newChat = useCallback(() => {
    epochRef.current += 1;
    sendingRef.current = false;
    setMessages([]);
    setLastError(null);
    setSending(false);
    if (uid) void clearChatThread(uid);
  }, [uid]);

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
  // Invert ONLY when there's content. An inverted FlatList flips its whole
  // content container (scaleY:-1), and RN does NOT flip the ListEmptyComponent
  // back — so an empty inverted list renders the empty state upside-down (a
  // scaleY counter-transform proved unreliable on-device). Not inverting while
  // empty sidesteps it entirely; the flip only matters once messages exist.
  const hasContent = rows.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // With behavior="padding", the offset must equal this view's distance from
      // the WINDOW top. Since the glass redesign the TopBar is an OVERLAY — this
      // screen starts at the window top, so the offset is 0 (the bar's height now
      // lives in the scroll content's paddingTop instead; see shell-chrome.ts).
      keyboardVerticalOffset={0}
    >
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
          // When inverted (content present) the content container is flipped
          // (scaleY:-1), so paddingBottom is what lands under the glass TopBar at
          // the true screen top. When empty the list isn't inverted, so the empty
          // state pads itself normally (see ListEmptyComponent) and this padding
          // is harmless.
          contentContainerStyle={[styles.listBody, { paddingBottom: contentTop + space(2) }]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.kind === "thinking" ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.thinking]} testID="chat-thinking">
                <Text style={styles.thinkingText}>Thinking…</Text>
              </View>
            ) : item.kind === "error" ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.errorBubble]} testID="chat-error">
                <Text style={styles.errorText}>{item.errorText}</Text>
              </View>
            ) : item.msg!.role === "user" ? (
              <View style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{item.msg!.content}</Text>
              </View>
            ) : (
              <View style={[styles.bubble, styles.assistantBubble]}>
                <Markdown style={markdownStyles}>{item.msg!.content}</Markdown>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={[styles.emptyWrap, { paddingTop: contentTop, paddingBottom: contentBottom }]}>
              <EmptyBlock
                title="Ask anything"
                body="Answers come straight from the cloud — no Mac needed. Mechanisms, brand names, quick explanations, study questions."
              />
            </View>
          }
        />
        <View style={[styles.composerRow, { paddingBottom: keyboardUp ? space(3) : contentBottom - space(1) }]}>
          <GlassSurface style={styles.inputGlass} variant="clear">
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Nemesis…"
              placeholderTextColor={c.text3}
              multiline
              testID="chat-input"
            />
          </GlassSurface>
          <Pressable
            testID="chat-send"
            onPress={send}
            disabled={!input.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || sending) && styles.sendDisabled,
              pressed && styles.sendPressed,
            ]}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
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
    assistantBubble: { alignSelf: "flex-start", backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
    errorBubble: { borderColor: c.warnLine, backgroundColor: c.warnFaint },
    errorText: { ...type.small, color: c.text2 },
    thinking: { opacity: 0.8 },
    thinkingText: { ...type.small, color: c.text2 },
    emptyWrap: { flex: 1, justifyContent: "center" },
    composerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: space(2),
      paddingHorizontal: space(3),
      paddingTop: space(2),
    },
    inputGlass: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.lg,
    },
    input: {
      minHeight: 42,
      maxHeight: 130,
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.5),
      fontSize: 16,
      color: c.text,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendDisabled: { opacity: 0.4 },
    sendPressed: { opacity: 0.8 },
    sendText: { fontSize: 20, fontWeight: "700", color: c.onAccent, marginTop: -2 },
  });
