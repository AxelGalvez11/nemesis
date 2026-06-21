import { StyleSheet, Text, View } from "react-native";
import { c, radius, space, type } from "@/theme/tokens";

// The doc-20 safety surface. `emergency` is the deterministic urgent-care routing
// (call-911 copy from the ask pre-screen); `caution` flags a sensitive class
// (insulin / anticoagulant / …) without blocking the answer.
export function SafetyBanner({
  tone,
  title,
  body,
  testID,
}: {
  tone: "emergency" | "caution";
  title: string;
  body?: string;
  testID?: string;
}) {
  const em = tone === "emergency";
  return (
    <View style={[styles.banner, em ? styles.emergency : styles.caution]} testID={testID}>
      <Text style={[styles.title, em ? styles.titleEmergency : styles.titleCaution]}>
        {em ? "● " : "⚠ "}{title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.md, padding: space(3.25), gap: space(1.5), borderWidth: 1, borderLeftWidth: 3 },
  emergency: { backgroundColor: c.dangerFaint, borderColor: c.dangerLine, borderLeftColor: c.danger },
  caution: { backgroundColor: c.warnFaint, borderColor: c.warnLine, borderLeftColor: c.warn },
  title: { ...type.title, fontWeight: "700" },
  titleEmergency: { color: c.danger },
  titleCaution: { color: c.warn },
  body: { ...type.small, color: c.text2 },
});
