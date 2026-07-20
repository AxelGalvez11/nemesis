import { StyleSheet, Text, View } from "react-native";
import type { Comparison } from "@nemesis/shared";
import { Card, SectionHeader } from "./ui";
import { SourceLink } from "./SourceLink";
import { c, space, type } from "@/theme/tokens";

// AC8-adjacent: the doc-11 side-by-side. Six section groups + the union of both
// entities' cited sources (each opening the Source Viewer). The edge fn does the
// pairing; we render the strings/summaries it returns (never compute).

type SectionKey = keyof Comparison["sections"];
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "mechanism", label: "Mechanism" },
  { key: "approved_uses", label: "Approved uses" },
  { key: "evidence_strength", label: "Evidence strength" },
  { key: "trial_status", label: "Trial status" },
  { key: "safety", label: "Safety" },
  { key: "cost_access", label: "Cost / access" },
];

function sideText(key: SectionKey, v: unknown): string {
  if (v == null) return "—";
  switch (key) {
    case "mechanism":
    case "approved_uses":
      return typeof v === "string" ? v : "—";
    case "evidence_strength":
      return (v as { score?: string }).score?.replace(/_/g, " ") ?? "—";
    case "trial_status": {
      const t = v as { count: number; latest_status: string | null };
      return `${t.count} trial(s)${t.latest_status ? ` · ${t.latest_status}` : ""}`;
    }
    case "safety": {
      const s = v as { boxed_warning: string | null; key_warnings: string | null };
      if (s.boxed_warning) return "Boxed warning";
      return s.key_warnings ?? "—";
    }
    case "cost_access": {
      const c = v as { approved_status: string; price_points: number };
      return `${c.approved_status} · ${c.price_points} price point(s)`;
    }
  }
}

export function ComparisonView({ comparison }: { comparison: Comparison }) {
  const { left, right, sections, sources } = comparison;
  return (
    <View style={styles.wrap} testID="comparison-view">
      <View style={styles.header}>
        <Text style={styles.side} testID="compare-left">{left.name}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.side, styles.right]} testID="compare-right">{right.name}</Text>
      </View>

      {SECTIONS.map(({ key, label }) => (
        <Card key={key} testID={`compare-section-${key}`}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.pair}>
            <Text style={styles.cell} numberOfLines={6}>{sideText(key, sections[key]?.left ?? null)}</Text>
            <Text style={[styles.cell, styles.cellRight]} numberOfLines={6}>{sideText(key, sections[key]?.right ?? null)}</Text>
          </View>
        </Card>
      ))}

      {sources?.length ? (
        <View style={styles.section} testID="compare-sources">
          <SectionHeader title={`Sources (${sources.length})`} />
          {sources.map((s, i) => (
            <Card key={`${s.source_id}-${i}`} testID={`compare-source-${i}`}>
              <Text style={styles.srcTitle}>{s.title ?? s.provider}</Text>
              <SourceLink sourceId={s.source_id} testID={`compare-source-cite-${i}`} />
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(3) },
  header: { flexDirection: "row", alignItems: "center", gap: space(2.5) },
  side: { flex: 1, fontSize: type.bodyStrong.fontSize, fontWeight: "700", color: c.text },
  right: { textAlign: "right" },
  vs: { fontSize: type.micro.fontSize, color: c.text3 },
  section: { gap: space(1.5) },
  label: { fontSize: type.micro.fontSize, fontWeight: "700", color: c.text3, textTransform: "uppercase", letterSpacing: 0.4 },
  pair: { flexDirection: "row", gap: space(3) },
  cell: { flex: 1, fontSize: type.small.fontSize, lineHeight: 20, color: c.text },
  cellRight: { textAlign: "right" },
  srcTitle: { fontSize: type.small.fontSize, fontWeight: "600", color: c.text },
});
