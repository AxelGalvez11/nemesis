import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNx } from "@/theme/nx";
import { NX_ACCENTS, setNxAppearance, useNxAppearance, type NxNoteFont, type NxThemeChoice } from "@/components/nx/settings/appearance-store";
import { Sec, SettingsHeader } from "@/components/nx/settings/kit";

// Appearance (canvas artboard "Appearance"). Theme applies at once through
// Appearance.setColorScheme; accent and note font are stored in appearance-store.ts.

const WIDTHS = [60, 90, 75, 85, 50];
const FONTS: { id: NxNoteFont; label: string; family?: string }[] = [
  { id: "default", label: "Default" },
  { id: "serif", label: "Serif", family: "Georgia" },
  { id: "mono", label: "Mono", family: "Menlo" },
];

export default function AppearanceScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { theme, accent, font } = useNxAppearance();

  const setTheme = (t: NxThemeChoice) => setNxAppearance({ theme: t });
  const ring = (on: boolean) => (on ? { borderWidth: 2, borderColor: accent } : { borderWidth: 1, borderColor: c.ring });

  const tile = (t: NxThemeChoice, label: string) => {
    const on = theme === t;
    const dark = t === "dark";
    return (
      <Pressable key={t} onPress={() => setTheme(t)} style={styles.tileCol} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}>
        <View style={[styles.tile, { backgroundColor: dark ? "#191919" : "#ffffff" }, ring(on)]}>
          {WIDTHS.map((w, i) => (
            <View key={i} style={{ height: 8, width: `${w}%`, borderRadius: 4, backgroundColor: dark ? "rgba(255,255,255,0.14)" : "rgba(42,28,0,0.1)" }} />
          ))}
        </View>
        <Text style={{ color: c.t1, fontSize: 14, fontWeight: on ? "600" : "400" }}>{label}</Text>
      </Pressable>
    );
  };

  const systemOn = theme === "system";

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-appearance">
      <SettingsHeader title="Appearance" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Sec label="Theme" style={{ paddingHorizontal: 20, paddingBottom: 10 }} />
        <View style={styles.grid3}>
          {tile("light", "Light")}
          {tile("dark", "Dark")}
          <Pressable onPress={() => setTheme("system")} style={styles.tileCol} accessibilityRole="radio" accessibilityState={{ selected: systemOn }} accessibilityLabel="Match phone">
            <View style={[styles.tile, styles.split, ring(systemOn)]}>
              <View style={{ flex: 1, backgroundColor: "#ffffff", paddingTop: 12, paddingLeft: 10, gap: 7 }}>
                <View style={{ height: 8, width: "80%", borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: "rgba(42,28,0,0.1)" }} />
                <View style={{ height: 8, width: "100%", backgroundColor: "rgba(42,28,0,0.1)" }} />
              </View>
              <View style={{ flex: 1, backgroundColor: "#191919", paddingTop: 12, paddingRight: 10, gap: 7 }}>
                <View style={{ height: 8, width: "60%", backgroundColor: "rgba(255,255,255,0.14)" }} />
                <View style={{ height: 8, width: "100%", borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: "rgba(255,255,255,0.14)" }} />
              </View>
            </View>
            <Text style={{ color: c.t1, fontSize: 14, fontWeight: systemOn ? "600" : "400" }}>Match phone</Text>
          </Pressable>
        </View>

        <Sec label="Accent color" style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8 }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14 }}>
          {NX_ACCENTS.map((hex) => {
            const on = hex === accent;
            return (
              <Pressable
                key={hex}
                onPress={() => setNxAppearance({ accent: hex })}
                style={styles.swatchHit}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Accent ${hex}`}
              >
                {/* The chosen colour gets a dark ring with a gap (canvas Appearance), not a ring in its own colour. */}
                <View style={[styles.swatchRing, { borderColor: on ? c.t1 : "transparent" }]}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: hex }} />
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ paddingTop: 8, paddingHorizontal: 20, fontSize: 13, lineHeight: 18, color: c.t3 }}>
          Used on the send button and your own messages.
        </Text>

        <Sec label="Note font" style={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 8 }} />
        <View style={[styles.grid3, { gap: 10 }]}>
          {FONTS.map((f) => {
            const on = font === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setNxAppearance({ font: f.id })}
                style={[styles.font, ring(on)]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.label} font`}
              >
                <Text style={{ color: c.t1, fontSize: 24, fontFamily: f.family }}>Ag</Text>
                <Text style={{ color: c.t2, fontSize: 13, lineHeight: 18 }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  grid3: { flexDirection: "row", gap: 12, paddingHorizontal: 20 },
  tileCol: { flex: 1, alignItems: "center", gap: 8 },
  tile: { width: "100%", height: 150, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, gap: 7, overflow: "hidden" },
  split: { flexDirection: "row", paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  swatchHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  font: { flex: 1, height: 76, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 2 },
});
