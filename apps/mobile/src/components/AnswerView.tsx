import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import type { AnswerPoint, AskResponse, EvidenceGrade, SafetyFlag } from "@pharmabro/shared";
import { ANSWER_STALE_YEARS, answerFreshness, answerKind } from "@/api/derive";
import { reportAnswer } from "@/api/report";
import { Badge, Card, SectionHeader } from "./ui";
import { SafetyBanner } from "./SafetyBanner";
import { SourceLink } from "./SourceLink";
import { c, radius, space, type } from "@/theme/tokens";

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

// "What we know" as flowing prose, NOT a • fact dump: every point runs together in one paragraph, each
// claim followed by its source number(s) inline as a tappable marker that opens the Source Viewer — the
// "natural conversation with sources" the owner asked for (parity with the web superscript chips). This
// is a PURE DISPLAY change: the engine still emits discrete, individually-cited points, so per-sentence
// citation grounding and per-sentence safety-salvage granularity are unchanged. Safety + uncertainty
// deliberately stay their own bulleted blocks (PointList) so cautions don't dissolve into the prose.
function ProseBody({ points, tagToSource }: { points: AnswerPoint[]; tagToSource: Map<string, string> }) {
  if (!points?.length) return null;
  return (
    <View style={styles.section} testID="answer-section-what_we_know">
      <SectionHeader title="What we know" />
      <Text style={styles.prose} testID="answer-prose-what_we_know">
        {points.map((p, pi) => (
          <Text key={pi}>
            {pi > 0 ? "  " : ""}
            {p.text}
            {(p.citation_ids ?? []).map((id) => {
              const tag = id.replace(/[[\]\s]/g, "");
              const sourceId = tagToSource.get(tag);
              if (!sourceId) return null; // unresolved tag → no dead tap (enforced tags always resolve)
              return (
                <Text
                  key={id}
                  style={styles.cite}
                  accessibilityRole="link"
                  accessibilityLabel={`Source ${tag}`}
                  testID={`answer-cite-inline-${tag}`}
                  onPress={() => router.push(`/source/${encodeURIComponent(sourceId)}`)}
                >
                  {` ${tag}`}
                </Text>
              );
            })}
          </Text>
        ))}
      </Text>
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
  // Each [n] tag -> its source row, so an inline citation marker opens that source. Built from the
  // enforced citations, so every kept point's tag resolves (an unknown tag renders as plain text).
  const tagToSource = new Map(answer.citations.map((cit) => [cit.chunk_tag, cit.source_id] as const));
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

      <ProseBody points={sections.what_we_know} tagToSource={tagToSource} />
      <PointList title="What we don't know" points={sections.what_we_do_not_know} testID="answer-section-unknown" />
      {/* Safety notes block intentionally NOT rendered (owner 2026-06-21: "reads like fluff"). RENDER-ONLY:
          safety_notes are still safety-scanned server-side and stored; the emergency 911 routing and the
          class-caution banner (above) stay. Restore this PointList from git to bring it back. */}

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

      <ReportAnswer answerId={answer.answer_id} />
    </View>
  );
}

// §11 user-facing report: flags THIS answer (own-row) for the operator review queue.
function ReportAnswer({ answerId }: { answerId: string }) {
  const report = useMutation({ mutationFn: () => reportAnswer(answerId) });
  if (report.isSuccess) {
    return (
      <Text style={styles.reportDone} testID="report-answer-done">
        Reported — thanks. We'll review this answer.
      </Text>
    );
  }
  if (report.isError) {
    return (
      <Text style={styles.reportErr} testID="report-answer-error">
        Couldn't report — please try again.
      </Text>
    );
  }
  return (
    <Pressable testID="report-answer" style={styles.reportBtn} disabled={report.isPending} onPress={() => report.mutate()}>
      <Text style={styles.reportText}>{report.isPending ? "Reporting…" : "⚑ Report this answer"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(3) },
  section: { gap: space(1.5) },
  bottomLine: { fontSize: 16, lineHeight: 24, color: c.text, fontWeight: "500" },
  refused: { ...type.small, color: c.text3, fontStyle: "italic" },
  freshness: { backgroundColor: c.warnFaint, borderWidth: 1, borderColor: c.warnLine, borderRadius: radius.sm, padding: space(2.5) },
  freshnessText: { fontSize: 13, lineHeight: 19, color: c.warn },
  point: { fontSize: 14.5, lineHeight: 22, color: c.text2 },
  prose: { fontSize: 15, lineHeight: 23, color: c.text2 },
  cite: { fontSize: 11, lineHeight: 23, color: c.accentDim, fontWeight: "700" },
  followUp: { paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: c.line },
  followUpText: { fontSize: 14, color: c.accentDim, fontWeight: "600" },
  citeTitle: { fontSize: 14, fontWeight: "600", color: c.text },
  citeMeta: { fontSize: 12, color: c.text3 },
  reportBtn: { paddingVertical: space(2.5), alignSelf: "flex-start" },
  reportText: { fontSize: 13, color: c.text3, fontWeight: "600" },
  reportDone: { fontSize: 13, color: c.good, fontWeight: "600", paddingVertical: space(2.5) },
  reportErr: { fontSize: 13, color: c.danger, fontWeight: "600", paddingVertical: space(2.5) },
});
