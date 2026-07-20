import { StyleSheet, Text, View } from "react-native";
import type { DrugOverview, EvidenceTier } from "@nemesis/shared";
import { Badge, Card, SectionHeader } from "./ui";
import { c, space, type } from "@/theme/tokens";

// AC9: "drug pages show score + rationale + counts + limitations". The four parts
// each get a testID so the gate asserts all of them. The tier is the deterministic
// §9 engine output (never model-derived); we only display it.

type EvidenceScore = NonNullable<DrugOverview["evidence_score"]>;

const TIER_TONE: Record<EvidenceTier, "strong" | "moderate" | "weak"> = {
  very_strong: "strong",
  strong: "strong",
  moderate: "moderate",
  weak: "weak",
  very_weak: "weak",
  unknown: "weak",
};

const COUNT_LABELS: Record<string, string> = {
  n_meta_analysis: "Meta-analyses",
  n_systematic_review: "Systematic reviews",
  n_rct: "RCTs",
  n_human_trials: "Human trials",
  n_observational: "Observational",
  n_preclinical_only: "Preclinical only",
  max_trial_phase: "Max trial phase",
};

export function EvidenceCard({ score }: { score: EvidenceScore }) {
  const counts = Object.entries(score.evidence_counts ?? {}).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  return (
    <View style={styles.wrap}>
      <SectionHeader title="Evidence" testID="section-evidence" />
      <Card testID="drug-evidence">
        <Badge
          label={String(score.score).replace(/_/g, " ")}
          tone={TIER_TONE[score.score] ?? "weak"}
          testID="evidence-score"
        />
        <Text style={styles.rationale} testID="evidence-rationale">
          {score.rationale}
        </Text>

        {counts.length > 0 ? (
          <View style={styles.counts} testID="evidence-counts">
            {counts.map(([k, v]) => (
              <Text key={k} style={styles.count}>
                {COUNT_LABELS[k] ?? k}: {String(v)}
              </Text>
            ))}
          </View>
        ) : null}

        {score.limitations?.length ? (
          <View style={styles.limitations} testID="evidence-limitations">
            <Text style={styles.limTitle}>Limitations</Text>
            {score.limitations.map((l, i) => (
              <Text key={i} style={styles.limItem}>
                • {l}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  rationale: { fontSize: type.small.fontSize, lineHeight: 21, color: c.text },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: space(3), marginTop: space(1) },
  count: { fontSize: type.micro.fontSize, color: c.text2 },
  limitations: { marginTop: space(1.5), gap: 3 },
  limTitle: { fontSize: type.micro.fontSize, fontWeight: "700", color: c.warn },
  limItem: { fontSize: type.micro.fontSize, color: c.text3 },
});
