import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AnswerPoint, AskResponse, EvidenceGrade, SafetyFlag } from "@pharmabro/shared";
import { ANSWER_STALE_YEARS, answerFreshness, answerKind } from "@/api/derive";
import { Badge, Card, SectionHeader } from "./ui";
import { SafetyBanner } from "./SafetyBanner";
import { SourceLink } from "./SourceLink";

// Renders a frozen AskResponse (§8): the doc-20 structured answer, or a deterministic
// safety/refusal template. The render shape is chosen by the pure, unit-tested
// answerKind(); citations reuse the Source Viewer (source_id -> /source/[id]).

// Flags worth a caution banner (class sensitivity), excluding the hard-routing ones
// and the refusal signals (no_sources_found / drug_sourcing have their own copy).
const CAUTION_LABELS: Partial<Record<SafetyFlag, string>> = {
  medication_change_request: "medication change",
  controlled_substance: "controlled substance",
  psychiatric_medication: "psychiatric medication",
  anticoagulant: "anticoagulant",
  insulin: "insulin",
  immunosuppressant: "immunosuppressant",
  chemotherapy: "chemotherapy",
  research_use_peptide: "research-use peptide",
  pregnancy: "pregnancy",
  pediatric: "pediatric",
};

const GRADE_TONE: Partial<Record<EvidenceGrade, "strong" | "moderate" | "weak">> = {
  very_strong: "strong",
  strong: "strong",
  moderate: "moderate",
  weak: "weak",
  very_weak: "weak",
  unknown: "weak",
};

function PointList({ title, points, testID }: { title: string; points: AnswerPoint[]; testID: string }) {
  if (!points?.length) return null;
  return (
    <View style={styles.section} testID={testID}>
      <SectionHeader title={title} />
      {points.map((p, i) => (
        <Text key={i} style={styles.point} testID={`${testID}-point-${i}`}>
          • {p.text}
        </Text>
      ))}
    </View>
  );
}

export function AnswerView({
  answer,
  onAskFollowUp,
}: {
  answer: AskResponse;
  onAskFollowUp: (q: string) => void;
}) {
  const kind = answerKind(answer);

  // Deterministic urgent-care routing: the summary IS the call-911 copy; nothing else.
  if (kind === "emergency") {
    return (
      <View style={styles.wrap} testID="answer-view">
        <SafetyBanner
          tone="emergency"
          title="This could be urgent"
          body={answer.plain_english_summary}
          testID="answer-safety"
        />
      </View>
    );
  }

  const cautionFlags = answer.safety_flags.filter((f) => CAUTION_LABELS[f]);
  const sections = answer.answer_sections;
  const followUps = sections.questions_to_ask ?? [];
  const freshness = answerFreshness(answer, new Date());

  return (
    <View style={styles.wrap} testID="answer-view">
      {cautionFlags.length > 0 ? (
        <SafetyBanner
          tone="caution"
          title="Use caution — talk to a clinician"
          body={`This involves: ${cautionFlags.map((f) => CAUTION_LABELS[f]).join(", ")}.`}
          testID="answer-caution"
        />
      ) : null}

      <Card testID="answer-bottom-line">
        <Text style={styles.bottomLine}>{answer.plain_english_summary}</Text>
        {answer.evidence_grade !== "not_applicable" ? (
          <Badge
            label={`Evidence: ${answer.evidence_grade.replace(/_/g, " ")}`}
            tone={GRADE_TONE[answer.evidence_grade] ?? "weak"}
            testID="answer-grade"
          />
        ) : null}
      </Card>

      {freshness.stale ? (
        <View style={styles.freshness} testID="answer-freshness">
          <Text style={styles.freshnessText}>
            Some cited sources are over {ANSWER_STALE_YEARS} years old (oldest: {freshness.oldestDate}). Newer
            guidance may exist — open a source to check its date.
          </Text>
        </View>
      ) : null}

      {kind === "refused" ? (
        <Text style={styles.refused} testID="answer-refused">
          No source in the corpus directly supports this, so no answer was synthesized.
        </Text>
      ) : null}

      <PointList title="What we know" points={sections.what_we_know} testID="answer-section-what_we_know" />
      <PointList title="What we don't know" points={sections.what_we_do_not_know} testID="answer-section-unknown" />
      <PointList title="Safety notes" points={sections.safety_notes} testID="answer-section-safety_notes" />

      {followUps.length > 0 ? (
        <View style={styles.section} testID="answer-followups">
          <SectionHeader title="Questions to ask your clinician" />
          {followUps.map((q, i) => (
            <Pressable key={q} testID={`answer-followup-${i}`} style={styles.followUp} onPress={() => onAskFollowUp(q)}>
              <Text style={styles.followUpText}>{q} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {answer.citations?.length > 0 ? (
        <View style={styles.section} testID="answer-citations">
          <SectionHeader title={`Sources (${answer.citations.length})`} />
          {answer.citations.map((c, i) => (
            <Card key={`${c.source_id}-${i}`} testID={`answer-citation-${i}`}>
              <Text style={styles.citeTitle}>
                [{c.chunk_tag}] {c.title ?? c.source_type}
              </Text>
              <Text style={styles.citeMeta}>
                {[c.source_type, c.section, c.published_date].filter(Boolean).join(" · ")}
              </Text>
              <SourceLink sourceId={c.source_id} testID={`answer-cite-${i}`} />
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  section: { gap: 6 },
  bottomLine: { fontSize: 16, lineHeight: 23, color: "#1f2933", fontWeight: "500" },
  refused: { fontSize: 14, color: "#7a4a1e", fontStyle: "italic" },
  freshness: { backgroundColor: "#fff6e5", borderRadius: 8, padding: 10 },
  freshnessText: { fontSize: 13, lineHeight: 19, color: "#7a4a1e" },
  point: { fontSize: 14, lineHeight: 21, color: "#3a4451" },
  followUp: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eceff3" },
  followUpText: { fontSize: 14, color: "#208AEF", fontWeight: "600" },
  citeTitle: { fontSize: 14, fontWeight: "600", color: "#1f2933" },
  citeMeta: { fontSize: 12, color: "#6b7686" },
});
