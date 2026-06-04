import { StyleSheet, Text, View } from "react-native";
import type { LabelDoc } from "@/api/types";
import { EmptyState } from "./states";
import { Card, SectionHeader } from "./ui";
import { SourceLink } from "./SourceLink";

// AC4: approved drugs show FDA/DailyMed label sections. extracted_sections is a flat
// key->prose map (verified against openFDA). We render the clinically-ordered keys
// that are present, then append any unknown keys (never silently dropping content),
// each label carrying its citation (all cited).

const ORDER = [
  "boxed_warning",
  "indications",
  "dosage_and_administration",
  "contraindications",
  "warnings",
  "adverse_reactions",
  "drug_interactions",
  "pregnancy_lactation",
  "pediatric_use",
  "geriatric_use",
  "renal_hepatic",
  "specific_populations",
  "mechanism_of_action",
  "pharmacokinetics",
  "clinical_pharmacology",
  "patient_counseling",
  "description",
] as const;

function title(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Section keys in clinical order first, then any leftover keys (alpha). */
function orderedKeys(sections: Record<string, string>): string[] {
  const present = new Set(Object.keys(sections));
  const known = ORDER.filter((k) => present.has(k));
  const extra = [...present].filter((k) => !ORDER.includes(k as (typeof ORDER)[number])).sort();
  return [...known, ...extra];
}

export function LabelSections({ labels }: { labels: LabelDoc[] }) {
  return (
    <View style={styles.wrap}>
      <SectionHeader title="Label" testID="section-label" />
      {labels.length === 0 ? (
        <EmptyState testID="label-empty" title="No label" body="No FDA/DailyMed label on file." />
      ) : (
        labels.map((doc, di) => {
          const keys = orderedKeys(doc.extracted_sections);
          return (
            <Card key={doc.label_id} testID={`label-doc-${di}`}>
              {doc.provider ? <Text style={styles.provider}>{doc.provider.toUpperCase()}</Text> : null}
              {keys.map((k) => (
                <View key={k} style={styles.section} testID={`label-section-${k}`}>
                  <Text style={styles.secTitle}>{title(k)}</Text>
                  <Text style={styles.secBody} numberOfLines={8}>
                    {doc.extracted_sections[k]}
                  </Text>
                </View>
              ))}
              <SourceLink sourceId={doc.source_id} testID={`label-cite-${di}`} />
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  provider: { fontSize: 12, fontWeight: "700", color: "#6b7686", letterSpacing: 0.5 },
  section: { gap: 2, marginTop: 6 },
  secTitle: { fontSize: 15, fontWeight: "700", color: "#1f2933" },
  secBody: { fontSize: 14, lineHeight: 20, color: "#3a4451" },
});
