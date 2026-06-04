import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { askQuestion } from "@/api/ask";
import { useAuth } from "@/auth/AuthProvider";
import { AnswerView } from "@/components/AnswerView";
import { ErrorState, GuestState } from "@/components/states";
import { common } from "@/theme/common";

// Ask tab (AC2/AC3): ask a medication question → a cited, structured answer (or a
// deterministic safety/refusal template). Authenticated-only — the `ask` fn rejects
// anonymous sessions, so a guest sees a sign-in affordance.
export default function AskTab() {
  const { session } = useAuth();
  const [question, setQuestion] = useState("");
  const ask = useMutation({ mutationFn: (q: string) => askQuestion(q) });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    setQuestion(trimmed);
    ask.mutate(trimmed);
  };

  if (!session) {
    return (
      <View style={common.screen} testID="tab-ask">
        <Text style={common.h1}>Ask</Text>
        <GuestState body="Sign in to ask medication questions." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} testID="tab-ask" keyboardShouldPersistTaps="handled">
      <Text style={common.h1}>Ask</Text>
      <Text style={common.sub}>Educational, source-grounded answers — not medical advice.</Text>
      <TextInput
        testID="ask-input"
        style={[common.input, styles.input]}
        placeholder="e.g. What are the side effects of semaglutide?"
        multiline
        maxLength={500}
        value={question}
        onChangeText={setQuestion}
      />
      <Pressable
        testID="ask-submit"
        style={[common.btn, ask.isPending && styles.btnDisabled]}
        disabled={ask.isPending}
        onPress={() => submit(question)}
      >
        <Text style={common.btnText}>{ask.isPending ? "Thinking…" : "Ask"}</Text>
      </Pressable>

      {ask.isPending ? (
        <View style={styles.loading} testID="ask-loading">
          <ActivityIndicator />
          <Text style={common.sub}>Reading the sources… this can take a few seconds.</Text>
        </View>
      ) : ask.isError ? (
        <ErrorState testID="ask-error" body={(ask.error as Error).message} />
      ) : ask.data ? (
        <AnswerView answer={ask.data} onAskFollowUp={submit} />
      ) : (
        <Text style={common.body} testID="ask-idle">
          Ask about a drug, an interaction, side effects, or what the evidence says.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 24, gap: 12 },
  input: { minHeight: 64, textAlignVertical: "top" },
  btnDisabled: { opacity: 0.6 },
  loading: { paddingVertical: 24, alignItems: "center", gap: 10 },
});
