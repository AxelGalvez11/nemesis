import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchDrug } from "@/api/drugs";
import { useAuth } from "@/auth/AuthProvider";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 6b-1 data-bound proof: render a real get_drug result under react-native-web. This
// is the fidelity gate — typed §8 client + authenticated read + RNW render. Full
// label/evidence/PubMed/trials/Source-Viewer arrive in 6b-2.
//
// The query is gated on (a) a valid uuid — a bad path renders not-found without a
// wasted round-trip — and (b) a restored session: get_drug is authenticated-only
// (anon REVOKEd), and on a deep-link reload the session restores async, so firing
// the RPC before that would 401.
export default function DrugScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const drugId = String(id);
  const validId = UUID_RE.test(drugId);
  const { session, loading: authLoading } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["drug", drugId],
    queryFn: () => fetchDrug(drugId),
    enabled: validId && !!session,
  });

  if (authLoading) {
    return (
      <View style={styles.center} testID="drug-auth-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center} testID="drug-auth-required">
        <Text>Sign in to view this drug.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center} testID="drug-query-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center} testID="drug-error">
        <Text>{(error as Error).message}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center} testID="drug-empty">
        <Text>No drug found for this id.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} testID="drug-screen">
      <Text style={styles.name} testID="drug-name">
        {data.canonical_name}
      </Text>
      <Text style={styles.status} testID="drug-status">
        {data.approved_status}
      </Text>
      {data.evidence_score ? (
        <Text style={styles.evidence} testID="drug-evidence">
          Evidence: {data.evidence_score.score}
        </Text>
      ) : (
        <Text style={styles.evidence} testID="drug-evidence-none">
          Evidence: not scored
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  body: { padding: 24, gap: 10 },
  name: { fontSize: 26, fontWeight: "700" },
  status: { fontSize: 14, textTransform: "capitalize", opacity: 0.8 },
  evidence: { fontSize: 16, fontWeight: "600" },
});
