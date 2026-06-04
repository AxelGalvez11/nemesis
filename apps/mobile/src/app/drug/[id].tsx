import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchDrug, fetchDrugLabel, fetchDrugPubmed, fetchDrugTrials } from "@/api/drugs";
import { useAuth } from "@/auth/AuthProvider";
import { EvidenceCard } from "@/components/EvidenceCard";
import { LabelSections } from "@/components/LabelSections";
import { TrialList } from "@/components/TrialList";
import { PubmedList } from "@/components/PubmedList";
import { FollowButton } from "@/components/FollowButton";
import { ErrorState } from "@/components/states";
import { Badge, Centered, Chip, SectionHeader } from "@/components/ui";
import { UUID_RE } from "@/lib/validation";

// The drug page (AC1 destination + AC4 label + AC5 trials + AC6 pubmed + AC9
// evidence). Four §8 reads run in parallel; the overview gates the page shell, the
// rest fill their sections independently (each with its own load/error/empty state,
// the doc-06 matrix per section). Authenticated-only: a guest sees a sign-in
// affordance (real anonymous reads need the project anon switch — deferred).
export default function DrugScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const drugId = String(id);
  const validId = UUID_RE.test(drugId);
  const { session, loading: authLoading } = useAuth();
  const enabled = validId && !!session;

  const overview = useQuery({
    queryKey: ["drug", drugId],
    queryFn: () => fetchDrug(drugId),
    enabled,
  });
  const label = useQuery({
    queryKey: ["drug-label", drugId],
    queryFn: () => fetchDrugLabel(drugId),
    enabled,
  });
  const trials = useQuery({
    queryKey: ["drug-trials", drugId],
    queryFn: () => fetchDrugTrials(drugId),
    enabled,
  });
  const pubmed = useQuery({
    queryKey: ["drug-pubmed", drugId],
    queryFn: () => fetchDrugPubmed(drugId),
    enabled,
  });

  if (authLoading) return <Centered testID="drug-auth-loading"><ActivityIndicator /></Centered>;
  if (!session) {
    return (
      <Centered testID="drug-auth-required">
        <Text>Sign in to view this drug.</Text>
      </Centered>
    );
  }
  if (overview.isLoading) return <Centered testID="drug-query-loading"><ActivityIndicator /></Centered>;
  if (overview.isError) {
    return (
      <Centered testID="drug-error">
        <Text>{(overview.error as Error).message}</Text>
      </Centered>
    );
  }
  const drug = overview.data;
  if (!drug) {
    return (
      <Centered testID="drug-empty">
        <Text>No drug found for this id.</Text>
      </Centered>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} testID="drug-screen">
      <Text style={styles.name} testID="drug-name">
        {drug.canonical_name}
      </Text>
      <Badge label={(drug.approved_status ?? "").replace(/_/g, " ")} tone="neutral" testID="drug-status" />

      <View style={styles.actions}>
        <FollowButton drugId={drug.id} />
        <Pressable
          testID="drug-compare"
          style={styles.compareLink}
          onPress={() => router.push(`/compare?left=${drug.id}`)}
        >
          <Text style={styles.compareText}>Compare with another →</Text>
        </Pressable>
      </View>

      {drug.mechanism_summary ? (
        <Text style={styles.mechanism}>{drug.mechanism_summary}</Text>
      ) : null}

      {drug.brand_names?.length ? (
        <View style={styles.chipRow} testID="drug-brands">
          {drug.brand_names.map((b) => (
            <Chip key={b} label={b} />
          ))}
        </View>
      ) : null}

      {drug.classes?.length ? (
        <View style={styles.block}>
          <SectionHeader title="Drug classes" testID="section-classes" />
          <View style={styles.chipRow} testID="drug-classes">
            {drug.classes.map((c) => (
              <Chip key={c.id} label={c.name} />
            ))}
          </View>
        </View>
      ) : null}

      {drug.evidence_score ? (
        <EvidenceCard score={drug.evidence_score} />
      ) : (
        <View style={styles.block}>
          <SectionHeader title="Evidence" testID="section-evidence" />
          <Text testID="drug-evidence-none" style={styles.muted}>Not yet scored.</Text>
        </View>
      )}

      <Section query={label} render={(d) => <LabelSections labels={d} />} label="label" />
      <Section query={trials} render={(d) => <TrialList trials={d} />} label="trials" />
      <Section query={pubmed} render={(d) => <PubmedList articles={d} />} label="pubmed" />
    </ScrollView>
  );
}

// A section that mirrors its query's doc-06 state: loading -> spinner, error ->
// ErrorState, success -> the list (which renders its own empty state).
function Section<T>({
  query,
  render,
  label,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined };
  render: (data: T) => ReactNode;
  label: string;
}) {
  if (query.isLoading) {
    return (
      <View style={styles.sectionLoading} testID={`${label}-loading`}>
        <ActivityIndicator />
      </View>
    );
  }
  if (query.isError) {
    return <ErrorState testID={`${label}-error`} body={(query.error as Error).message} />;
  }
  return <>{query.data !== undefined ? render(query.data) : null}</>;
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  name: { fontSize: 28, fontWeight: "700" },
  mechanism: { fontSize: 15, lineHeight: 21, color: "#3a4451" },
  block: { gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  muted: { fontSize: 14, color: "#6b7686" },
  sectionLoading: { paddingVertical: 16, alignItems: "center" },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  compareLink: { paddingVertical: 8 },
  compareText: { color: "#208AEF", fontSize: 14, fontWeight: "600" },
});
