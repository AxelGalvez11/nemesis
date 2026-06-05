import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { AGE_TOS_ACK } from "@/lib/legal";
import { radius, space, type, useTheme } from "@/theme";

// doc-18 age gate: an 18+ / Terms+Privacy attestation that gates entry. Shared by
// sign-in and sign-up so the legal copy + testIDs (age-ack, link-terms,
// link-privacy) stay identical across both. The phase gates click `age-ack`.
export function AgeGate({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="age-ack"
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I am 18 or older and agree to the Terms and Privacy Policy"
        style={styles.row}
        onPress={onToggle}
      >
        <View
          style={[
            styles.box,
            { borderColor: checked ? t.color.primary : t.color.borderStrong },
            checked && { backgroundColor: t.color.primary },
          ]}
        >
          {checked ? <Text style={[styles.tick, { color: t.color.inverseText }]}>✓</Text> : null}
        </View>
        <Text style={[type.bodySm, { color: t.color.textMuted, flex: 1 }]}>{AGE_TOS_ACK}</Text>
      </Pressable>
      <View style={styles.links}>
        <Link testID="link-terms" href="/profile/legal?doc=terms" style={[type.bodySm, { color: t.color.primary }]}>
          Terms
        </Link>
        <Text style={{ color: t.color.textSubtle }}>·</Text>
        <Link testID="link-privacy" href="/profile/legal?doc=privacy" style={[type.bodySm, { color: t.color.primary }]}>
          Privacy Policy
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  box: { width: 24, height: 24, borderRadius: radius.sm - 2, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tick: { fontSize: 14, fontWeight: "700", lineHeight: 16 },
  links: { flexDirection: "row", alignItems: "center", gap: space[2], paddingLeft: 24 + 12 },
});
