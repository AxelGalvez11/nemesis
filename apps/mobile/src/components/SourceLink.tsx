import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { c, space, type } from "@/theme/tokens";

// The "cited" affordance. The Phase-2 acceptance is "renders label/trials/PubMed,
// all cited" — every evidence row carries a source_id, and this opens that row's
// doc-12 Source Viewer (get_source). Renders nothing when there is no source_id
// (the row is then visibly uncited rather than linking nowhere).
export function SourceLink({
  sourceId,
  label = "View source",
  testID,
}: {
  sourceId: string | null | undefined;
  label?: string;
  testID?: string;
}) {
  if (!sourceId) return null;
  return (
    <Pressable
      testID={testID}
      style={styles.link}
      onPress={() => router.push(`/source/${encodeURIComponent(sourceId)}`)}
    >
      <Text style={styles.linkText}>{label} →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: space(1), alignSelf: "flex-start" },
  linkText: { color: c.accentDim, fontSize: type.micro.fontSize, fontWeight: "600" },
});
