import { StyleSheet, Text, View } from "react-native";
import type { DrugPubmed } from "@/api/types";
import { EmptyState } from "./states";
import { Card, SectionHeader } from "./ui";
import { SourceLink } from "./SourceLink";

// AC6: PubMed results shown, each cited. Title + journal + date; the abstract is
// truncated (full read happens at the cited source).

function year(d: string | null): string | null {
  return d ? d.slice(0, 4) : null;
}

export function PubmedList({ articles }: { articles: DrugPubmed[] }) {
  return (
    <View style={styles.wrap}>
      <SectionHeader title={`PubMed (${articles.length})`} testID="section-pubmed" />
      {articles.length === 0 ? (
        <EmptyState testID="pubmed-empty" title="No articles" body="No PubMed articles linked." />
      ) : (
        articles.map((a, i) => (
          <Card key={a.article_id} testID={`pubmed-${i}`}>
            <Text style={styles.title} numberOfLines={3}>
              {a.title ?? `PMID ${a.pmid ?? "?"}`}
            </Text>
            <Text style={styles.meta}>
              {[a.journal, year(a.publication_date)].filter(Boolean).join(" · ")}
            </Text>
            {a.abstract ? (
              <Text style={styles.abstract} numberOfLines={4}>
                {a.abstract}
              </Text>
            ) : null}
            <SourceLink sourceId={a.source_id} testID={`pubmed-cite-${i}`} />
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 15, fontWeight: "600", color: "#1f2933", lineHeight: 20 },
  meta: { fontSize: 13, color: "#6b7686", marginTop: 2 },
  abstract: { fontSize: 13, lineHeight: 19, color: "#3a4451", marginTop: 4 },
});
