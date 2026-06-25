import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchResearchReport } from "@/api/reports";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState } from "@/components/states";
import { Skeleton, SkeletonCard } from "@/components/Skeleton";
import { Badge, Card, Centered, SectionHeader } from "@/components/ui";
import { SourceLink } from "@/components/SourceLink";
import type { AnswerPoint } from "@pharmabro/shared";
import { c, space } from "@/theme/tokens";

// Pretty provider labels for citations (raw source_type codes read poorly — "pubmed_oa", "openfda").
const PROVIDER_LABEL: Record<string, string> = {
  pubmed: "PubMed",
  pubmed_oa: "PubMed",
  europepmc: "Europe PMC",
  clinicaltrials: "ClinicalTrials.gov",
  openfda: "FDA label",
  faers: "FAERS",
};
const providerLabel = (t: string | null): string => (t ? PROVIDER_LABEL[t] ?? t : "");
// Turn an enum-ish grade ("not_applicable") into prose ("not applicable"); the Badge capitalizes.
const prettyGrade = (g: string): string => g.replace(/_/g, " ");

// Read-only Deep Research report view (the saved ResearchReport payload). Mirrors the web report:
// bottom-line summary, what it researched, themed sections, honest uncertainties, prominent safety
// notes, and the full citation list (each tappable into the Source Viewer). Generation + .docx/.pptx
// export stay on web; the forest-plot chart is summarized as a note (full chart on web).
export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = String(id);
  const { session, loading: authLoading } = useAuth();

  const report = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => fetchResearchReport(reportId),
    enabled: !!session && !!reportId,
  });

  if (authLoading) {
    return <Centered testID="report-auth-loading"><ActivityIndicator color={c.acid} /></Centered>;
  }
  if (!session) {
    return <Centered testID="report-auth-required"><Text style={styles.gate}>Sign in to view this report.</Text></Centered>;
  }

  const r = report.data;

  return (
    <ScrollView contentContainerStyle={styles.body} testID="report-detail">
      <Pressable
        testID="report-back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/reports"))}
        style={styles.back}
      >
        <Text style={styles.backText}>‹ Reports</Text>
      </Pressable>

      {report.isLoading ? (
        <View style={{ gap: space(3) }} testID="report-loading">
          <Skeleton width="85%" height={22} />
          <Skeleton width="50%" height={14} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </View>
      ) : report.isError ? (
        <ErrorState testID="report-error" body={(report.error as Error).message} />
      ) : !r ? (
        <ErrorState testID="report-missing" body="This report could not be found." />
      ) : (
        <>
          <Text style={styles.question} testID="report-question">{r.question}</Text>
          <View style={styles.badgeRow}>
            {r.evidence_grade ? <Badge label={`Evidence: ${prettyGrade(r.evidence_grade)}`} tone="neutral" /> : null}
            <Badge label={r.claims_verified ? "Claims verified" : "Partly verified"} tone={r.claims_verified ? "strong" : "moderate"} />
          </View>

          {r.summary ? (
            <Card testID="report-summary">
              <Text style={styles.summaryLabel}>Bottom line</Text>
              <Text style={styles.summary}>{r.summary}</Text>
            </Card>
          ) : null}

          {r.sub_questions?.length ? (
            <View style={styles.section}>
              <SectionHeader title="What it researched" testID="report-subq" />
              {r.sub_questions.map((q, i) => (
                <Text key={i} style={styles.bullet}>• {q}</Text>
              ))}
            </View>
          ) : null}

          {r.sections?.map((s, i) => (
            <View key={i} style={styles.section}>
              <SectionHeader title={s.heading} testID={`report-section-${i}`} />
              {s.points?.map((p, j) => <PointText key={j} point={p} />)}
            </View>
          ))}

          {r.uncertainties?.length ? (
            <View style={styles.section}>
              <SectionHeader title="Where the evidence is uncertain" testID="report-uncertainties" />
              {r.uncertainties.map((p, j) => <PointText key={j} point={p} />)}
            </View>
          ) : null}

          {r.safety_notes?.length ? (
            <View testID="report-safety" style={styles.safety}>
              <Text style={styles.safetyLabel}>Safety</Text>
              {r.safety_notes.map((p, j) => (
                <Text key={j} style={styles.safetyText}>• {p.text}</Text>
              ))}
            </View>
          ) : null}

          {r.meta_analysis ? (
            <Text style={styles.metaNote} testID="report-meta-note">
              This report includes a computed meta-analysis. The full forest plot is available in the web app.
            </Text>
          ) : null}

          {r.citations?.length ? (
            <View style={styles.section}>
              <SectionHeader title={`Sources (${r.citations.length})`} testID="report-citations" />
              {r.citations.map((cit, i) => (
                <Card key={`${cit.source_id}-${i}`} testID={`citation-${i}`}>
                  <Text style={styles.citTitle} numberOfLines={3}>{cit.title ?? "(untitled source)"}</Text>
                  <Text style={styles.citMeta}>{[providerLabel(cit.source_type), cit.published_date?.slice(0, 10)].filter(Boolean).join(" · ")}</Text>
                  <SourceLink sourceId={cit.source_id} testID={`citation-link-${i}`} />
                </Card>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function PointText({ point }: { point: AnswerPoint }) {
  if (!point?.text) return null;
  return <Text style={styles.point}>• {point.text}</Text>;
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(4), backgroundColor: c.bg, flexGrow: 1 },
  back: { alignSelf: "flex-start" },
  backText: { color: c.acidDim, fontSize: 15, fontWeight: "600" },
  gate: { color: c.text2, fontSize: 15 },
  question: { fontSize: 21, fontWeight: "700", color: c.text, lineHeight: 27 },
  badgeRow: { flexDirection: "row", gap: space(2), flexWrap: "wrap" },
  section: { gap: space(2) },
  summaryLabel: { fontSize: 12, fontWeight: "700", color: c.acidDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  summary: { fontSize: 16, color: c.text, lineHeight: 23 },
  bullet: { fontSize: 14, color: c.text2, lineHeight: 21 },
  point: { fontSize: 15, color: c.text, lineHeight: 22 },
  safety: { borderColor: c.warnLine, borderWidth: 1, backgroundColor: c.warnFaint, borderRadius: 12, padding: space(4), gap: 2 },
  safetyLabel: { fontSize: 13, fontWeight: "700", color: c.warn, marginBottom: 4 },
  safetyText: { fontSize: 14, color: c.text, lineHeight: 21 },
  metaNote: { fontSize: 13, color: c.text3, fontStyle: "italic" },
  citTitle: { fontSize: 14, fontWeight: "600", color: c.text, lineHeight: 19 },
  citMeta: { fontSize: 12, color: c.text3, marginTop: 2, marginBottom: 4 },
});
