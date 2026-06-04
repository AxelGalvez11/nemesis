import { StyleSheet, Text, View } from "react-native";

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
  return (
    <View style={[styles.banner, tone === "emergency" ? styles.emergency : styles.caution]} testID={testID}>
      <Text style={[styles.title, tone === "emergency" ? styles.titleEmergency : styles.titleCaution]}>
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: 16, gap: 6, borderWidth: 1 },
  emergency: { backgroundColor: "#fdecea", borderColor: "#e0573e" },
  caution: { backgroundColor: "#fdf6e3", borderColor: "#d8b24a" },
  title: { fontSize: 16, fontWeight: "800" },
  titleEmergency: { color: "#b02a16" },
  titleCaution: { color: "#7a5c12" },
  body: { fontSize: 14, lineHeight: 20, color: "#3a4451" },
});
