import { Platform, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { exportMyData, type ExportBundle } from "@/api/account";
import { ErrorState } from "@/components/states";
import { Card } from "@/components/ui";
import { common } from "@/theme/common";

// Data export (AC10 / doc-18) — REAL: the export_my_data RPC returns the caller's own
// rows (auth.uid()-scoped). We show a summary + offer a JSON download (web) / the raw
// bundle. No background job; it's a single authenticated read of the user's own data.
export default function ExportScreen() {
  const exportData = useMutation({ mutationFn: exportMyData });

  return (
    <ScrollView contentContainerStyle={styles.body} testID="export-screen">
      <Text style={common.h1}>Export your data</Text>
      <Text style={common.body}>
        Download a copy of your PharmaBro data — your profile, health context, follows, saved reports, and asked questions.
      </Text>

      <Pressable
        testID="request-export"
        style={[common.btn, exportData.isPending && styles.disabled]}
        disabled={exportData.isPending}
        onPress={() => exportData.mutate()}
      >
        <Text style={common.btnText}>{exportData.isPending ? "Preparing…" : "Export my data"}</Text>
      </Pressable>

      {exportData.isError ? <ErrorState testID="export-error" body={(exportData.error as Error).message} /> : null}

      {exportData.data ? (
        <Card testID="export-ready">
          <Text style={styles.readyTitle}>Your export is ready.</Text>
          <Text style={common.sub} testID="export-summary">{summarize(exportData.data)}</Text>
          {Platform.OS === "web" ? (
            <Pressable testID="export-download" style={[common.btn, styles.downloadBtn]} onPress={() => download(exportData.data!)}>
              <Text style={common.btnText}>Download JSON</Text>
            </Pressable>
          ) : (
            <Text style={common.sub}>Open pharmabro.app on the web to download the file, or contact support.</Text>
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}

function summarize(b: ExportBundle): string {
  const counts = [
    `${b.watchlist?.length ?? 0} follows`,
    `${b.saved_reports?.length ?? 0} saved`,
    `${b.answers?.length ?? 0} answers`,
    b.health_context ? "health context" : "no health context",
  ];
  return `Includes: ${counts.join(" · ")}.`;
}

// Web: trigger a real file download. Native: a no-op placeholder (Share/expo-file-system
// is the device-checklist path — kept out of the bundle to avoid native-dep risk).
function download(bundle: ExportBundle): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pharmabro-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  disabled: { opacity: 0.5 },
  readyTitle: { fontSize: 16, fontWeight: "700", color: "#1f2933", marginBottom: 6 },
  downloadBtn: { marginTop: 12, alignSelf: "flex-start" },
});
