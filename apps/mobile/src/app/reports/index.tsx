import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchResearchReports, type ResearchReportSummary } from "@/api/reports";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyState, ErrorState, GuestState } from "@/components/states";
import { Card, SectionHeader } from "@/components/ui";
import { common } from "@/theme/common";
import { c, space } from "@/theme/tokens";

// Deep Research reports library (read-only). Lists the caller's saved reports (saved_reports,
// kind='deep_research', RLS-scoped) and opens each one. Reports are generated on the web app (the
// Pro multi-step research mode); the phone reads the saved deliverables.
export default function ReportsScreen() {
  const { session } = useAuth();
  const reports = useQuery({ queryKey: ["reports"], queryFn: fetchResearchReports, enabled: !!session });

  if (!session) {
    return (
      <View style={common.screen} testID="screen-reports">
        <Text style={common.h1}>Reports</Text>
        <GuestState body="Sign in to see your saved Deep Research reports." />
      </View>
    );
  }

  const items = reports.data ?? [];

  return (
    <ScrollView contentContainerStyle={styles.body} testID="screen-reports">
      <Text style={common.h1}>Reports</Text>

      {reports.isLoading ? (
        <ActivityIndicator testID="reports-loading" color={c.acid} />
      ) : reports.isError ? (
        <ErrorState testID="reports-error" body={(reports.error as Error).message} />
      ) : items.length === 0 ? (
        <EmptyState
          testID="reports-empty"
          title="No reports yet"
          body="Deep Research reports — multi-step, cited literature reviews — are generated in the web app. Once you save one, it shows up here to read on your phone."
        />
      ) : (
        <View style={styles.section}>
          <SectionHeader title={`Saved reports (${items.length})`} testID="reports-list" />
          {items.map((r, i) => (
            <ReportRow key={r.id} report={r} index={i} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ReportRow({ report, index }: { report: ResearchReportSummary; index: number }) {
  return (
    <Pressable testID={`report-${index}`} onPress={() => router.push(`/reports/${report.id}`)}>
      <Card testID={`report-card-${index}`}>
        <Text style={styles.title} numberOfLines={2} testID={`report-title-${index}`}>
          {report.title}
        </Text>
        <Text style={styles.meta}>
          {report.created_at ? report.created_at.slice(0, 10) : "—"} · {report.citation_count} source
          {report.citation_count === 1 ? "" : "s"}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(4), backgroundColor: c.bg, flexGrow: 1 },
  section: { gap: space(2) },
  title: { fontSize: 16, fontWeight: "600", color: c.text, lineHeight: 21 },
  meta: { fontSize: 12, color: c.text3, marginTop: 3 },
});
