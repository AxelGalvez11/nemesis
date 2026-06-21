import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchSource } from "@/api/sources";
import { sourceViewState } from "@/api/derive";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState, NoSourceState, OutdatedState } from "@/components/states";
import { Card, Centered, Chip, SectionHeader } from "@/components/ui";
import { UUID_RE } from "@/lib/validation";
import { c, space } from "@/theme/tokens";

// The doc-12 Source Viewer (get_source). Reached from any citation (label / trial /
// pubmed "View source"). The doc-06 outdated state fires on !is_current — proven
// prop-driven (sourceViewState test) since the live corpus has 0 superseded sources.
export default function SourceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sourceId = String(id);
  const validId = UUID_RE.test(sourceId);
  const { session, loading: authLoading } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["source", sourceId],
    queryFn: () => fetchSource(sourceId),
    enabled: validId && !!session,
  });

  if (authLoading) {
    return <Centered testID="source-auth-loading"><ActivityIndicator color={c.acid} /></Centered>;
  }
  if (!session) {
    return (
      <Centered testID="source-auth-required">
        <Text style={styles.gate}>Sign in to view this source.</Text>
      </Centered>
    );
  }
  if (!validId) {
    return <NoSourceState testID="source-not-found" body="That source id is not valid." />;
  }
  if (isLoading) {
    return <Centered testID="source-loading"><ActivityIndicator color={c.acid} /></Centered>;
  }
  if (isError) {
    return <ErrorState testID="source-error" body={(error as Error).message} />;
  }

  const state = sourceViewState(data ?? null);
  if (state === "not-found" || !data) {
    return <NoSourceState testID="source-not-found" body="No source on file for this id." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.body} testID="source-screen">
      {state === "outdated" ? (
        <OutdatedState testID="source-outdated" body="A newer version of this source may exist." />
      ) : null}

      <Text style={styles.provider} testID="source-provider">
        {data.provider.toUpperCase()}
      </Text>
      <Text style={styles.title} testID="source-title">
        {data.title}
      </Text>
      {data.subtitle ? <Text style={styles.subtitle}>{data.subtitle}</Text> : null}

      <Card>
        <Row label="License" value={data.license} />
        <Row label="Attribution required" value={data.attribution_required ? "Yes" : "No"} />
        {data.published_at ? <Row label="Published" value={data.published_at.slice(0, 10)} /> : null}
        {data.retrieved_at ? <Row label="Retrieved" value={data.retrieved_at.slice(0, 10)} /> : null}
        <Row label="Current" value={data.is_current ? "Yes" : "No (superseded)"} />
      </Card>

      {data.sections?.length ? (
        <View style={styles.block}>
          <SectionHeader title="Sections covered" />
          <View style={styles.chipRow} testID="source-sections">
            {data.sections.map((s) => (
              <Chip key={s} label={s.replace(/_/g, " ")} />
            ))}
          </View>
        </View>
      ) : null}

      {data.url ? (
        <Pressable testID="source-url" style={styles.urlBtn} onPress={() => openExternal(data.url)}>
          <Text style={styles.urlText} numberOfLines={2}>
            Open original ↗ {data.url}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// Only follow http(s) links and swallow the rejection — defense-in-depth even though
// data.url comes from our own authenticated RPC (a hardcoded-https ingest column).
function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(3), backgroundColor: c.bg, flexGrow: 1 },
  gate: { color: c.text },
  provider: { fontSize: 12, fontWeight: "700", color: c.text3, letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: "700", color: c.text },
  subtitle: { fontSize: 15, color: c.text2 },
  block: { gap: space(2) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space(3) },
  rowLabel: { fontSize: 14, color: c.text3 },
  rowValue: { fontSize: 14, color: c.text, fontWeight: "600" },
  urlBtn: { paddingVertical: space(2.5) },
  urlText: { color: c.acidDim, fontSize: 14, fontWeight: "600" },
});
