import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/api/search";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyState, ErrorState, GuestState } from "@/components/states";
import { Badge } from "@/components/ui";
import { common } from "@/theme/common";

// AC1: search a drug. "ozempic" (a brand alias) resolves to Semaglutide. Debounced so
// each keystroke does not fire an RPC. Authenticated-only (search_entities is anon
// REVOKEd), so a guest sees a sign-in affordance rather than a dead search box.
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function ExploreTab() {
  const { session, isGuest } = useAuth();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const active = debouncedQ.trim().length >= 2;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", debouncedQ.trim()],
    queryFn: () => searchEntities(debouncedQ),
    enabled: !!session && active,
  });

  if (!session && isGuest) {
    return (
      <View style={common.screen} testID="tab-explore">
        <Text style={common.h1}>Explore</Text>
        <GuestState body="Sign in to search drugs, peptides, and supplements.">
          <Pressable testID="goto-signin" style={common.linkBtn} onPress={() => router.push("/sign-in")}>
            <Text style={common.link}>Sign in</Text>
          </Pressable>
        </GuestState>
      </View>
    );
  }

  return (
    <View style={common.screen} testID="tab-explore">
      <Text style={common.h1}>Explore</Text>
      <TextInput
        testID="search-input"
        style={common.input}
        placeholder="Search a drug, e.g. ozempic"
        autoCapitalize="none"
        autoCorrect={false}
        value={q}
        onChangeText={setQ}
      />

      {!active ? (
        <Text style={common.sub} testID="search-idle">
          Type at least 2 characters to search.
        </Text>
      ) : isLoading ? (
        <View style={styles.loading} testID="search-loading">
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <ErrorState testID="search-error" body={(error as Error).message} />
      ) : !data || data.length === 0 ? (
        <EmptyState testID="search-empty" title="No matches" body={`Nothing found for “${debouncedQ.trim()}”.`} />
      ) : (
        <ScrollView testID="search-results" keyboardShouldPersistTaps="handled">
          {data.map((r, i) => (
            <Pressable
              key={r.id}
              testID={`result-${i}`}
              style={styles.row}
              onPress={() => router.push(`/drug/${r.id}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName} testID={`result-name-${i}`}>
                  {r.name}
                </Text>
                {r.subtitle ? <Text style={styles.rowSub}>{r.subtitle}</Text> : null}
              </View>
              <Badge label={r.status.replace(/_/g, " ")} tone="neutral" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 24, alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eceff3",
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 16, fontWeight: "600", color: "#1f2933" },
  rowSub: { fontSize: 13, color: "#6b7686" },
});
