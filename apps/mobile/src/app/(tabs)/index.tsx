import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AskMode, AskResponse } from "@pharmabro/shared";
import { askQuestion } from "@/api/ask";
import { useAuth } from "@/auth/AuthProvider";
import { useShell } from "@/components/AppDrawer";
import { AnswerView } from "@/components/AnswerView";
import { ChatComposer } from "@/components/ChatComposer";
import { Orb } from "@/components/TopBar";
import { GuestState } from "@/components/states";
import { c, radius, space, type } from "@/theme/tokens";

interface Turn {
  q: string;
  a: AskResponse | null;
  err: string | null;
}

const EXAMPLES = [
  "Is lisinopril safe with spironolactone?",
  "Semaglutide for weight loss — how well does it work?",
  "Metformin dosing when eGFR is 40",
];

// The chat screen — opens straight into the conversation (ChatGPT/Claude style). The shared TopBar +
// drawer live in the layout; this screen is the message list + the composer.
export default function ChatScreen() {
  const { session } = useAuth();
  const { resetNonce } = useShell();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AskMode>("fast");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // "New chat" (from the drawer or top bar) clears the thread.
  useEffect(() => {
    if (resetNonce === 0) return;
    setTurns([]);
    setInput("");
  }, [resetNonce]);

  if (!session) {
    return (
      <View style={styles.guestWrap} testID="tab-ask">
        <GuestState body="Sign in to ask medication questions." />
      </View>
    );
  }

  const submit = async (raw: string) => {
    const q = raw.trim();
    if (q.length < 3 || busy) return;
    const idx = turns.length;
    setTurns((prev) => [...prev, { q, a: null, err: null }]);
    setInput("");
    setBusy(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      const res = await askQuestion(q, { mode });
      setTurns((prev) => prev.map((t, i) => (i === idx ? { ...t, a: res } : t)));
    } catch (e) {
      setTurns((prev) => prev.map((t, i) => (i === idx ? { ...t, err: (e as Error).message } : t)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const empty = turns.length === 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
      {empty ? (
        <View style={styles.welcome} testID="ask-idle">
          <Orb size={46} />
          <Text style={styles.welcomeTitle}>What do you want to know?</Text>
          <Text style={styles.welcomeSub}>Educational, source-grounded answers — not medical advice.</Text>
          <View style={styles.examples}>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} style={styles.exChip} onPress={() => submit(ex)}>
                <Text style={styles.exChipText}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
          {turns.map((t, i) => (
            <View key={i} style={styles.turn}>
              <View style={styles.userRow}>
                <View style={styles.userBubble}><Text style={styles.userText}>{t.q}</Text></View>
              </View>
              <View style={styles.aRow}>
                <View style={styles.aHead}><Orb size={20} /><Text style={styles.aName}>PharmaOrb</Text></View>
                {t.a ? (
                  <AnswerView answer={t.a} onAskFollowUp={submit} />
                ) : t.err ? (
                  <Text style={styles.err}>{t.err}</Text>
                ) : (
                  <View style={styles.thinking}>
                    <ActivityIndicator color={c.acid} />
                    <Text style={styles.thinkingText}>Reading the sources…</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.composerWrap}>
        <ChatComposer
          value={input}
          onChangeText={setInput}
          onSend={() => submit(input)}
          busy={busy}
          mode={mode}
          onToggleMode={() => setMode((m) => (m === "fast" ? "thorough" : "fast"))}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  guestWrap: { flex: 1, padding: space(6), backgroundColor: c.bg },

  welcome: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(3) },
  welcomeTitle: { color: c.text, ...type.h1, textAlign: "center", marginTop: space(2) },
  welcomeSub: { color: c.text2, ...type.small, textAlign: "center", maxWidth: 300 },
  examples: { marginTop: space(4), gap: space(2.5), width: "100%", maxWidth: 380 },
  exChip: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(4) },
  exChipText: { color: c.text2, ...type.body, fontSize: 14.5 },

  thread: { padding: space(4), paddingBottom: space(5), gap: space(6) },
  turn: { gap: space(3.5) },
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: { maxWidth: "82%", backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line, borderRadius: 18, borderBottomRightRadius: 5, paddingVertical: space(2.75), paddingHorizontal: space(3.75) },
  userText: { color: c.text, fontSize: 15, lineHeight: 21 },
  aRow: { gap: space(2.75) },
  aHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  aName: { color: c.text2, ...type.small, fontWeight: "600" },
  err: { color: c.danger, ...type.small },
  thinking: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(2) },
  thinkingText: { color: c.text2, ...type.small },

  composerWrap: { paddingHorizontal: space(3.5), paddingTop: space(2.5), paddingBottom: space(6), backgroundColor: c.bg },
});
