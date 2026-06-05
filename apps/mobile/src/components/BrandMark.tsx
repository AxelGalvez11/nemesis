import { StyleSheet, View } from "react-native";
import { teal, useTheme } from "@/theme";

// The PharmaOrb "orb" mark — a layered circle that reads as a glossy sphere without
// pulling in a gradient dependency: a primary disc, a lighter inner core, and a
// soft top-left highlight. Sized via the `size` prop; defaults suit a header.
export function BrandMark({ size = 56, testID }: { size?: number; testID?: string }) {
  const t = useTheme();
  const r = size / 2;
  return (
    <View
      testID={testID}
      style={[
        { width: size, height: size, borderRadius: r, backgroundColor: t.color.primary },
        styles.base,
        t.shadow.md,
      ]}
    >
      <View
        style={[
          styles.core,
          { width: size * 0.62, height: size * 0.62, borderRadius: (size * 0.62) / 2, backgroundColor: teal[300] },
        ]}
      />
      <View
        style={[
          styles.gloss,
          { width: size * 0.3, height: size * 0.3, borderRadius: (size * 0.3) / 2, top: size * 0.16, left: size * 0.18 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  core: { opacity: 0.45 },
  gloss: { position: "absolute", backgroundColor: "rgba(255,255,255,0.55)" },
});
