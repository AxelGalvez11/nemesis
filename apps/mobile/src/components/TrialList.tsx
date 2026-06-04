import { StyleSheet, Text, View } from "react-native";
import type { DrugTrial } from "@/api/types";
import { EmptyState } from "./states";
import { Badge, Card, SectionHeader } from "./ui";
import { SourceLink } from "./SourceLink";

// AC5: trial drugs show ClinicalTrials.gov studies, each cited (source_id -> Source
// Viewer). We render the scalar fields we trust (title/phase/status/sponsor/nct);
// the jsonb columns (conditions/interventions) are deferred to the device-polish pass.

export function TrialList({ trials }: { trials: DrugTrial[] }) {
  return (
    <View style={styles.wrap}>
      <SectionHeader title={`Clinical trials (${trials.length})`} testID="section-trials" />
      {trials.length === 0 ? (
        <EmptyState testID="trials-empty" title="No trials" body="No ClinicalTrials.gov studies linked." />
      ) : (
        trials.map((t, i) => (
          <Card key={t.trial_id} testID={`trial-${i}`}>
            <Text style={styles.title} numberOfLines={3}>
              {t.brief_title ?? t.nct_id ?? "Untitled study"}
            </Text>
            <View style={styles.meta}>
              {t.phase ? <Badge label={t.phase.replace(/_/g, " ")} tone="neutral" /> : null}
              {t.status ? <Text style={styles.metaText}>{t.status}</Text> : null}
              {t.nct_id ? <Text style={styles.metaText}>{t.nct_id}</Text> : null}
            </View>
            {t.sponsor ? <Text style={styles.sponsor}>{t.sponsor}</Text> : null}
            <SourceLink sourceId={t.source_id} testID={`trial-cite-${i}`} />
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 15, fontWeight: "600", color: "#1f2933", lineHeight: 20 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 },
  metaText: { fontSize: 13, color: "#4a5562" },
  sponsor: { fontSize: 13, color: "#6b7686", marginTop: 2 },
});
