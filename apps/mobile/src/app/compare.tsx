import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchComparison } from "@/api/compare";
import { searchEntities } from "@/api/search";
import { useAuth } from "@/auth/AuthProvider";
import { ComparisonView } from "@/components/ComparisonView";
import { EmptyState, ErrorState } from "@/components/states";
import { Centered } from "@/components/ui";
import { UUID_RE } from "@/lib/validation";
import { common } from "@/theme/common";

// Compare screen (doc-11). Deep-linkable as /compare?left&right (the drug page passes
// left); the missing side is picked via search. Authenticated-only (the compare fn
// rejects anonymous). Once both ids are set, the fn returns the 6 section groups +
// the union of cited sources, which ComparisonView renders.
export default function CompareScreen() {
  const params = useLocalSearchParams<{ left?: string; right?: string }>();
  const { session, loading } = useAuth();
  const [left, setLeft] = useState<string | null>(params.left ? String(params.left) : null);
  const [right, setRight] = useState<string | null>(params.right ? String(params.right) : null);

  const bothValid = !!left && !!right && UUID_RE.test(left) && UUID_RE.test(right) && left !== right;

  const comparison = useQuery({
    queryKey: ["compare", left, right],
    queryFn: () => fetchComparison(left!, right!),
    enabled: !!session && bothValid,
  });

  if (loading) return <Centered testID="compare-auth-loading"><ActivityIndicator /></Centered>;
  if (!session) {
    return (
      <Centered testID="compare-auth-required">
        <Text>Sign in to compare drugs.</Text>
      </Centered>
    );
  }

  const pick = (id: string) => {
    if (!left || (left && right)) {
      setLeft(id);
      setRight(null);
    } else {
      setRight(id);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.body} testID="compare-screen" keyboardShouldPersistTaps="handled">
      <Text style={common.h1}>Compare</Text>
      <Text style={common.sub} testID="compare-slots">
        Left: {left ? "selected" : "—"} · Right: {right ? "selected" : "—"}
      </Text>

      {!bothValid ? (
        <Picker onPick={pick} />
      ) : comparison.isLoading ? (
        <View style={styles.loading} testID="compare-loading"><ActivityIndicator /></View>
      ) : comparison.isError ? (
        <ErrorState testID="compare-error" body={(comparison.error as Error).message} />
      ) : !comparison.data ? (
        <EmptyState testID="compare-empty" title="Not found" body="One of those entities was not found." />
      ) : (
        <ComparisonView comparison={comparison.data} />
      )}
    </ScrollView>
  );
}

function Picker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const active = q.trim().length >= 2;
  const { data, isLoading } = useQuery({
    queryKey: ["compare-search", q.trim()],
    queryFn: () => searchEntities(q),
    enabled: active,
  });
  return (
    <View style={styles.picker}>
      <TextInput
        testID="compare-search"
        style={common.input}
        placeholder="Search a drug to add"
        autoCapitalize="none"
        autoCorrect={false}
        value={q}
        onChangeText={setQ}
      />
      {isLoading ? (
        <ActivityIndicator />
      ) : (
        (data ?? []).map((r, i) => (
          <Pressable key={r.id} testID={`compare-result-${i}`} style={styles.result} onPress={() => onPick(r.id)}>
            <Text style={styles.resultName}>{r.name}</Text>
            {r.subtitle ? <Text style={styles.resultSub}>{r.subtitle}</Text> : null}
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  loading: { paddingVertical: 24, alignItems: "center" },
  picker: { gap: 6 },
  result: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eceff3" },
  resultName: { fontSize: 16, fontWeight: "600", color: "#1f2933" },
  resultSub: { fontSize: 13, color: "#6b7686" },
});
