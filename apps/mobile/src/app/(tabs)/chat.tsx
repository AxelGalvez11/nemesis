import { useCallback, useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearChatThread, loadChatThread, saveChatThread, sendChat } from "@/api/chat";
import { EmptyBlock } from "@/components/mission-ui";
import type { ChatMsg } from "@/lib/chat-thread";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Chat (cloud-first pivot, P1a): the phone's standalone surface — straight to
// the metered cloud engine, no Mac anywhere in the path. Missions stay the
// "agent side" for work that touches files or portals; this is the "chat side"
// for answers now, wherever the student is.

const THINKING_ID = "__thinking__";

interface Row {
  id: string;
  msg: ChatMsg | null; // null = the thinking indicator row
  error?: boolean;
}

export default function ChatScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [errorIds, setErrorIds] = useState<Set<number>>(new Set());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadChatThread().then((thread) => {
      if (alive) setMessages(thread);
    });
    return () => {
      alive = false;
    };
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: ChatMsg = { at: new Date().toISOString(), content: text, role: "user" };
    const base = [...messages, userMsg];
    setMessages(base);
    setInput("");
    setSending(true);
    void sendChat(messages, text)
      .then((reply) => {
        const assistant: ChatMsg = {
          at: new Date().toISOString(),
          content: reply.text ?? reply.errorText ?? "Something went wrong.",
          role: "assistant",
        };
        const next = [...base, assistant];
        setMessages(next);
        if (!reply.text) {
          setErrorIds((current) => new Set(current).add(next.length - 1));
          // Errors aren't part of the conversation — persist without them so a
          // retry doesn't teach the model its own failure message.
          void saveChatThread(base);
        } else {
          void saveChatThread(next);
        }
      })
      .finally(() => setSending(false));
  }, [input, messages, sending]);

  const newChat = useCallback(() => {
    setMessages([]);
    setErrorIds(new Set());
    void clearChatThread();
  }, []);

  const rows: Row[] = messages.map((msg, index) => ({ error: errorIds.has(index), id: `m-${index}`, msg }));
  if (sending) rows.push({ id: THINKING_ID, msg: null });
  const inverted = [...rows].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 58}
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
          inverted
          data={inverted}
          keyExtractor={(row) => row.id}
          contentContainerStyle={styles.listBody}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.msg === null ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.thinking]} testID="chat-thinking">
                <Text style={styles.thinkingText}>Thinking…</Text>
              </View>
            ) : item.msg.role === "user" ? (
              <View style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{item.msg.content}</Text>
              </View>
            ) : (
              <View style={[styles.bubble, styles.assistantBubble, item.error && styles.errorBubble]}>
                {item.error ? (
                  <Text style={styles.errorText}>{item.msg.content}</Text>
                ) : (
                  <Markdown style={markdownStyles}>{item.msg.content}</Markdown>
                )}
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              {/* inverted list flips children — wrap so the empty state reads upright */}
              <View style={styles.emptyFlip}>
                <EmptyBlock
                  title="Ask anything"
                  body="Answers come straight from the cloud — no Mac needed. Mechanisms, brand names, quick explanations, study questions."
                />
              </View>
            </View>
          }
        />
        <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, space(2)) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Nemesis…"
            placeholderTextColor={c.text3}
            multiline
            testID="chat-input"
          />
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
    emptyFlip: { transform: [{ scaleY: -1 }] },
    composerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: space(2),
      paddingHorizontal: space(3),
      paddingTop: space(2),
      borderTopWidth: 1,
      borderTopColor: c.line,
      backgroundColor: c.bg,
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 130,
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.lg,
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.5),
      fontSize: 16,
      color: c.text,
      backgroundColor: c.surface,
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
